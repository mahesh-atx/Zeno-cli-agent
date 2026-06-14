import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

export const SearchFilesSchema = z.object({
  query: z.string().describe("The text or regex pattern to search for"),
  directory: z.string().optional().default(".").describe("Directory to search in"),
  caseSensitive: z.boolean().optional().default(false),
  isRegex: z.boolean().optional().default(false).describe("Set to true if query is a regex pattern"),
  filePattern: z.string().optional().describe("Optional file extension or pattern to filter (e.g., '.ts', '.js')"),
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
  total: number;        // Updated for agent.ts
  searchedFiles: number; // Updated for agent.ts
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

const MAX_MATCHES = 50;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB limit per file

export async function searchFiles(input: SearchFilesInput): Promise<SearchFilesResult> {
  const resolvedDir = path.resolve(process.cwd(), input.directory);
  
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    return { success: false, error: `Directory not found: ${input.directory}` };
  }

  let regex: RegExp;
  try {
    const flags = input.caseSensitive ? "" : "i";
    const pattern = input.isRegex ? input.query : input.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(pattern, flags);
  } catch (e: any) {
    return {
      success: false,
      error: `Invalid regex pattern: ${e.message}`,
      hints: ["Check your regex syntax or set 'isRegex' to false for literal text search."],
    };
  }

  const matches: SearchMatch[] = [];
  let total = 0;
  let searchedFiles = 0; // Track files actually opened and read
  let truncated = false;

  function walk(dir: string) {
    if (truncated) return;
    
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (truncated) return;
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) walk(fullPath);
      } else if (entry.isFile()) {
        if (input.filePattern && !entry.name.endsWith(input.filePattern) && !entry.name.includes(input.filePattern)) {
          continue;
        }
        
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size > MAX_FILE_SIZE) continue;
          
          const content = fs.readFileSync(fullPath, "utf-8");
          searchedFiles++; // Increment successfully searched files
          const lines = content.split("\n");
          
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              total++;
              if (matches.length < MAX_MATCHES) {
                matches.push({
                  file: path.relative(process.cwd(), fullPath),
                  line: i + 1,
                  content: lines[i].trim(),
                });
              } else {
                truncated = true;
                break;
              }
            }
          }
        } catch {
          // Ignore binary or unreadable files
        }
      }
    }
  }

  walk(resolvedDir);

  const hints: string[] = [];
  if (truncated) {
    hints.push(`Search capped at ${MAX_MATCHES} matches to protect context window. Narrow your search using 'filePattern' or a more specific 'query'.`);
  }
  if (total === 0) {
    hints.push(`No matches found in ${searchedFiles} files. Check for typos, case sensitivity, or try a broader search term.`);
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