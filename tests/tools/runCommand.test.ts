// src/tools/runCommand.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCommand } from "../../src/tools/runCommand";
import { askPermission } from "../../src/core/permissions";
import execa from "execa";

// Mock permissions and execa
vi.mock("../../src/core/permissions", () => ({
  askPermission: vi.fn(),
}));

vi.mock("execa", () => ({
  default: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

// ━━━ runCommand ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runCommand tool", () => {
  it("runs a command successfully if permitted", async () => {
    vi.mocked(askPermission).mockResolvedValue(true);
    vi.mocked(execa).mockResolvedValue({
      stdout: "hello",
      stderr: "",
      exitCode: 0,
    } as any);

    const result = await runCommand({ command: "echo hello" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.stdout).toBe("hello");
      expect(result.exitCode).toBe(0);
      expect(result.command).toBe("echo hello");
    }

    expect(askPermission).toHaveBeenCalledWith(
      expect.objectContaining({ action: "run_command" })
    );
    expect(execa).toHaveBeenCalled();
  });

  it("fails if permission is denied", async () => {
    vi.mocked(askPermission).mockResolvedValue(false);

    const result = await runCommand({ command: "echo hello" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("User denied");
    }
    expect(execa).not.toHaveBeenCalled();
  });

  it("handles non-zero exit codes smoothly (no throw)", async () => {
    vi.mocked(askPermission).mockResolvedValue(true);
    vi.mocked(execa).mockResolvedValue({
      stdout: "",
      stderr: "command failed",
      exitCode: 1,
    } as any);

    const result = await runCommand({ command: "false" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.stderr).toBe("command failed");
      expect(result.exitCode).toBe(1);
    }
  });

  it("returns error if command fails to spawn or times out", async () => {
    vi.mocked(askPermission).mockResolvedValue(true);
    vi.mocked(execa).mockRejectedValue(new Error("timed out"));

    const result = await runCommand({ command: "sleep 100" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("timed out");
    }
  });
});
