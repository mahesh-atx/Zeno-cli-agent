import { z } from "zod";
import fg from "fast-glob";
import * as path from "path";
import * as fs from "fs";
import ignore from "ignore";
import { assertSafePath } from "./guards";

export const GlobFilesSchema = z.object({
  pattern: z.string().min(1).describe("Glob pattern to match files (e.g., '**/*.ts', 'src/**/*.js')"),
  directory: z.string().optional().default(".").describe("Base directory to search from"),
});

export type GlobFilesInput = z.infer<typeof GlobFilesSchema>;

export interface GlobFilesOutput {
  success: true;
  files: string[];
  total: number;
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

function loadIgnorePatterns(root: string): string[] {
  const patterns: string[] = [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/coverage/**",
    "**/.turbo/**",
    "**/.cache/**",
  ];
  try {
    const gitignorePath = path.join(root, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const ig = ignore();
      const content = fs.readFileSync(gitignorePath, "utf-8");
      ig.add(content);
      // fast-glob ignore expects glob patterns, not gitignore. We approximate by adding gitignore lines,
      // but for accurate we use the ignore lib later to filter? For simplicity, push raw patterns that fast-glob can handle if they don't have special.
      // We'll still filter after.
      const lines = content.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
      for (const line of lines) {
        // Convert gitignore to glob: if no slash, assume **/line
        if (!line.includes("/")) {
          patterns.push(`**/${line}`);
          patterns.push(`**/${line}/**`);
        } else {
          patterns.push(line);
          patterns.push(`${line}/**`);
        }
      }
    }
  } catch {
    // ignore
  }
  return patterns;
}

export async function globFiles(input: GlobFilesInput): Promise<GlobFilesResult> {
  const safe = assertSafePath(input.directory);
  if (safe.error) {
    return {
      success: false,
      error: safe.error,
      hints: ["Base directory must be inside project root."],
    };
  }
  const cwd = safe.resolved;

  try {
    const ignorePatterns = loadIgnorePatterns(process.cwd());

    const files = await fg(input.pattern, {
      cwd,
      absolute: false,
      dot: false,
      ignore: ignorePatterns,
      onlyFiles: true,
      suppressErrors: true,
      followSymbolicLinks: false,
    });

    // Sort: shorter first then alpha, for better UX
    files.sort((a, b) => {
      if (a.length !== b.length) return a.length - b.length;
      return a.localeCompare(b);
    });

    const total = files.length;
    const truncated = total > MAX_FILES;
    const returnedFiles = files.slice(0, MAX_FILES).map(f => {
      // Return relative to process.cwd(), not to input directory, for consistency
      const abs = path.resolve(cwd, f);
      return path.relative(process.cwd(), abs).split(path.sep).join("/");
    });

    const hints: string[] = [];
    if (truncated) {
      hints.push(`Found ${total} files, returning first ${MAX_FILES} to protect context. Make pattern more specific.`);
    }
    if (total === 0) {
      hints.push("No files matched pattern. Check syntax (e.g., '**/*.ts') or directory exists.");
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
      hints: ["Ensure pattern is valid glob syntax (e.g., '**/*.ts')."],
    };
  }
}
