// src/errors/toolErrors.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tool Layer — catches OS-level exceptions and formats them
// into clean strings that feed back to the LLM.
// Never throws to the console.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { makeToolErrorEvent, ToolErrorEvent } from "./base";

// ─── OS Error Code → Human Message ───────────────────────────

const OS_ERROR_MESSAGES: Record<string, string> = {
  ENOENT: "File or directory not found",
  EACCES: "Permission denied",
  EEXIST: "File already exists",
  ENOTDIR: "Path is not a directory",
  EISDIR: "Path is a directory, not a file",
  ENOSPC: "No space left on device",
  EMFILE: "Too many open files",
  ETIMEDOUT: "Operation timed out",
  ECONNREFUSED: "Connection refused",
  EPERM: "Operation not permitted",
};

function formatOsError(error: NodeJS.ErrnoException): string {
  const code = error.code ?? "UNKNOWN";
  const friendly = OS_ERROR_MESSAGES[code];
  if (friendly) {
    return `${friendly} (${code}): ${error.path ?? error.message}`;
  }
  return `OS error ${code}: ${error.message}`;
}

// ─── Main Wrapper ─────────────────────────────────────────────
// Use this in tools/index.ts around every toolDef.execute() call.
// Returns a { success: false, error: string } object — never throws.

export interface ToolFailureResult {
  success: false;
  error: string;
  toolName: string;
}

export function catchToolError(
  toolName: string,
  error: unknown
): ToolFailureResult {
  // NodeJS ErrnoException (fs, child_process, etc.)
  if (
    error instanceof Error &&
    "code" in error &&
    typeof (error as NodeJS.ErrnoException).code === "string"
  ) {
    const msg = formatOsError(error as NodeJS.ErrnoException);
    return { success: false, error: msg, toolName };
  }

  // Standard Error
  if (error instanceof Error) {
    return { success: false, error: error.message, toolName };
  }

  // Anything else
  return {
    success: false,
    error: `Unexpected error in tool "${toolName}": ${String(error)}`,
    toolName,
  };
}

// ─── Event Emitter Variant ────────────────────────────────────
// When you need the full typed event (for agent.ts logging).

export function catchToolErrorAsEvent(
  toolName: string,
  error: unknown
): ToolErrorEvent {
  return makeToolErrorEvent(toolName, error);
}