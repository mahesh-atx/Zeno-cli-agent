import { z } from "zod";
import execa from "execa";

export const GitLogSchema = z.object({
  limit: z.number().int().positive().max(100).optional().default(20).describe("Number of commits to show"),
  oneline: z.boolean().optional().default(true).describe("If true, use --oneline format"),
  path: z.string().optional().describe("Optional file path to show history for"),
});

export type GitLogInput = z.infer<typeof GitLogSchema>;

export interface GitLogOutput {
  success: true;
  log: string;
  count: number;
}

export interface GitLogError {
  success: false;
  error: string;
  hints?: string[];
}

export async function gitLog(input: GitLogInput): Promise<GitLogOutput | GitLogError> {
  try {
    const args: string[] = ["log"];
    
    args.push(`--max-count=${input.limit ?? 20}`);
    
    if (input.oneline) {
      args.push("--oneline", "--decorate", "--color=never");
    } else {
      args.push("--pretty=format:%H %ad %s", "--date=short");
    }

    if (input.path) {
      args.push("--", input.path);
    }

    const result = await execa("git", args, { timeout: 10000, reject: false });

    if (result.exitCode !== 0) {
      if (result.stderr.includes("not a git repository")) {
        return {
          success: false,
          error: "Not a git repository",
          hints: ["Check if you're in a git repo."],
        };
      }
      if (result.stderr.includes("does not have any commits yet")) {
        return {
          success: true,
          log: "(no commits yet)",
          count: 0,
        };
      }
      return {
        success: false,
        error: `git log failed: ${result.stderr || result.stdout}`,
      };
    }

    const log = result.stdout.trim();
    const count = log ? log.split("\n").filter(l => l.trim()).length : 0;

    return {
      success: true,
      log: log || "(empty log)",
      count,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to run git log: ${error.message}`,
    };
  }
}
