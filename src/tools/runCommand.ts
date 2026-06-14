import { z } from "zod";
import execa from "execa";
import { askPermission } from "../core/permissions";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const RunCommandSchema = z.object({
  command: z.string().describe("Shell command to execute"),
  cwd: z.string().optional().describe("Working directory. Defaults to current directory."),
});

export type RunCommandInput = z.infer<typeof RunCommandSchema>;

// ─── Output ───────────────────────────────────────────────────────────────────

export interface RunCommandOutput {
  success: true; // Means the tool successfully executed the process
  stdout: string;
  stderr: string;
  exitCode: number; // 0 means command succeeded, >0 means command failed
  duration: number;
  command: string;
  hints?: string[]; // NEW: Actionable hints if exitCode !== 0
}

export interface RunCommandError {
  success: false; // Means the tool failed to execute the process (timeout, crash)
  error: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  command: string;
  hints?: string[]; // NEW
}

export type RunCommandResult = RunCommandOutput | RunCommandError;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Increased to 60s. Modern builds (Next.js, heavy TS) often take >30s.
const COMMAND_TIMEOUT_MS = 60_000; 

// Limits output to ~7k tokens. Crucial for preventing context window overflow.
const MAX_OUTPUT_CHARS = 30000; 
const MAX_OUTPUT_LINES = 400;

/**
 * MODERN UPGRADE 1: Smart Truncation
 * Keeps the beginning (setup logs) and the end (actual errors/summaries), 
 * omitting the massive middle section of repetitive logs.
 */
function truncateOutput(output: string): string {
  if (!output) return "";
  if (output.length <= MAX_OUTPUT_CHARS) return output;

  const lines = output.split("\n");
  if (lines.length <= MAX_OUTPUT_LINES) {
    return `[Output truncated to last ${MAX_OUTPUT_CHARS} characters to save context]\n` + output.slice(-MAX_OUTPUT_CHARS);
  }

  const head = lines.slice(0, 50).join("\n");
  const tailLinesCount = MAX_OUTPUT_LINES - 50;
  const tail = lines.slice(-tailLinesCount).join("\n");
  const omitted = lines.length - MAX_OUTPUT_LINES;

  return `${head}\n\n... [${omitted} lines omitted to save context] ...\n\n${tail}`;
}

/**
 * MODERN UPGRADE 2: Context Injection (Smart Hints)
 * Analyzes the output to tell the LLM exactly why it failed and how to fix it.
 */
function generateHints(command: string, exitCode: number, stdout: string, stderr: string): string[] {
  if (exitCode === 0) return [];

  const hints: string[] = [];
  const combined = (stdout + "\n" + stderr).toLowerCase();

  // 1. Missing scripts / Command not found
  if (combined.includes("missing script") || combined.includes("command not found") || combined.includes("not recognized as")) {
    if (command.match(/^(npm|yarn|pnpm) run /)) {
      hints.push("The script was not found in package.json. Run 'cat package.json' to verify available scripts, or check for typos.");
    } else {
      hints.push("The command was not found. Ensure the binary is installed (e.g., via 'npm install') and available in the PATH.");
    }
  }

  // 2. Dependency issues
  if (command.includes("install") && (combined.includes("eresolve") || combined.includes("peer dep"))) {
    hints.push("Dependency resolution failed due to peer dependency conflicts. Try adding '--legacy-peer-deps' or '--force' to the install command.");
  }

  // 3. Compilation / Linting errors
  if (combined.includes("error ts") || combined.includes("tsc") || combined.includes("eslint")) {
    hints.push("There are compilation or linting errors. Read the specific error messages in the output to identify and fix the issues in the code.");
  }

  // 4. Test failures
  if (command.includes("test") && (combined.includes("failed") || combined.includes("failing") || combined.includes("✖"))) {
    hints.push("Tests failed. Review the test output to identify which assertions failed and update the implementation or tests accordingly.");
  }

  // 5. Git errors
  if (command.startsWith("git ") && combined.includes("conflict")) {
    hints.push("Git merge/rebase conflict detected. You need to resolve the conflicts in the files manually before continuing.");
  }

  return hints;
}

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function runCommand(input: RunCommandInput): Promise<RunCommandResult> {
  const cwd = input.cwd ?? process.cwd();

  const approved = await askPermission({
    action: "run_command",
    title: "RUN COMMAND",
    details: [`  $ ${input.command}`, `  Directory: ${cwd}`],
  });

  if (!approved) {
    return {
      success: false,
      error: "User denied command execution",
      command: input.command,
    };
  }

  const startTime = Date.now();

  try {
    const isWindows = process.platform === "win32";
    const shellOption = isWindows ? true : "/bin/sh";

    const result = await execa(input.command, [], {
      cwd,
      timeout: COMMAND_TIMEOUT_MS,
      reject: false, // Don't throw on non-zero exit
      all: false,
      shell: shellOption,
    });

    const duration = Date.now() - startTime;
    const rawStdout = result.stdout ?? "";
    const rawStderr = result.stderr ?? "";
    
    // Generate hints from the FULL output before we truncate it for the LLM
    const hints = generateHints(input.command, result.exitCode ?? 0, rawStdout, rawStderr);

    return {
      success: true,
      stdout: truncateOutput(rawStdout),
      stderr: truncateOutput(rawStderr),
      exitCode: result.exitCode ?? 0,
      duration,
      command: input.command,
      ...(hints.length > 0 && { hints }),
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof Error) {
      // MODERN UPGRADE 3: Intelligent Timeout Handling
      if (error.message.includes("timed out") || error.message.includes("ETIMEDOUT")) {
        const hints: string[] = [];
        
        // Detect if it's a long-running server
        if (input.command.match(/\b(start|dev|serve|watch)\b/)) {
          hints.push("This command appears to be a long-running server/process. It timed out because it doesn't exit. Consider running it in the background (e.g., appending ' &') or use a dedicated tool if available.");
        } else {
          hints.push("The command timed out. It might be waiting for interactive user input, stuck in a loop, or just very slow.");
        }

        return {
          success: false,
          error: `Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s.`,
          command: input.command,
          hints,
        };
      }

      return {
        success: false,
        error: `Command execution crashed: ${error.message}`,
        command: input.command,
      };
    }

    return {
      success: false,
      error: "Unknown error running command",
      command: input.command,
    };
  }
}