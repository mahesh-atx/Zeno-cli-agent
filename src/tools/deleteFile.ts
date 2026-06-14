import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { askPermission } from "../core/permissions";

export const DeleteFileSchema = z.object({
  path: z.string().describe("Path to the file or directory to delete"),
  recursive: z.boolean().optional().default(false).describe("Set to true to delete directories and their contents"),
  dryRun: z.boolean().optional().default(false).describe("If true, only reports what would be deleted without actually deleting"),
});

export type DeleteFileInput = z.infer<typeof DeleteFileSchema>;

export interface DeleteFileOutput {
  success: true;
  path: string;
  type: "file" | "directory";
  dryRun: boolean;
  deletedPaths: string[]; // Updated for agent.ts
  hints?: string[];
}

export interface DeleteFileError {
  success: false;
  error: string;
  path: string;
  hints?: string[];
}

export type DeleteFileResult = DeleteFileOutput | DeleteFileError;

const PROTECTED_DIRS = ["node_modules", ".git", ".next", ".nuxt", "dist", "build", ".venv", "venv", "__pycache__", ".cache"];

function isProtectedPath(resolvedPath: string): boolean {
  const normalized = resolvedPath.replace(/\\/g, "/");
  return PROTECTED_DIRS.some((dir) => new RegExp(`(^|/)${dir}(/|$)`).test(normalized));
}

// Helper to gather all nested paths for dry-run and UI reporting
function gatherPaths(dir: string): string[] {
  const paths: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        paths.push(...gatherPaths(fullPath));
      } else {
        paths.push(fullPath);
      }
    }
  } catch {}
  paths.push(dir);
  return paths;
}

export async function deleteFile(input: DeleteFileInput): Promise<DeleteFileResult> {
  const resolved = path.resolve(process.cwd(), input.path);

  if (isProtectedPath(resolved)) {
    return {
      success: false,
      error: `Blocked: Cannot delete protected path '${input.path}'.`,
      path: input.path,
      hints: ["Deleting node_modules, .git, or build directories is strictly prohibited."],
    };
  }

  if (resolved === process.cwd()) {
    return {
      success: false,
      error: "Blocked: Cannot delete the project root directory.",
      path: input.path,
      hints: ["Deleting the project root is prohibited."],
    };
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return {
        success: false,
        error: `Path not found: ${input.path}`,
        path: input.path,
        hints: ["Use 'list_files' or 'glob_files' to verify the path exists before deleting."],
      };
    }
    return { success: false, error: `Could not access path: ${error.message}`, path: input.path };
  }

  const isDir = stat.isDirectory();

  if (isDir && !input.recursive) {
    return {
      success: false,
      error: `Path is a directory: ${input.path}`,
      path: input.path,
      hints: ["To delete a directory, you must set 'recursive: true'. Be careful, this cannot be undone."],
    };
  }

  // Gather paths BEFORE deletion so we can report them accurately
  const targetPaths = isDir && input.recursive ? gatherPaths(resolved) : [resolved];
  const deletedPaths = targetPaths.map(p => path.relative(process.cwd(), p));

  if (!input.dryRun) {
    const actionType = isDir ? "DELETE DIRECTORY" : "DELETE FILE";
    const details = [
      `  Target: ${input.path}`,
      `  Type: ${isDir ? "Directory (Recursive)" : "File"}`,
      `  Items affected: ${deletedPaths.length}`,
      `  Absolute: ${resolved}`
    ];

    const approved = await askPermission({
      action: "delete_file",
      title: `${actionType}: ${input.path}`,
      details,
    });

    if (!approved) {
      return { success: false, error: "User denied deletion", path: input.path };
    }

    try {
      fs.rmSync(resolved, { recursive: isDir, force: true });
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to delete: ${error.message}`,
        path: input.path,
      };
    }
  }

  return {
    success: true,
    path: input.path,
    type: isDir ? "directory" : "file",
    dryRun: input.dryRun ?? false,
    deletedPaths,
    hints: input.dryRun 
      ? ["This was a dry run. Nothing was deleted. Set 'dryRun: false' to execute."] 
      : ["Deletion successful. Remember to update any imports or references to this file in your codebase."],
  };
}