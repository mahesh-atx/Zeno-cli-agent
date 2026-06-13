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
  hints?: string[]; // NEW: Post-write hints
}

export interface WriteFileError {
  success: false;
  error: string;
  path: string;
  hints?: string[]; // NEW: Actionable error hints
}

export type WriteFileResult = WriteFileOutput | WriteFileError;

// ─── Modern Agent Upgrades ────────────────────────────────────────────────────

// Protected directories that LLMs should NEVER write to
const PROTECTED_DIRS = [
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  "dist",
  "build",
  ".venv",
  "venv",
  "__pycache__",
  ".cache",
];

function isProtectedPath(resolvedPath: string): boolean {
  const normalized = resolvedPath.replace(/\\/g, "/");
  return PROTECTED_DIRS.some((dir) => {
    // Check if the path contains /node_modules/ or starts with node_modules/
    const regex = new RegExp(`(^|/)${dir}(/|$)`);
    return regex.test(normalized);
  });
}

/**
 * MODERN UPGRADE 1: Safer, Faster Diff Preview
 * Replaces the O(N*M) array filter with a simple line-count delta and 
 * a preview of the new file. This prevents terminal UI crashes and 
 * handles files with many duplicate lines correctly.
 */
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
  
  const preview = newLines.slice(0, 15).map((line) => `  ${line}`);
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
  const resolved = path.resolve(process.cwd(), input.path);

  // MODERN UPGRADE 2: Empty Content Guardrail
  if (!input.content || input.content.trim().length === 0) {
    return {
      success: false,
      error: "Cannot write empty file. Ensure you are providing the full file content.",
      path: input.path,
      hints: ["If you meant to delete the file, use a 'delete_file' tool or 'run_command' with rm instead."],
    };
  }

  // MODERN UPGRADE 3: Protected Path Guardrail
  if (isProtectedPath(resolved)) {
    return {
      success: false,
      error: `Blocked: Cannot write to protected directory '${input.path}'.`,
      path: input.path,
      hints: [
        "Writing to node_modules, .git, or build directories is strictly prohibited.",
        "If you need to install a package, use 'run_command' with npm/yarn/pnpm.",
      ],
    };
  }

  // Check if file already exists
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

  // MODERN UPGRADE 4: Directory Conflict Resolution
  if (isDirectory) {
    return {
      success: false,
      error: `Path is a directory, not a file: ${input.path}`,
      path: input.path,
      hints: [
        "You cannot overwrite a directory with file content.",
        "If you meant to create a file inside this directory, append a filename to the path (e.g., 'src/utils/myFile.ts').",
      ],
    };
  }

  // Build diff preview for permission prompt
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
    // Create parent directories if they don't exist
    const dir = path.dirname(resolved);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (mkdirError: any) {
      // MODERN UPGRADE 5: ENOTDIR handling (parent path is a file)
      if (mkdirError.code === "ENOTDIR") {
        return {
          success: false,
          error: `Cannot create directory for '${input.path}' because a file already exists in the parent path.`,
          path: input.path,
          hints: [
            "Check your path. One of the parent segments is a file, not a folder.",
            "Use 'list_files' to verify the correct directory structure.",
          ],
        };
      }
      throw mkdirError;
    }

    // Write the file
    fs.writeFileSync(resolved, input.content, "utf-8");
    const bytesWritten = Buffer.byteLength(input.content, "utf-8");

    return {
      success: true,
      path: input.path,
      bytesWritten,
      isNew,
      hints: isNew ? [] : ["File overwritten successfully. Ensure you ran any necessary linters or tests."],
    };
  } catch (error) {
    if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === "EACCES") {
        return {
          success: false,
          error: `Permission denied: cannot write to ${input.path}`,
          path: input.path,
          hints: ["Check file permissions or try running the agent with elevated privileges."],
        };
      }
      
      if (nodeError.code === "ENOSPC") {
        return {
          success: false,
          error: `No space left on device`,
          path: input.path,
          hints: ["The disk is full. Free up space and try again."],
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