import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { parsePatch, type StructuredPatch } from "diff";
import { requestPermission } from "../core/agent";
import { assertSafePath, LIMITS, isBinaryFileSync } from "./guards";

// ─── Schema ──────────────────────────────────────────────────────────────────

export const ApplyPatchSchema = z.object({
  patch: z.string().min(1).describe(
    "Standard unified diff string (--- and +++ headers required)"
  ),
  dryRun: z.boolean().optional().default(false).describe(
    "If true, validates and reports what would change without writing to disk"
  ),
});

export type ApplyPatchInput = z.infer<typeof ApplyPatchSchema>;

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface PatchResult {
  path: string;
  status: "APPLIED" | "FAILED" | "DRY_RUN";
  hunks?: number;
  linesChanged?: number;
  error?: string;
}

export interface ApplyPatchOutput {
  success: true;
  dryRun: boolean;
  patches: PatchResult[];
  hunks?: import("diff").StructuredPatchHunk[];
  hints?: string[];
}

export interface ApplyPatchError {
  success: false;
  error: string;
  path?: string;
  hints?: string[];
}

export type ApplyPatchResult = ApplyPatchOutput | ApplyPatchError;

// ─── Path Helpers ─────────────────────────────────────────────────────────────

function getRealPath(fileName: string | undefined): string | null {
  if (!fileName || fileName === "/dev/null") return null;
  // Strip leading a/ or b/ but handle absolute paths and edge cases
  const trimmed = fileName.trim();
  if (trimmed.startsWith("a/") || trimmed.startsWith("b/")) {
    const stripped = trimmed.substring(2);
    // Prevent stripping to empty or absolute escape like /etc
    if (!stripped || stripped.startsWith("/")) return stripped || null;
    return stripped;
  }
  // Handle quoted paths (diff may quote)
  return trimmed.replace(/^"|"$/g, "");
}

// ─── Hunk Application ────────────────────────────────────────────────────────

function applyHunk(
  fileLines: string[],
  hunk: StructuredPatch["hunks"][0],
  offset: number
): {
  success: boolean;
  newLines: string[];
  linesChanged: number;
  matchDrift: number;
  error?: string;
} {
  const targetStart = hunk.oldStart - 1 + offset;

  const expectedOld: string[] = [];
  const newLinesToAdd: string[] = [];

  for (const line of hunk.lines) {
    if (line.startsWith("-")) {
      expectedOld.push(line.substring(1));
    } else if (line.startsWith("+")) {
      newLinesToAdd.push(line.substring(1));
    } else if (line.startsWith(" ")) {
      expectedOld.push(line.substring(1));
      newLinesToAdd.push(line.substring(1));
    }
  }

  let matchIndex = -1;
  const MAX_DRIFT = 15;

  const checkMatch = (startIdx: number): boolean => {
    if (startIdx < 0 || startIdx + expectedOld.length > fileLines.length) {
      return false;
    }
    for (let i = 0; i < expectedOld.length; i++) {
      if (fileLines[startIdx + i] !== expectedOld[i]) return false;
    }
    return true;
  };

  if (checkMatch(targetStart)) {
    matchIndex = targetStart;
  } else {
    outer: for (let drift = 1; drift <= MAX_DRIFT; drift++) {
      for (const dir of [-1, 1]) {
        const candidate = targetStart + drift * dir;
        if (checkMatch(candidate)) {
          matchIndex = candidate;
          break outer;
        }
      }
    }
  }

  if (matchIndex === -1) {
    // Provide context preview for error
    const contextStart = Math.max(0, targetStart - 2);
    const contextEnd = Math.min(fileLines.length, targetStart + 3);
    const contextPreview = fileLines.slice(contextStart, contextEnd).map((l, idx) => {
      const lineNum = contextStart + idx + 1;
      return `${lineNum}: ${l.slice(0, 120)}`;
    }).join("\n");

    return {
      success: false,
      newLines: fileLines,
      linesChanged: 0,
      matchDrift: 0,
      error:
        `Could not find matching context near line ${hunk.oldStart} (attempted ${targetStart + 1} with drift ±${MAX_DRIFT}). ` +
        `File may have changed.\n\nExpected:\n${expectedOld.slice(0, 5).join("\n")}\n\nActual near location:\n${contextPreview}`,
    };
  }

  const before = fileLines.slice(0, matchIndex);
  const after = fileLines.slice(matchIndex + expectedOld.length);
  const linesChanged = Math.max(expectedOld.length, newLinesToAdd.length);
  const matchDrift = matchIndex - targetStart;

  return {
    success: true,
    newLines: [...before, ...newLinesToAdd, ...after],
    linesChanged,
    matchDrift,
  };
}

