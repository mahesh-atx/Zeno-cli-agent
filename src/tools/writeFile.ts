import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { askPermission } from "../core/permissions";
import { getPatchFromContents } from "../utils/diff";
import { assertSafePath, checkFileSize, LIMITS } from "./guards";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const WriteFileSchema = z.object({
  path: z.string().describe("Path where the file should be written"),
  content: z.string().describe("Full content to write to the file"),
});

export type WriteFileInput = z.infer<typeof WriteFileSchema>;

// ─── Output ───────────────────────────────────────────────────────────────────

export interface WriteFileOutput {
  success: true;
  path: string;
  bytesWritten: number;
  isNew: boolean;
  preview?: string;
  hunks?: import("diff").StructuredPatchHunk[];
  hints?: string[];
}

export interface WriteFileError {
  success: false;
  error: string;
  path: string;
  hints?: string[];
}

export type WriteFileResult = WriteFileOutput | WriteFileError;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDiffPreview(
  oldContent: string | null,
  newContent: string
): { details: string[]; summary: string } {
  const newLines = newContent.split("\n");

  if (oldContent === null) {
    const preview = newLines.slice(0, 15).map((line) => `+ ${line}`);
    if (newLines.length > 15) {
      preview.push(`  ... (${newLines.length - 15} more lines)`);
    }
    return {
      details: preview,
      summary: `Creating new file (${newLines.length} lines, ${Buffer.byteLength(newContent, "utf-8")} bytes)`,
    };
  }

  const oldLines = oldContent.split("\n");
  const delta = newLines.length - oldLines.length;

  // Show actual diff preview for overwrite: first 15 new lines
  const preview = newLines.slice(0, 15).map((line) => `+ ${line}`);
  if (newLines.length > 15) {
    preview.push(`  ... (${newLines.length - 15} more lines)`);
  }

  return {
    details: preview,
    summary: `Overwriting file (${oldLines.length} lines -> ${newLines.length} lines, ${delta > 0 ? "+" : ""}${delta} lines)`,
  };
}

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function writeFile(input: WriteFileInput): Promise<WriteFileResult> {
  // Safe path check
  const safe = assertSafePath(input.path);
  if (safe.error) {
    return {
      success: false,
      error: safe.error,
      path: input.path,
      hints: [
        "Writing outside project root or to protected directories is prohibited.",
        "If you need to install a package, use 'run_command' with npm/yarn/pnpm.",
      ],
    };
  }
  const resolved = safe.resolved;

  // Empty content guard — allow whitespace? Require at least length >0, warn on whitespace-only
  if (!input.content || input.content.length === 0) {
    return {
      success: false,
      error: "Cannot write empty file. Provide full file content.",
      path: input.path,
      hints: ["If you meant to delete the file, use 'delete_file' tool."],
    };
  }

  if (input.content.trim().length === 0) {
    // Whitespace-only is suspicious but allowed? Block with hint, as likely LLM error
    return {
      success: false,
      error: "Cannot write file with only whitespace. Provide meaningful content.",
      path: input.path,
      hints: ["Ensure file content is not just spaces/newlines."],
    };
  }

  // Size guard
  const sizeCheck = checkFileSize(Buffer.byteLength(input.content, "utf-8"), LIMITS.MAX_WRITE_BYTES);
  if (!sizeCheck.ok) {
    return {
      success: false,
      error: `Content too large: ${(Buffer.byteLength(input.content, "utf-8") / 1024 / 1024).toFixed(2)}MB exceeds ${(LIMITS.MAX_WRITE_BYTES / 1024 / 1024).toFixed(0)}MB limit`,
      path: input.path,
      hints: [
        "Split file into smaller chunks",
        "Use apply_patch for large refactors",
        "Consider if file should be generated via run_command instead",
      ],
    };
  }

  let existingContent: string | null = null;
  let isNew = true;
  let isDirectory = false;

  try {
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      isDirectory = true;
    } else {
      existingContent = fs.readFileSync(resolved, "utf-8");
      isNew = false;
    }
  } catch {
    isNew = true;
  }

  if (isDirectory) {
    return {
      success: false,
      error: `Path is a directory, not a file: ${input.path}`,
      path: input.path,
      hints: [
        "You cannot overwrite a directory with file content.",
        "Append a filename: e.g., 'src/utils/myFile.ts'",
      ],
    };
  }

  const { details, summary } = buildDiffPreview(existingContent, input.content);
  const action = isNew ? "CREATE FILE" : "OVERWRITE FILE";

  const approved = await askPermission({
    action: "write_file",
    title: `${action}: ${input.path}`,
    details: [summary, "", ...details],
  });

  if (!approved) {
    return {
      success: false,
      error: "User denied file write",
      path: input.path,
    };
  }

  try {
    const dir = path.dirname(resolved);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (mkdirError: any) {
      if (mkdirError.code === "ENOTDIR") {
        return {
          success: false,
          error: `Cannot create directory for '${input.path}' because a file exists in parent path.`,
          path: input.path,
          hints: [
            "Check your path. One parent segment is a file, not folder.",
            "Use 'list_files' to verify structure",
          ],
        };
      }
      throw mkdirError;
    }

    // Atomic write: temp file then rename to avoid partial writes
    const tmpPath = resolved + `.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    fs.writeFileSync(tmpPath, input.content, "utf-8");
    fs.renameSync(tmpPath, resolved);

    const bytesWritten = Buffer.byteLength(input.content, "utf-8");

    return {
      success: true,
      path: input.path,
      bytesWritten,
      isNew,
      preview: details.join("\n"),
      hunks: getPatchFromContents({
        filePath: input.path,
        oldContent: existingContent || "",
        newContent: input.content,
      }),
      hints: isNew ? [] : ["File overwritten. Run linters/tests if needed."],
    };
  } catch (error) {
    if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === "EACCES") {
        return {
          success: false,
          error: `Permission denied: cannot write to ${input.path}`,
          path: input.path,
          hints: ["Check file permissions"],
        };
      }
      if (nodeError.code === "ENOSPC") {
        return {
          success: false,
          error: `No space left on device`,
          path: input.path,
          hints: ["Free up disk space"],
        };
      }
      return {
        success: false,
        error: `Could not write file: ${error.message}`,
        path: input.path,
      };
    }
    return {
      success: false,
      error: "Unknown error writing file",
      path: input.path,
    };
  }
}
