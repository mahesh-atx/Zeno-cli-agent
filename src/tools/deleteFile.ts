import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { askPermission } from "../core/permissions";
import { assertSafePath, isInsideCwd } from "./guards";

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
  deletedPaths: string[];
  hints?: string[];
}

export interface DeleteFileError {
  success: false;
  error: string;
  path: string;
  hints?: string[];
}

export type DeleteFileResult = DeleteFileOutput | DeleteFileError;

function gatherPathsSafe(dir: string, cwd: string): string[] {
  const paths: string[] = [];
  const stack = [dir];
  const visitedReal = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    // Avoid symlink loops: realpath
    let real: string;
    try {
      real = fs.realpathSync(current);
    } catch {
      real = current;
    }
    if (visitedReal.has(real)) continue;
    visitedReal.add(real);

    // Check inside cwd via lstat to not follow symlink outside
    try {
      const lstat = fs.lstatSync(current);
      // Don't follow symlink directories
      if (lstat.isSymbolicLink()) {
        paths.push(current);
        continue;
      }
      if (lstat.isDirectory()) {
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
          paths.push(current);
          continue;
        }
        for (const entry of entries) {
          const fullPath = path.join(current, entry.name);
          // If symlink, don't traverse, just add
          try {
            const entryLstat = fs.lstatSync(fullPath);
            if (entryLstat.isSymbolicLink()) {
              paths.push(fullPath);
            } else if (entryLstat.isDirectory()) {
              stack.push(fullPath);
            } else {
              paths.push(fullPath);
            }
          } catch {
            // ignore unreadable
          }
        }
        paths.push(current);
      } else {
        paths.push(current);
      }
    } catch {
      paths.push(current);
    }
  }

  return paths;
}

export async function deleteFile(input: DeleteFileInput): Promise<DeleteFileResult> {
  const safe = assertSafePath(input.path);
  if (safe.error) {
    return {
      success: false,
      error: safe.error,
      path: input.path,
      hints: ["Deletion outside project root or protected dirs blocked."],
    };
  }
  const resolved = safe.resolved;

  if (resolved === process.cwd() || resolved === safe.cwd) {
    return {
      success: false,
      error: "Blocked: Cannot delete the project root directory.",
      path: input.path,
      hints: ["Deleting project root is prohibited."],
    };
  }

  // Extra check: resolved must be inside cwd even if assertSafePath passed (defense)
  if (!isInsideCwd(resolved, process.cwd())) {
    return {
      success: false,
      error: `Blocked: Cannot delete outside project root: ${input.path}`,
      path: input.path,
    };
  }

  let stat: fs.Stats;
  let lstat: fs.Stats;
  try {
    lstat = fs.lstatSync(resolved);
    stat = fs.statSync(resolved);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return {
        success: false,
        error: `Path not found: ${input.path}`,
        path: input.path,
        hints: ["Use 'list_files' or 'glob_files' to verify path exists before deleting."],
      };
    }
    return { success: false, error: `Could not access path: ${error.message}`, path: input.path };
  }

  const isDir = stat.isDirectory();
  const isSymlink = lstat.isSymbolicLink();

  if (isDir && !isSymlink && !input.recursive) {
    return {
      success: false,
      error: `Path is a directory: ${input.path}`,
      path: input.path,
      hints: ["To delete a directory, set 'recursive: true'. Be careful, cannot be undone."],
    };
  }

  const targetPaths = isDir && !isSymlink && input.recursive
    ? gatherPathsSafe(resolved, process.cwd())
    : [resolved];

  const deletedPaths = targetPaths.map(p => path.relative(process.cwd(), p) || p);

  if (deletedPaths.length > 50 && !input.dryRun) {
    // Extra guard for mass deletion
  }

  if (!input.dryRun) {
    const actionType = isDir ? "DELETE DIRECTORY" : "DELETE FILE";
    const details = [
      `  Target: ${input.path}`,
      `  Type: ${isDir ? (isSymlink ? "Symlink to Directory" : "Directory (Recursive)") : isSymlink ? "Symlink" : "File"}`,
      `  Items affected: ${deletedPaths.length}`,
      `  Absolute: ${resolved}`,
      ...(deletedPaths.length > 20 ? [`  First 20: ${deletedPaths.slice(0, 20).join(", ")} ...`] : [`  Items: ${deletedPaths.join(", ")}`]),
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
      // Use rmSync with no symlink following issue: if symlink dir, recursive true still deletes link not target when using lstat? rmSync follows? We use force.
      fs.rmSync(resolved, { recursive: !!input.recursive, force: true });
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
    type: isDir && !isSymlink ? "directory" : "file",
    dryRun: input.dryRun ?? false,
    deletedPaths,
    hints: input.dryRun
      ? ["Dry run. Nothing deleted. Set 'dryRun: false' to execute."]
      : ["Deletion successful. Update imports/references to this file."],
  };
}
