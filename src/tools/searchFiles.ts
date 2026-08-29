import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";
import { assertSafePath, LIMITS } from "./guards";

export const SearchFilesSchema = z.object({
  query: z.string().min(1).describe("The text or regex pattern to search for"),
  directory: z.string().optional().default(".").describe("Directory to search in"),
  caseSensitive: z.boolean().optional().default(false),
  isRegex: z.boolean().optional().default(false).describe("Set to true if query is a regex pattern"),
  filePattern: z.string().optional().describe("Optional file extension or pattern to filter (e.g., '.ts', '.js')"),
  maxResults: z.number().int().positive().max(200).optional().default(50).describe("Max results to return"),
});

export type SearchFilesInput = z.infer<typeof SearchFilesSchema>;

export interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

export interface SearchFilesOutput {
  success: true;
  matches: SearchMatch[];
  total: number;
  searchedFiles: number;
  truncated: boolean;
  hints?: string[];
}

export interface SearchFilesError {
  success: false;
  error: string;
  hints?: string[];
}

export type SearchFilesResult = SearchFilesOutput | SearchFilesError;

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", ".nuxt", "dist", "build",
  ".venv", "venv", "__pycache__", ".cache", ".idea", ".vscode",
  ".turbo", ".expo", "coverage"
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1MB per file

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&');
}

function loadIgnore(root: string) {
  const ig = ignore().add([...IGNORED_DIRS].map(d => `${d}/`));
  try {
    const gitignorePath = path.join(root, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      ig.add(fs.readFileSync(gitignorePath, "utf-8"));
    }
  } catch {
    // ignore
  }
  return ig;
}

function matchesFilePattern(fileName: string, pattern?: string): boolean {
  if (!pattern) return true;
  const trimmed = pattern.trim();
  if (!trimmed) return true;
  // If pattern starts with . treat as extension
  if (trimmed.startsWith(".")) {
    return fileName.endsWith(trimmed) || path.extname(fileName) === trimmed;
  }
  // If pattern contains glob chars, simple includes fallback
  if (trimmed.includes("*") || trimmed.includes("?")) {
    // Convert simple glob to regex: * => .*, ? => .
    const regexStr = "^" + escapeRegExp(trimmed).replace(/\\\*/g, ".*").replace(/\\\?/g, ".") + "$";
    try {
      return new RegExp(regexStr).test(fileName);
    } catch {
      return fileName.includes(trimmed);
    }
  }
  // Otherwise substring include (case sensitive per file name)
  return fileName.includes(trimmed);
}

export async function searchFiles(input: SearchFilesInput): Promise<SearchFilesResult> {
  const safe = assertSafePath(input.directory);
  if (safe.error) {
    return { success: false, error: safe.error, hints: ["Search directory must be inside project root."] };
  }
  const resolvedDir = safe.resolved;

  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    return { success: false, error: `Directory not found: ${input.directory}` };
  }

  let regex: RegExp;
  try {
    const flags = input.caseSensitive ? "" : "i";
    const pattern = input.isRegex ? input.query : escapeRegExp(input.query);
    regex = new RegExp(pattern, flags);
  } catch (e: any) {
    return {
      success: false,
      error: `Invalid regex pattern: ${e.message}`,
      hints: ["Check regex syntax or set 'isRegex' to false for literal search."],
    };
  }

  const ig = loadIgnore(process.cwd());
  const matches: SearchMatch[] = [];
  let total = 0;
  let searchedFiles = 0;
  let truncated = false;
  const maxMatches = input.maxResults ?? 50;
  let skippedBinary = 0;
  let skippedLarge = 0;
  const visitedReal = new Set<string>();

  function walk(dir: string) {
    if (truncated && matches.length >= maxMatches) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (truncated && matches.length >= maxMatches) return;

      const fullPath = path.join(dir, entry.name);
      const relFromRoot = path.relative(process.cwd(), fullPath).split(path.sep).join("/");
      const isOutsideRoot = relFromRoot.startsWith("..");

      // Ignore check — skip .gitignore check for outside-root paths (e.g., /tmp tests) to avoid ignore library RangeError
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (!isOutsideRoot && ig.ignores(relFromRoot + "/")) continue;

        // Avoid symlink loops
        try {
          const lstat = fs.lstatSync(fullPath);
          if (lstat.isSymbolicLink()) continue;
          const real = fs.realpathSync(fullPath);
          if (visitedReal.has(real)) continue;
          visitedReal.add(real);
        } catch {
          continue;
        }

        walk(fullPath);
      } else if (entry.isFile()) {
        if (!isOutsideRoot && ig.ignores(relFromRoot)) continue;
        if (!matchesFilePattern(entry.name, input.filePattern)) continue;

        try {
          const lstat = fs.lstatSync(fullPath);
          if (lstat.isSymbolicLink()) continue;
          if (lstat.size > MAX_FILE_SIZE) {
            skippedLarge++;
            continue;
          }
          // Quick binary check: read first 512 bytes for null byte
          const fd = fs.openSync(fullPath, "r");
          const buf = Buffer.alloc(512);
          const bytes = fs.readSync(fd, buf, 0, 512, 0);
          fs.closeSync(fd);
          if (bytes > 0 && buf.subarray(0, bytes).includes(0)) {
            skippedBinary++;
            continue;
          }

          const content = fs.readFileSync(fullPath, "utf-8");
          searchedFiles++;
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              total++;
              if (matches.length < maxMatches) {
                matches.push({
                  file: relFromRoot,
                  line: i + 1,
                  content: lines[i].trim().slice(0, 300),
                });
              } else {
                truncated = true;
                break;
              }
            }
          }
        } catch {
          // ignore unreadable/binary
        }
      }
    }
  }

  walk(resolvedDir);

  const hints: string[] = [];
  if (truncated) {
    hints.push(`Search capped at ${maxMatches} matches to protect context. Narrow query or use filePattern.`);
  }
  if (total === 0) {
    hints.push(`No matches found in ${searchedFiles} files. Check typos, caseSensitive, or broaden search.`);
  }
  if (skippedLarge > 0) {
    hints.push(`${skippedLarge} large files (>1MB) skipped.`);
  }
  if (skippedBinary > 0) {
    hints.push(`${skippedBinary} binary files skipped.`);
  }

  return {
    success: true,
    matches,
    total,
    searchedFiles,
    truncated,
    ...(hints.length > 0 && { hints }),
  };
}
