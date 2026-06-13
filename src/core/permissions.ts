import { requestPermission } from "./agent";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionType = "write_file" | "edit_file" | "run_command";

export interface PermissionRequest {
  action: ActionType;
  title: string;
  details: string[];
}

// ─── Ask Permission ───────────────────────────────────────────────────────────
// This is called by tool implementations.
// It routes through the global permission handler registered by App.tsx
// so the UI can show the prompt inline.

export async function askPermission(
  request: PermissionRequest
): Promise<boolean> {
  // --yes flag or env var — skip prompt entirely
  const args = process.argv.slice(2);
  if (
    args.includes("--yes") ||
    args.includes("-y") ||
    process.env.YES_TO_ALL === "true" ||
    process.env.YES_TO_ALL === "1"
  ) {
    return true;
  }

  return requestPermission(request.action, request.title, request.details);
}
