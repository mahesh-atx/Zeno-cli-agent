import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";
import Fuse from "fuse.js";
import fg from "fast-glob";

export interface FileEntry {
  path: string;
  name: string;
  dir: string;
}

let fileCache: FileEntry[] | null = null;
let fileCacheTime = 0;
let fuseCache: Fuse<FileEntry> | null = null;

const CACHE_TTL_MS = 5000;
const MAX_FILES = 5000;

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

function loadGitignore(root: string): { ig: ReturnType<typeof ignore>; patterns: string[] } {
  const ig = ignore().add(ALWAYS_IGNORE);
  const patterns: string[] = ALWAYS_IGNORE.map(p => `**/${p}/**`).concat(ALWAYS_IGNORE);

  const gitignorePath = path.join(root, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      ig.add(content);
      // Convert gitignore lines to fast-glob ignore patterns
      const lines = content.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
      for (const line of lines) {
        // If pattern has no slash, it should match any depth
        if (!line.includes("/")) {
          patterns.push(`**/${line}`);
          patterns.push(`**/${line}/**`);
        } else {
          patterns.push(line);
          if (!line.endsWith("/**")) {
            patterns.push(`${line}/**`);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return { ig, patterns };
}

function buildFileEntriesFromPaths(paths: string[]): FileEntry[] {
  return paths.map(p => {
    const normalized = p.split(path.sep).join("/");
    return {
      path: normalized,
      name: path.basename(normalized),
      dir: path.dirname(normalized),
    };
  });
}

export function getFileList(forceRefresh = false): FileEntry[] {
  const now = Date.now();
  if (!forceRefresh && fileCache && now - fileCacheTime < CACHE_TTL_MS) {
    return fileCache;
  }

  const root = process.cwd();
  const { patterns } = loadGitignore(root);

  let files: FileEntry[] = [];

  try {
    // fast-glob sync is much faster than manual readdirSync walk (avoids per-dir stat)
    // Use cwd: root, onlyFiles: true, followSymbolicLinks: false, suppressErrors
    const matched = fg.sync("**/*", {
      cwd: root,
      ignore: patterns,
      onlyFiles: true,
      dot: false,
      followSymbolicLinks: false,
      suppressErrors: true,
      deep: 10, // max depth to avoid infinite in crazy repos
    });

    // Cap to MAX_FILES
    const sliced = matched.slice(0, MAX_FILES);
    files = buildFileEntriesFromPaths(sliced);
  } catch {
    // Fallback to old walk if fast-glob fails
    files = [];
  }

  files.sort((a, b) => {
    if (a.path.length !== b.path.length) return a.path.length - b.path.length;
    return a.path.localeCompare(b.path);
  });

  fileCache = files;
  fileCacheTime = now;

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

export function searchFiles(query: string, limit = 8): FileEntry[] {
  const files = getFileList();

  if (!query || query.trim() === "") {
    return files.slice(0, limit);
  }

  if (!fuseCache) {
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

// For testing / cache invalidation
export function clearFileCache(): void {
  fileCache = null;
  fuseCache = null;
  fileCacheTime = 0;
}
