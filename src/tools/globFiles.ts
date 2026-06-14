import { z } from "zod";
import fg from "fast-glob";
import * as path from "path";

export const GlobFilesSchema = z.object({
  pattern: z.string().describe("Glob pattern to match files (e.g., '**/*.ts', 'src/**/*.js')"),
  directory: z.string().optional().default(".").describe("Base directory to search from"),
});

export type GlobFilesInput = z.infer<typeof GlobFilesSchema>;

export interface GlobFilesOutput {
  success: true;
  files: string[];
  total: number;      // Updated for agent.ts
  truncated: boolean;
  hints?: string[];
}

export interface GlobFilesError {
  success: false;
  error: string;
  hints?: string[];
}

export type GlobFilesResult = GlobFilesOutput | GlobFilesError;

const MAX_FILES = 100;

export async function globFiles(input: GlobFilesInput): Promise<GlobFilesResult> {
  const cwd = path.resolve(process.cwd(), input.directory);

  try {
    const files = await fg(input.pattern, {
      cwd,
      absolute: false,
      dot: false,
      ignore: [
        "**/node_modules/**", "**/.git/**", "**/dist/**", 
        "**/build/**", "**/.next/**", "**/coverage/**"
      ],
      onlyFiles: true,
    });

    const total = files.length;
    const truncated = total > MAX_FILES;
    const returnedFiles = files.slice(0, MAX_FILES);

    const hints: string[] = [];
    if (truncated) {
      hints.push(`Found ${total} files, but only returning the first ${MAX_FILES} to protect the context window. Make your glob pattern more specific.`);
    }
    if (total === 0) {
      hints.push("No files matched the pattern. Check your syntax (e.g., '**/*.ts') or ensure the directory exists.");
    }

    return {
      success: true,
      files: returnedFiles,
      total,
      truncated,
      ...(hints.length > 0 && { hints }),
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Glob search failed: ${error.message}`,
      hints: ["Ensure your pattern is a valid glob syntax (e.g., '**/*.ts')."],
    };
  }
}