import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";
import Fuse from "fuse.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileEntry {
  path: string;        // relative path from cwd, e.g. "src/ui/App.tsx"
  name: string;        // basename, e.g. "App.tsx"
  dir: string;         // directory, e.g. "src/ui"
}

// ─── Cache ────────────────────────────────────────────────────────────────────
// File listing can be slow on big repos, so cache it and refresh periodically.

let fileCache: FileEntry[] | null = null;
let fileCacheTime = 0;
let fuseCache: Fuse<FileEntry> | null = null;

const CACHE_TTL_MS = 5000; // refresh every 5 seconds
const MAX_FILES = 5000;    // safety cap for huge repos

// Always-ignored patterns (in addition to .gitignore)
const ALWAYS_IGNORE = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".cache",
  "coverage",
  ".turbo",
  ".vscode",
  ".idea",
  "*.log",
  ".DS_Store",
];

// ─── Walk the FS ──────────────────────────────────────────────────────────────

function loadGitignore(root: string) {
  const ig = ignore().add(ALWAYS_IGNORE);

  const gitignorePath = path.join(root, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      ig.add(content);
    } catch {
      // ignore read errors
    }
  }

  return ig;
}

function walkDirectory(
  root: string,
  ig: ReturnType<typeof ignore>,
  collected: FileEntry[],
  limit: number
): void {
  if (collected.length >= limit) return;

  const stack: string[] = [root];

  while (stack.length > 0 && collected.length < limit) {
    const current = stack.pop()!;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (collected.length >= limit) break;

      const fullPath = path.join(current, entry.name);
      const relPath = path.relative(root, fullPath);

      // Skip empty / non-relative paths
      if (!relPath || relPath.startsWith("..")) continue;

      // Check .gitignore
      // ignore lib expects forward slashes
      const normalized = relPath.split(path.sep).join("/");
      const checkPath = entry.isDirectory() ? `${normalized}/` : normalized;

      try {
        if (ig.ignores(checkPath)) continue;
      } catch {
        continue;
      }

      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        collected.push({
          path: normalized,
          name: entry.name,
          dir: path.dirname(normalized),
        });
      }
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getFileList(forceRefresh = false): FileEntry[] {
  const now = Date.now();
  if (
    !forceRefresh &&
    fileCache &&
    now - fileCacheTime < CACHE_TTL_MS
  ) {
    return fileCache;
  }

  const root = process.cwd();
  const ig = loadGitignore(root);
  const files: FileEntry[] = [];

  try {
    walkDirectory(root, ig, files, MAX_FILES);
  } catch {
    // best effort — return whatever we got
  }

  // Sort: shorter paths first, then alphabetic
  files.sort((a, b) => {
    if (a.path.length !== b.path.length) return a.path.length - b.path.length;
    return a.path.localeCompare(b.path);
  });

  fileCache = files;
  fileCacheTime = now;

  // Rebuild fuse index when cache refreshes
  fuseCache = new Fuse(files, {
    keys: [
      { name: "name", weight: 0.6 },
      { name: "path", weight: 0.4 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: true,
  });

  return files;
}

/**
 * Search files using fuzzy matching.
 * If query is empty, returns the first `limit` files (recently/shallow first).
 */
export function searchFiles(query: string, limit = 8): FileEntry[] {
  const files = getFileList();

  if (!query || query.trim() === "") {
    return files.slice(0, limit);
  }

  if (!fuseCache) {
    // Shouldn't happen — getFileList builds it, but defensive
    fuseCache = new Fuse(files, {
      keys: [
        { name: "name", weight: 0.6 },
        { name: "path", weight: 0.4 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
    });
  }

  const results = fuseCache.search(query, { limit });
  return results.map((r) => r.item);
}