// ─── Main Function ────────────────────────────────────────────────────────────

export async function applyPatch(
  input: ApplyPatchInput
): Promise<ApplyPatchResult> {
  // Guard against huge patch
  if (Buffer.byteLength(input.patch, "utf-8") > 2 * 1024 * 1024) {
    return {
      success: false,
      error: "Patch too large (>2MB). Split into smaller patches.",
      hints: ["Apply changes in smaller chunks, 1-3 files at a time."],
    };
  }

  let parsed: StructuredPatch[];
  try {
    parsed = parsePatch(input.patch);
  } catch (e: any) {
    return {
      success: false,
      error: `Failed to parse patch: ${e.message}`,
      hints: [
        "Ensure patch uses standard unified diff format.",
        "Each file section must start with --- and +++ lines.",
        "Hunk headers must follow @@ -L,S +L,S @@ format.",
      ],
    };
  }

  if (!parsed || parsed.length === 0) {
    return {
      success: false,
      error: "Empty or invalid patch — no file diffs found.",
      hints: [
        "Check that patch includes at least one --- / +++ block.",
        "Example:\n--- a/src/file.ts\n+++ b/src/file.ts\n@@ -1,3 +1,4 @@\n context\n+new line\n context",
      ],
    };
  }

  if (parsed.length > LIMITS.MAX_PATCH_FILES) {
    return {
      success: false,
      error: `Patch contains ${parsed.length} files, exceeds limit ${LIMITS.MAX_PATCH_FILES}.`,
      hints: ["Split patch into smaller chunks, max 10 files at a time."],
    };
  }

  const totalHunks = parsed.reduce((acc, f) => acc + f.hunks.length, 0);
  if (totalHunks > LIMITS.MAX_PATCH_HUNKS) {
    return {
      success: false,
      error: `Patch contains ${totalHunks} hunks, exceeds limit ${LIMITS.MAX_PATCH_HUNKS}.`,
      hints: ["Break refactor into smaller steps."],
    };
  }

  const patches: PatchResult[] = [];
  const fileOperations: Array<{
    resolvedPath: string;
    originalPath: string;
    newContent: string | null;
    isDelete: boolean;
  }> = [];

  for (const fileDiff of parsed) {
    const oldPath = getRealPath(fileDiff.oldFileName);
    const newPath = getRealPath(fileDiff.newFileName);
    const targetPath = newPath ?? oldPath;

    if (!targetPath) continue;

    // Safe path validation
    const safe = assertSafePath(targetPath);
    if (safe.error) {
      return {
        success: false,
        error: `Blocked: ${safe.error}`,
        path: targetPath,
        hints: ["Patch target must be inside project root and not protected."],
      };
    }
    const resolved = safe.resolved;

    const isDelete = fileDiff.newFileName === "/dev/null";
    const isCreate = fileDiff.oldFileName === "/dev/null";

    if (!isCreate && isBinaryFileSync(resolved)) {
      patches.push({
        path: targetPath,
        status: "FAILED",
        error: "Cannot patch binary file",
      });
      continue;
    }

    if (isDelete) {
      if (!fs.existsSync(resolved)) {
        patches.push({
          path: targetPath,
          status: "FAILED",
          error: "File does not exist for deletion",
        });
        continue;
      }
      fileOperations.push({ resolvedPath: resolved, originalPath: targetPath, newContent: null, isDelete: true });
      patches.push({ path: targetPath, status: "APPLIED", hunks: 0, linesChanged: 0 });
      continue;
    }

    let fileLines: string[] = [];
    if (!isCreate) {
      if (!fs.existsSync(resolved)) {
        patches.push({
          path: targetPath,
          status: "FAILED",
          error: "File does not exist",
        });
        continue;
      }
      const content = fs.readFileSync(resolved, "utf-8");
      fileLines = content.split("\n");
    }

    let offset = 0;
    let totalLinesChanged = 0;
    let hunkCount = 0;
    let fileFailed = false;
    let fileLinesWorking = fileLines;

    for (const hunk of fileDiff.hunks) {
      const result = applyHunk(fileLinesWorking, hunk, offset);

      if (!result.success) {
        patches.push({
          path: targetPath,
          status: "FAILED",
          error: result.error,
          hunks: hunkCount,
          linesChanged: totalLinesChanged,
        });
        fileFailed = true;
        break;
      }

      fileLinesWorking = result.newLines;
      // Fix offset: include drift + line delta
      offset += result.matchDrift + (hunk.newLines - hunk.oldLines);
      totalLinesChanged += result.linesChanged;
      hunkCount++;
    }

    if (!fileFailed) {
      const newContentStr = fileLinesWorking.join("\n");
      // Size check
      if (Buffer.byteLength(newContentStr, "utf-8") > LIMITS.MAX_WRITE_BYTES) {
        patches.push({
          path: targetPath,
          status: "FAILED",
          error: `Resulting file too large >${(LIMITS.MAX_WRITE_BYTES / 1024 / 1024).toFixed(0)}MB`,
        });
        continue;
      }

      fileOperations.push({
        resolvedPath: resolved,
        originalPath: targetPath,
        newContent: newContentStr,
        isDelete: false,
      });
      patches.push({
        path: targetPath,
        status: "APPLIED",
        hunks: hunkCount,
        linesChanged: totalLinesChanged,
      });
    }
  }

  if (fileOperations.length === 0 && patches.length === 0) {
    return {
      success: false,
      error: "Patch parsed but no valid file operations found.",
      hints: [
        "Ensure patch includes valid file paths in --- and +++ headers.",
        "Required: --- a/src/file.ts, +++ b/src/file.ts, @@ -1,3 +1,4 @@",
      ],
    };
  }

  const anyApplied = patches.some(p => p.status === "APPLIED");
  if (!anyApplied && !input.dryRun) {
    const failedDetails = patches.map(p => `${p.path}: ${p.error}`).join("\n");
    return {
      success: false,
      error: `All ${patches.length} file patch(es) failed. No changes made.\n${failedDetails}`,
      hints: [
        "Read each file again with read_file to get current content.",
        "Regenerate patch against current content.",
        "Use dryRun: true to validate before applying.",
      ],
    };
  }

  if (input.dryRun) {
    const dryRunPatches = patches.map(p => ({
      ...p,
      status: "DRY_RUN" as const,
    }));
    return {
      success: true,
      dryRun: true,
      patches: dryRunPatches,
      hints: [
        "Dry run complete. No files modified.",
        "Remove dryRun: true to apply changes.",
        ...patches.filter(p => p.status === "FAILED").map(p => `FAILED ${p.path}: ${p.error}`),
      ],
    };
  }

  const appliedPatches = patches.filter(p => p.status === "APPLIED");
  const failedPatches = patches.filter(p => p.status === "FAILED");

  const permissionDetails = [
    ...appliedPatches.map(
      (p) => `APPLIED: ${p.path} (${p.hunks ?? 0} hunks, ~${p.linesChanged ?? 0} lines)`
    ),
    ...failedPatches.map(p => `FAILED: ${p.path} — ${p.error}`),
  ];

  const approved = await requestPermission(
    "apply_patch",
    `Apply patch to ${appliedPatches.length} file${appliedPatches.length !== 1 ? "s" : ""}${failedPatches.length ? ` (${failedPatches.length} failed)` : ""}`,
    permissionDetails
  );

  if (!approved) {
    return {
      success: false,
      error: "User denied patch application.",
      hints: ["Use dryRun: true to preview without approval."],
    };
  }

  // Write validated ops only, atomic
  for (const op of fileOperations) {
    if (op.isDelete) {
      fs.rmSync(op.resolvedPath, { force: true });
    } else {
      fs.mkdirSync(path.dirname(op.resolvedPath), { recursive: true });
      const tmp = `${op.resolvedPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      fs.writeFileSync(tmp, op.newContent!, "utf-8");
      fs.renameSync(tmp, op.resolvedPath);
    }
  }

  return {
    success: true,
    dryRun: false,
    patches,
    hunks: parsed ? parsed.flatMap((p) => p.hunks) : undefined,
    hints:
      appliedPatches.length > 1
        ? [
            `Applied ${appliedPatches.length} file(s), ${failedPatches.length} failed. Run tests to verify.`,
            ...failedPatches.map(f => `Failed ${f.path}: ${f.error}`),
          ]
        : failedPatches.length > 0
          ? failedPatches.map(f => `Failed ${f.path}: ${f.error}`)
          : undefined,
  };
}
