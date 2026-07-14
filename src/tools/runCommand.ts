import { z } from "zod";
import execa from "execa";
import { askPermission } from "../core/permissions";
import { assertSafePath, isDangerousCommand, LIMITS } from "./guards";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const RunCommandSchema = z.object({
  command: z.string().min(1).describe("Shell command to execute"),
  cwd: z.string().optional().describe("Working directory. Defaults to current directory."),
  timeout: z.number().int().positive().max(120000).optional().describe("Timeout in ms, default 60000, max 120000"),
});

export type RunCommandInput = z.infer<typeof RunCommandSchema>;

// ─── Output ───────────────────────────────────────────────────────────────────

export interface RunCommandOutput {
  success: true;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  command: string;
  hints?: string[];
}

export interface RunCommandError {
  success: false;
  error: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  command: string;
  hints?: string[];
}

export type RunCommandResult = RunCommandOutput | RunCommandError;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 60_000;
const MAX_OUTPUT_CHARS = LIMITS.MAX_TOOL_OUTPUT_CHARS;
const MAX_OUTPUT_LINES = 400;

function truncateOutput(output: string): string {
  if (!output) return "";
  if (output.length <= MAX_OUTPUT_CHARS) return output;

  const lines = output.split("\n");
  if (lines.length <= MAX_OUTPUT_LINES) {
    return `[Output truncated to last ${MAX_OUTPUT_CHARS} characters to save context]\n` + output.slice(-MAX_OUTPUT_CHARS);
  }

  const head = lines.slice(0, 50).join("\n");
  const tailCount = MAX_OUTPUT_LINES - 50;
  const tail = lines.slice(-tailCount).join("\n");
  const omitted = lines.length - MAX_OUTPUT_LINES;

  return `${head}\n\n... [${omitted} lines omitted to save context] ...\n\n${tail}`;
}

function generateHints(command: string, exitCode: number, stdout: string, stderr: string): string[] {
  if (exitCode === 0) return [];
  const hints: string[] = [];
  const combined = (stdout + "\n" + stderr).toLowerCase();

  if (combined.includes("missing script") || combined.includes("command not found") || combined.includes("not recognized as")) {
    if (command.match(/^(npm|yarn|pnpm) run /)) {
      hints.push("Script not found in package.json. Run 'cat package.json' to verify available scripts.");
    } else {
      hints.push("Command not found. Ensure binary is installed (e.g., via 'npm install') and in PATH.");
    }
  }

  if (command.includes("install") && (combined.includes("eresolve") || combined.includes("peer dep"))) {
    hints.push("Dependency resolution failed due to peer conflicts. Try adding '--legacy-peer-deps' or '--force'.");
  }

  if (combined.includes("error ts") || combined.includes("tsc") || combined.includes("eslint")) {
    hints.push("Compilation or linting errors. Read specific errors in output to fix code.");
  }

  if (command.includes("test") && (combined.includes("failed") || combined.includes("failing") || combined.includes("✖"))) {
    hints.push("Tests failed. Review output to identify failing assertions.");
  }

  if (command.startsWith("git ") && combined.includes("conflict")) {
    hints.push("Git merge/rebase conflict detected. Resolve conflicts manually.");
  }

  if (combined.includes("enoent") && combined.includes("no such file")) {
    hints.push("File or directory not found. Check path existence.");
  }

  return hints;
}

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function runCommand(input: RunCommandInput): Promise<RunCommandResult> {
  // Validate cwd safe path
  const cwdInput = input.cwd ?? process.cwd();
  const safeCwd = assertSafePath(cwdInput);
  if (safeCwd.error) {
    return {
      success: false,
      error: safeCwd.error,
      command: input.command,
      hints: ["Working directory must be inside project root."],
    };
  }
  const cwd = safeCwd.resolved;

  // Dangerous command check
  const dangerousReasons = isDangerousCommand(input.command);
  if (dangerousReasons.length > 0) {
    return {
      success: false,
      error: `Blocked dangerous command: ${dangerousReasons.join("; ")}`,
      command: input.command,
      hints: [
        "This command looks destructive. If you really need it, rewrite to be safer or ask user to run manually.",
        `Reasons: ${dangerousReasons.join(", ")}`,
      ],
    };
  }

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
  const timeout = input.timeout ?? DEFAULT_TIMEOUT;

  try {
    const isWindows = process.platform === "win32";
    const shellOption = isWindows ? true : "/bin/sh";

    const result = await execa(input.command, [], {
      cwd,
      timeout,
      reject: false,
      all: false,
      shell: shellOption,
    });

    const duration = Date.now() - startTime;
    const rawStdout = result.stdout ?? "";
    const rawStderr = result.stderr ?? "";
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
  } catch (error: any) {
    const duration = Date.now() - startTime;

    // Timeout detection - execa sets timedOut = true
    if (error.timedOut || error.message?.toLowerCase().includes("timed out") || error.message?.includes("ETIMEDOUT")) {
      const hints: string[] = [];
      if (input.command.match(/\b(start|dev|serve|watch)\b/)) {
        hints.push("Long-running server/process timed out because it doesn't exit. Consider running in background (append ' &') or use dedicated tool.");
      } else {
        hints.push("Command timed out. May be waiting for interactive input, stuck in loop, or slow. Try increasing timeout up to 120000ms.");
      }
      return {
        success: false,
        error: `Command timed out after ${timeout / 1000}s.`,
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
}
