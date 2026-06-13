import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

export const ListFilesSchema = z.object({
  path: z.string().optional().default(".").describe("Directory path to list"),
});

export type ListFilesInput = z.infer<typeof ListFilesSchema>;

// Directories to ALWAYS ignore to protect the context window
const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", ".nuxt", "dist", "build", 
  ".venv", "venv", "__pycache__", ".cache", ".idea", ".vscode",
  ".turbo", ".expo", "coverage"
]);

export interface ListFilesResult {
  success: true;
  path: string;
  entries: string[];
  hints?: string[];
}

export async function listFiles(input: ListFilesInput): Promise<ListFilesResult> {
  const resolved = path.resolve(process.cwd(), input.path);

  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return {
        success: true,
        path: input.path,
        entries: [],
        hints: [`Path '${input.path}' is a file, not a directory. Use 'read_file' instead.`]
      };
    }

    const rawEntries = fs.readdirSync(resolved, { withFileTypes: true });
    const formattedEntries: string[] = [];

    // Sort: Directories first, then files
    const dirs = rawEntries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    const files = rawEntries.filter(e => e.isFile()).sort((a, b) => a.name.localeCompare(b.name));

    for (const dir of dirs) {
      if (IGNORED_DIRS.has(dir.name)) continue; // Skip junk
      formattedEntries.push(`[DIR]  ${dir.name}/`);
    }

    for (const file of files) {
      try {
        const filePath = path.join(resolved, file.name);
        const stats = fs.statSync(filePath);
        const sizeKb = (stats.size / 1024).toFixed(1);
        formattedEntries.push(`[FILE] ${file.name} (${sizeKb} KB)`);
      } catch {
        formattedEntries.push(`[FILE] ${file.name}`);
      }
    }

    // MODERN AGENT GUARDRAIL: Limit output to prevent context overflow
    const MAX_ENTRIES = 100;
    const hints: string[] = [];
    
    if (formattedEntries.length > MAX_ENTRIES) {
      hints.push(`Directory contains ${formattedEntries.length} items. Only showing the first ${MAX_ENTRIES}. Be specific with your paths instead of listing the root directory.`);
    }

    return {
      success: true,
      path: input.path,
      entries: formattedEntries.slice(0, MAX_ENTRIES),
      ...(hints.length > 0 && { hints })
    };

  } catch (error: any) {
    // Handle ENOENT gracefully
    return {
      success: true,
      path: input.path,
      entries: [],
      hints: [`Directory '${input.path}' does not exist. Check your path and try again.`]
    };
  }
}