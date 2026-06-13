import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { askPermission } from "../core/permissions";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const EditFileSchema = z.object({
  path: z.string().describe("Path to the file to edit"),
  searchString: z
    .string()
    .describe("Exact string to search for in the file"),
  replaceString: z
    .string()
    .describe("String to replace the searchString with"),
});

export type EditFileInput = z.infer<typeof EditFileSchema>;

// ─── Output ───────────────────────────────────────────────────────────────────

export interface EditFileOutput {
  success: true;
  path: string;
  linesChanged: number;
  preview: string;
}

export interface EditFileError {
  success: false;
  error: string;
  path: string;
}

export type EditFileResult = EditFileOutput | EditFileError;

// ─── Diff Builder ─────────────────────────────────────────────────────────────

function buildEditDiff(
  searchString: string,
  replaceString: string
): string[] {
  const searchLines = searchString.split("\n");
  const replaceLines = replaceString.split("\n");

  const details: string[] = [];

  searchLines.slice(0, 8).forEach((line) => {
    details.push(`- ${line}`);
  });

  if (searchLines.length > 8) {
    details.push(`  ... (${searchLines.length - 8} more removed lines)`);
  }

  replaceLines.slice(0, 8).forEach((line) => {
    details.push(`+ ${line}`);
  });

  if (replaceLines.length > 8) {
    details.push(`  ... (${replaceLines.length - 8} more added lines)`);
  }

  return details;
}

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function editFile(input: EditFileInput): Promise<EditFileResult> {
  const resolved = path.resolve(process.cwd(), input.path);

  // Read existing file
  let content: string;

  try {
    content = fs.readFileSync(resolved, "utf-8");
  } catch (error) {
    if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === "ENOENT") {
        return {
          success: false,
          error: `File not found: ${input.path}`,
          path: input.path,
        };
      }

      if (nodeError.code === "EACCES") {
        return {
          success: false,
          error: `Permission denied reading: ${input.path}`,
          path: input.path,
        };
      }

      return {
        success: false,
        error: `Could not read file: ${error.message}`,
        path: input.path,
      };
    }

    return {
      success: false,
      error: "Unknown error reading file",
      path: input.path,
    };
  }

  // Check search string exists
  if (!content.includes(input.searchString)) {
    return {
      success: false,
      error: `Search string not found in ${input.path}. The text must match exactly including whitespace.`,
      path: input.path,
    };
  }

  // Count occurrences
  const occurrences = content.split(input.searchString).length - 1;

  // Build new content
  const newContent = content.split(input.searchString).join(input.replaceString);

  // Calculate lines changed
  const oldLines = input.searchString.split("\n").length;
  const newLines = input.replaceString.split("\n").length;
  const linesChanged = Math.abs(oldLines - newLines) + Math.min(oldLines, newLines);

  // Build diff preview
  const diffLines = buildEditDiff(input.searchString, input.replaceString);

  if (occurrences > 1) {
    diffLines.unshift(`  Note: ${occurrences} occurrences will be replaced`);
  }

  const approved = await askPermission({
    action: "edit_file",
    title: `EDIT FILE: ${input.path}`,
    details: diffLines,
  });

  if (!approved) {
    return {
      success: false,
      error: "User denied file edit",
      path: input.path,
    };
  }

  // Write the edited content
  try {
    fs.writeFileSync(resolved, newContent, "utf-8");

    const preview = diffLines.join("\n");

    return {
      success: true,
      path: input.path,
      linesChanged,
      preview,
    };
  } catch (error) {
    if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === "EACCES") {
        return {
          success: false,
          error: `Permission denied writing: ${input.path}`,
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
