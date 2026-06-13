import { z } from "zod";
import execa from "execa";
import { askPermission } from "../core/permissions";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const RunCommandSchema = z.object({
  command: z
    .string()
    .describe("Shell command to execute"),
  cwd: z
    .string()
    .optional()
    .describe("Working directory for the command. Defaults to current directory."),
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
}

export interface RunCommandError {
  success: false;
  error: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  command: string;
}

export type RunCommandResult = RunCommandOutput | RunCommandError;

// ─── Execute ──────────────────────────────────────────────────────────────────

const COMMAND_TIMEOUT_MS = 30_000; // 30 seconds

export async function runCommand(input: RunCommandInput): Promise<RunCommandResult> {
  const cwd = input.cwd ?? process.cwd();

  // Ask permission before running any command
  const approved = await askPermission({
    action: "run_command",
    title: "RUN COMMAND",
    details: [
      `  $ ${input.command}`,
      `  Directory: ${cwd}`,
    ],
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
    const result = await execa("sh", ["-c", input.command], {
      cwd,
      timeout: COMMAND_TIMEOUT_MS,
      reject: false,         // Don't throw on non-zero exit
      all: false,
    });

    const duration = Date.now() - startTime;

    return {
      success: true,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.exitCode ?? 0,
      duration,
      command: input.command,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof Error) {
      // Timeout
      if (error.message.includes("timed out") || error.message.includes("ETIMEDOUT")) {
        return {
          success: false,
          error: `Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s: ${input.command}`,
          command: input.command,
        };
      }

      return {
        success: false,
        error: `Command failed: ${error.message}`,
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
