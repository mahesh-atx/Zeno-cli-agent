import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { askPermission } from "../core/permissions";

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
}

export interface WriteFileError {
  success: false;
  error: string;
  path: string;
}

export type WriteFileResult = WriteFileOutput | WriteFileError;

// ─── Diff Preview ─────────────────────────────────────────────────────────────

function buildDiffPreview(
  oldContent: string | null,
  newContent: string
): string[] {
  const details: string[] = [];

  if (oldContent === null) {
    // New file — show first 20 lines as preview
    const lines = newContent.split("\n").slice(0, 20);
    lines.forEach((line) => details.push(`+ ${line}`));
    if (newContent.split("\n").length > 20) {
      details.push(`  ... (${newContent.split("\n").length - 20} more lines)`);
    }
    return details;
  }

  // Existing file — simple line diff
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  // Find lines that changed (simplified diff — show removed then added)
  const removed = oldLines.filter((l) => !newLines.includes(l));
  const added = newLines.filter((l) => !oldLines.includes(l));

  const preview = [
    ...removed.slice(0, 10).map((l) => `- ${l}`),
    ...added.slice(0, 10).map((l) => `+ ${l}`),
  ];

  if (removed.length + added.length > 20) {
    preview.push(`  ... (${removed.length + added.length - 20} more changes)`);
  }

  return preview.length > 0 ? preview : ["  (no visible line changes)"];
}

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function writeFile(input: WriteFileInput): Promise<WriteFileResult> {
  const resolved = path.resolve(process.cwd(), input.path);

  // Check if file already exists
  let existingContent: string | null = null;
  let isNew = true;

  try {
    existingContent = fs.readFileSync(resolved, "utf-8");
    isNew = false;
  } catch {
    isNew = true;
  }

  // Build diff preview for permission prompt
  const diffLines = buildDiffPreview(existingContent, input.content);
  const action = isNew ? "CREATE FILE" : "OVERWRITE FILE";

  const approved = await askPermission({
    action: "write_file",
    title: `${action}: ${input.path}`,
    details: diffLines,
  });

  if (!approved) {
    return {
      success: false,
      error: "User denied file write",
      path: input.path,
    };
  }

  try {
    // Create parent directories if they don't exist
    const dir = path.dirname(resolved);
    fs.mkdirSync(dir, { recursive: true });

    // Write the file
    fs.writeFileSync(resolved, input.content, "utf-8");
    const bytesWritten = Buffer.byteLength(input.content, "utf-8");

    return {
      success: true,
      path: input.path,
      bytesWritten,
      isNew,
    };
  } catch (error) {
    if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === "EACCES") {
        return {
          success: false,
          error: `Permission denied: cannot write to ${input.path}`,
          path: input.path,
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
