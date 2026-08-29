import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { assertSafePath } from "./guards";
import ignore from "ignore";

export const ListFilesSchema = z.object({
  path: z.string().optional().default(".").describe("Directory path to list"),
  recursive: z.boolean().optional().default(false).describe("If true, recursively list files up to depth 2"),
});

export type ListFilesInput = z.infer<typeof ListFilesSchema>;

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", ".nuxt", "dist", "build",
  ".venv", "venv", "__pycache__", ".cache", ".idea", ".vscode",
  ".turbo", ".expo", "coverage"
]);

export interface ListFilesResult {
  success: true;
  path: string;
  entries: string[];
  total?: number;
  hints?: string[];
}

export interface ListFilesError {
  success: false;
  error: string;
  path: string;
  hints?: string[];
}

function loadIgnore(root: string) {
  const ig = ignore().add([...IGNORED_DIRS].map(d => `${d}/`));
  try {
    const gitignorePath = path.join(root, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      ig.add(content);
    }
  } catch {
    // ignore
  }
  return ig;
}

function isOutsideRoot(rel: string): boolean {
  return rel.startsWith("..");
}

function listRecursive(dir: string, ig: ReturnType<typeof ignore>, depth: number, maxDepth: number, collected: string[], limit: number) {
  if (collected.length >= limit) return;
  if (depth > maxDepth) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const dirs = entries.filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name));
  const files = entries.filter(e => e.isFile()).sort((a,b) => a.name.localeCompare(b.name));

  for (const d of dirs) {
    if (IGNORED_DIRS.has(d.name)) continue;
    const fullPath = path.join(dir, d.name);
    const rel = path.relative(process.cwd(), fullPath).split(path.sep).join("/");
    if (!isOutsideRoot(rel)) {
      try {
        if (ig.ignores(rel + "/")) continue;
      } catch {
        // ignore library throws on .. paths, skip check
      }
    }
    if (collected.length < limit) {
      collected.push(`[DIR]  ${rel}/`);
    }
    if (depth < maxDepth) {
      listRecursive(fullPath, ig, depth + 1, maxDepth, collected, limit);
    }
  }

  for (const f of files) {
    if (collected.length >= limit) break;
    const fullPath = path.join(dir, f.name);
    const rel = path.relative(process.cwd(), fullPath).split(path.sep).join("/");
    if (!isOutsideRoot(rel)) {
      try {
        if (ig.ignores(rel)) continue;
      } catch {
        // skip on error
      }
    }
    try {
      const stats = fs.statSync(fullPath);
      const sizeKb = (stats.size / 1024).toFixed(1);
      collected.push(`[FILE] ${rel} (${sizeKb} KB)`);
    } catch {
      collected.push(`[FILE] ${rel}`);
    }
  }
}

export async function listFiles(input: ListFilesInput): Promise<ListFilesResult | ListFilesError> {
  const safe = assertSafePath(input.path);
  if (safe.error) {
    return {
      success: false,
      error: safe.error,
      path: input.path,
      hints: ["Path must be inside project root and not protected."],
    };
  }
  const resolved = safe.resolved;

  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return {
        success: false,
        error: `Path is not a directory: ${input.path}`,
        path: input.path,
        hints: [`Path '${input.path}' is a file, not a directory. Use 'read_file' instead.`],
      };
    }

    const ig = loadIgnore(process.cwd());
    const MAX_ENTRIES = 100;
    const formatted: string[] = [];

    if (input.recursive) {
      listRecursive(resolved, ig, 0, 2, formatted, MAX_ENTRIES);
    } else {
      const rawEntries = fs.readdirSync(resolved, { withFileTypes: true });
      const dirs = rawEntries.filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name));
      const files = rawEntries.filter(e => e.isFile()).sort((a,b) => a.name.localeCompare(b.name));

      for (const dir of dirs) {
        if (IGNORED_DIRS.has(dir.name)) continue;
        const rel = path.relative(process.cwd(), path.join(resolved, dir.name)).split(path.sep).join("/");
        if (!isOutsideRoot(rel)) {
          try {
            if (ig.ignores(rel + "/")) continue;
          } catch {}
        }
        formatted.push(`[DIR]  ${dir.name}/`);
      }
      for (const file of files) {
        try {
          const filePath = path.join(resolved, file.name);
          const rel = path.relative(process.cwd(), filePath).split(path.sep).join("/");
          if (!isOutsideRoot(rel)) {
            try {
              if (ig.ignores(rel)) continue;
            } catch {}
          }
          const stats = fs.statSync(filePath);
          const sizeKb = (stats.size / 1024).toFixed(1);
          formatted.push(`[FILE] ${file.name} (${sizeKb} KB)`);
        } catch {
          formatted.push(`[FILE] ${file.name}`);
        }
      }
    }

    const hints: string[] = [];
    const total = formatted.length;
    if (total > MAX_ENTRIES) {
      hints.push(`Directory contains ${total} items. Showing first ${MAX_ENTRIES}. Use recursive or be more specific.`);
    }

    return {
      success: true,
      path: input.path,
      entries: formatted.slice(0, MAX_ENTRIES),
      total,
      ...(hints.length > 0 && { hints }),
    };

  } catch (error: any) {
    if (error.code === "ENOENT") {
      return {
        success: false,
        error: `Directory not found: ${input.path}`,
        path: input.path,
        hints: [`Directory '${input.path}' does not exist. Check path or use list_files on '.'`],
      };
    }
    return {
      success: false,
      error: `Could not list directory: ${error.message}`,
      path: input.path,
    };
  }
}
