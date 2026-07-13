import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { parsePatch, type StructuredPatch } from "diff";
import { requestPermission } from "../core/agent";

// ─── Schema ──────────────────────────────────────────────────────────────────

export const ApplyPatchSchema = z.object({
  patch: z.string().describe(
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

// ─── Protected Paths ──────────────────────────────────────────────────────────

const PROTECTED_DIRS = [
  "node_modules", ".git", ".next", ".nuxt",
  "dist", "build", ".venv", "venv",
  "__pycache__", ".cache",
];

function isProtectedPath(resolvedPath: string): boolean {
  const normalized = resolvedPath.replace(/\\/g, "/");
  return PROTECTED_DIRS.some((dir) =>
    new RegExp(`(^|/)${dir}(/|$)`).test(normalized)
  );
}

// ─── Path Helpers ─────────────────────────────────────────────────────────────

function getRealPath(fileName: string | undefined): string | null {
  if (!fileName || fileName === "/dev/null") return null;
  if (fileName.startsWith("a/") || fileName.startsWith("b/")) {
    return fileName.substring(2);
  }
  return fileName;
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
    // Lines starting with \ (no newline at end of file) are intentionally skipped
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
    return {
      success: false,
      newLines: fileLines,
      linesChanged: 0,
      error:
        `Could not find matching context near line ${hunk.oldStart}. ` +
        `The file may have changed since the patch was generated.`,
    };
  }

  const before = fileLines.slice(0, matchIndex);
  const after = fileLines.slice(matchIndex + expectedOld.length);
  const linesChanged =
    Math.abs(expectedOld.length - newLinesToAdd.length) +
    Math.min(expectedOld.length, newLinesToAdd.length);

  return {
    success: true,
    newLines: [...before, ...newLinesToAdd, ...after],
    linesChanged,
  };
}

// ─── Main Function ────────────────────────────────────────────────────────────

export async function applyPatch(
  input: ApplyPatchInput
): Promise<ApplyPatchResult> {
  // ── Parse ─────────────────────────────────────────────────────────────────

  let parsed: StructuredPatch[];
  try {
    parsed = parsePatch(input.patch);
  } catch (e: any) {
    return {
      success: false,
      error: `Failed to parse patch: ${e.message}`,
      hints: [
        "Ensure your patch uses standard unified diff format.",
        "Each file section must start with --- and +++ lines.",
        "Hunk headers must follow the @@ -L,S +L,S @@ format.",
      ],
    };
  }

  if (!parsed || parsed.length === 0) {
    return {
      success: false,
      error: "Empty or invalid patch — no file diffs found.",
      hints: [
        "Check that the patch string includes at least one --- / +++ block.",
        "Example:\n--- a/src/file.ts\n+++ b/src/file.ts\n@@ -1,3 +1,4 @@\n context\n+new line\n context",
      ],
    };
  }

  // ── Validate all operations first (nothing written yet) ───────────────────

  const patches: PatchResult[] = [];
  const fileOperations: Array<{
    resolvedPath: string;
    newContent: string | null;
    isDelete: boolean;
  }> = [];

  for (const fileDiff of parsed) {
    const oldPath = getRealPath(fileDiff.oldFileName);
    const newPath = getRealPath(fileDiff.newFileName);
    const targetPath = newPath ?? oldPath;

    if (!targetPath) continue;

    const resolved = path.resolve(process.cwd(), targetPath);

    if (isProtectedPath(resolved)) {
      return {
        success: false,
        error: `Blocked: Cannot patch protected path '${targetPath}'.`,
        path: targetPath,
        hints: ["Protected directories cannot be modified by apply_patch."],
      };
    }

    const isDelete = fileDiff.newFileName === "/dev/null";
    const isCreate = fileDiff.oldFileName === "/dev/null";

    // ── Deletion ─────────────────────────────────────────────────────────────

    if (isDelete) {
      if (!fs.existsSync(resolved)) {
        patches.push({
          path: targetPath,
          status: "FAILED",
          error: "File does not exist",
        });
        continue;
      }
      fileOperations.push({ resolvedPath: resolved, newContent: null, isDelete: true });
      patches.push({ path: targetPath, status: "APPLIED", hunks: 0, linesChanged: 0 });
      continue;
    }

    // ── Creation or modification ──────────────────────────────────────────────

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

    // ── Apply hunks ───────────────────────────────────────────────────────────

    let offset = 0;
    let totalLinesChanged = 0;
    let hunkCount = 0;
    let fileFailed = false;

    for (const hunk of fileDiff.hunks) {
      const result = applyHunk(fileLines, hunk, offset);

      if (!result.success) {
        patches.push({
          path: targetPath,
          status: "FAILED",
          error: result.error,
          hunks: hunkCount,
          linesChanged: totalLinesChanged,
        });
        fileFailed = true;
        break; // Stop processing hunks — do not partially apply
      }

      fileLines = result.newLines;
      offset += hunk.newLines - hunk.oldLines;
      totalLinesChanged += result.linesChanged;
      hunkCount++;
    }

    if (!fileFailed) {
      fileOperations.push({
        resolvedPath: resolved,
        newContent: fileLines.join("\n"),
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

  // ── Guard: malformed patch headers — parsePatch succeeded but found nothing

  if (fileOperations.length === 0 && patches.length === 0) {
    return {
      success: false,
      error: "Patch parsed successfully but no valid file operations were found.",
      hints: [
        "Ensure your patch includes valid file paths in the --- and +++ headers.",
        "Required format:\n--- a/src/file.ts\n+++ b/src/file.ts\n@@ -1,3 +1,4 @@",
      ],
    };
  }

  // ── Guard: all files failed — report without hitting permission gate ───────

  const anyApplied = patches.some(p => p.status === "APPLIED");
  if (!anyApplied && !input.dryRun) {
    return {
      success: false,
      error: `All ${patches.length} file patch(es) failed. No changes were made.`,
      hints: [
        "Read each file again with read_file to get its current content.",
        "Regenerate the patch against the current content.",
        "Use dryRun: true to validate before applying.",
      ],
    };
  }

  // ── Dry run — report without writing ──────────────────────────────────────

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
        "Dry run complete. No files were modified.",
        "Remove dryRun: true and call apply_patch again to apply changes.",
      ],
    };
  }

  // ── Permission gate ───────────────────────────────────────────────────────

  const appliedPatches = patches.filter(p => p.status === "APPLIED");
  const permissionDetails = appliedPatches.map(
    (p) =>
      `APPLIED: ${p.path} ` +
      `(${p.hunks ?? 0} hunk${p.hunks !== 1 ? "s" : ""}, ~${p.linesChanged ?? 0} lines)`
  );

  const approved = await requestPermission(
    "apply_patch",
    `Apply patch to ${appliedPatches.length} file${appliedPatches.length !== 1 ? "s" : ""}`,
    permissionDetails
  );

  if (!approved) {
    return {
      success: false,
      error: "User denied patch application.",
      hints: ["Use dryRun: true to preview changes without requiring approval."],
    };
  }

  // ── Write — validated operations only ────────────────────────────────────

  for (const op of fileOperations) {
    if (op.isDelete) {
      fs.rmSync(op.resolvedPath, { force: true });
    } else {
      fs.mkdirSync(path.dirname(op.resolvedPath), { recursive: true });
      fs.writeFileSync(op.resolvedPath, op.newContent!, "utf-8");
    }
  }

  return {
    success: true,
    dryRun: false,
    patches,
    hunks: parsed ? parsed.flatMap((p) => p.hunks) : undefined,
    hints:
      appliedPatches.length > 1
        ? ["All files patched successfully. Run your tests to verify the changes."]
        : undefined,
  };
}