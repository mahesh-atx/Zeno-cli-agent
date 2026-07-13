import { z } from "zod";
import execa from "execa";
import { assertSafePath } from "./guards";

export const GitDiffSchema = z.object({
  staged: z.boolean().optional().default(false).describe("If true, show staged changes (--staged), otherwise unstaged"),
  path: z.string().optional().describe("Optional file or directory path to limit diff to"),
  stat: z.boolean().optional().default(false).describe("If true, show --stat summary instead of full diff"),
});

export type GitDiffInput = z.infer<typeof GitDiffSchema>;

export interface GitDiffOutput {
  success: true;
  diff: string;
  stat?: string;
  isEmpty: boolean;
}

export interface GitDiffError {
  success: false;
  error: string;
  hints?: string[];
}

const MAX_DIFF_CHARS = 30000;

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  const head = diff.slice(0, 5000);
  const tail = diff.slice(-MAX_DIFF_CHARS + 5000);
  return `${head}\n\n... [${diff.length - MAX_DIFF_CHARS} chars truncated] ...\n\n${tail}`;
}

export async function gitDiff(input: GitDiffInput): Promise<GitDiffOutput | GitDiffError> {
  try {
    const args: string[] = ["diff"];
    
    if (input.staged) {
      args.push("--staged");
    }

    if (input.stat) {
      args.push("--stat");
    }

    if (input.path) {
      const safe = assertSafePath(input.path);
      if (safe.error) {
        return {
          success: false,
          error: safe.error,
          hints: ["Path must be inside project root."],
        };
      }
      args.push("--", input.path);
    }

    const result = await execa("git", args, { timeout: 10000, reject: false });

    if (result.exitCode !== 0 && result.exitCode !== 1) {
      // exit code 1 can mean diff has differences, not error — but for git diff, 0 = no diff, 1 = diff found, usually
      // Actually git diff returns 0 even with diff, unless --exit-code is used. So non-zero is error
      if (result.stderr.includes("not a git repository")) {
        return {
          success: false,
          error: "Not a git repository",
          hints: ["Check if you're in a git repo."],
        };
      }
      // If we have output despite non-zero, treat as success (some git versions)
      if (!result.stdout && result.stderr) {
        return {
          success: false,
          error: `git diff failed: ${result.stderr}`,
        };
      }
    }

    const diff = result.stdout.trim();
    const isEmpty = diff === "";

    return {
      success: true,
      diff: isEmpty ? "(no changes)" : truncateDiff(diff),
      isEmpty,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to run git diff: ${error.message}`,
    };
  }
}
