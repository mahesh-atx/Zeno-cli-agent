import { z } from "zod";
import execa from "execa";

export const GitStatusSchema = z.object({
  short: z.boolean().optional().default(false).describe("If true, use --short format, otherwise --porcelain"),
});

export type GitStatusInput = z.infer<typeof GitStatusSchema>;

export interface GitStatusOutput {
  success: true;
  output: string;
  isClean: boolean;
  hasChanges: boolean;
  branch?: string;
}

export interface GitStatusError {
  success: false;
  error: string;
  hints?: string[];
}

export async function gitStatus(input: GitStatusInput): Promise<GitStatusOutput | GitStatusError> {
  try {
    // Get branch name
    let branch: string | undefined;
    try {
      const branchResult = await execa("git", ["branch", "--show-current"], { timeout: 5000, reject: false });
      if (branchResult.exitCode === 0) {
        branch = branchResult.stdout.trim() || undefined;
      }
    } catch {
      // ignore
    }

    const args = input.short ? ["status", "--short"] : ["status", "--porcelain", "-b"];
    const result = await execa("git", args, { timeout: 10000, reject: false });

    if (result.exitCode !== 0) {
      if (result.stderr.includes("not a git repository")) {
        return {
          success: false,
          error: "Not a git repository. Run git init first or check working directory.",
          hints: ["Use run_command to initialize git if needed."],
        };
      }
      return {
        success: false,
        error: `git status failed: ${result.stderr || result.stdout}`,
      };
    }

    const output = result.stdout.trim();
    const isClean = output === "" || (input.short ? output === "" : output.split("\n").every(line => line.startsWith("##") || line.trim() === ""));
    // More accurate clean check: if only branch line remains in porcelain -b
    let hasChanges = false;
    if (input.short) {
      hasChanges = output.length > 0;
    } else {
      const lines = output.split("\n").filter(l => !l.startsWith("##") && l.trim() !== "");
      hasChanges = lines.length > 0;
    }

    return {
      success: true,
      output: output || "(clean working tree)",
      isClean: !hasChanges,
      hasChanges,
      branch,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to run git status: ${error.message}`,
    };
  }
}
