import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const ListFilesSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("Directory to list. Defaults to current working directory."),
  recursive: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to list files recursively in subdirectories"),
});

export type ListFilesInput = z.infer<typeof ListFilesSchema>;

// ─── Output ───────────────────────────────────────────────────────────────────

export interface ListFilesOutput {
  success: true;
  files: string[];
  directories: string[];
  total: number;
  path: string;
}

export interface ListFilesError {
  success: false;
  error: string;
  path: string;
}

export type ListFilesResult = ListFilesOutput | ListFilesError;

// ─── Ignored Directories ──────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".next",
  ".nuxt",
  "build",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  "target",         // Rust
  ".cargo",
]);

// ─── Recursive Walker ─────────────────────────────────────────────────────────

function walkDir(
  dir: string,
  baseDir: string,
  files: string[],
  directories: string[],
  recursive: boolean
): void {
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;

      directories.push(relativePath);

      if (recursive) {
        walkDir(fullPath, baseDir, files, directories, recursive);
      }
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
}

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function listFiles(input: ListFilesInput): Promise<ListFilesResult> {
  const targetPath = input.path ?? ".";
  const resolved = path.resolve(process.cwd(), targetPath);

  try {
    const stat = fs.statSync(resolved);

    if (!stat.isDirectory()) {
      return {
        success: false,
        error: `Path is not a directory: ${targetPath}`,
        path: targetPath,
      };
    }
  } catch (error) {
    if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === "ENOENT") {
        return {
          success: false,
          error: `Directory not found: ${targetPath}`,
          path: targetPath,
        };
      }
    }

    return {
      success: false,
      error: `Cannot access directory: ${targetPath}`,
      path: targetPath,
    };
  }

  const files: string[] = [];
  const directories: string[] = [];

  walkDir(resolved, resolved, files, directories, input.recursive ?? false);

  // Sort alphabetically
  files.sort();
  directories.sort();

  return {
    success: true,
    files,
    directories,
    total: files.length + directories.length,
    path: targetPath,
  };
}
