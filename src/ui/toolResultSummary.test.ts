// src/ui/toolResultSummary.test.ts
import { describe, it, expect } from "vitest";

// Inline the function since it's not exported — test the logic directly
function getToolResultSummary(toolName: string, result: unknown): string {
  if (typeof result !== "object" || result === null) return String(result);
  const r = result as Record<string, unknown>;
  if ("success" in r && !r.success) return `Error: ${r.error ?? "unknown"}`;

  switch (toolName) {
    case "read_file":
      return r.lines != null && r.size != null
        ? `${r.lines} lines, ${r.size} bytes`
        : "done";
    case "write_file":
      return r.path != null
        ? `${r.isNew ? "Created" : "Updated"}: ${r.path}`
        : "done";
    case "edit_file":
      return r.linesChanged != null
        ? `${r.linesChanged} lines changed`
        : "done";
    case "list_files": {
      const files = r.files as string[] | undefined;
      const dirs = r.directories as string[] | undefined;
      return files && dirs
        ? `${files.length} files, ${dirs.length} dirs`
        : "done";
    }
    case "run_command": {
      const exitCode = r.exitCode as number | undefined;
      const duration = r.duration as number | undefined;
      return exitCode != null && duration != null
        ? `exit ${exitCode} (${duration}ms)`
        : "done";
    }
    default:
      return "done";
  }
}

describe("getToolResultSummary — success cases", () => {
  it("read_file with valid result", () => {
    expect(
      getToolResultSummary("read_file", { success: true, lines: 42, size: 1823, path: "x.ts", content: "..." })
    ).toBe("42 lines, 1823 bytes");
  });

  it("write_file with valid result", () => {
    expect(
      getToolResultSummary("write_file", { success: true, path: "x.ts", bytesWritten: 100, isNew: true })
    ).toBe("Created: x.ts");
  });

  it("edit_file with valid result", () => {
    expect(
      getToolResultSummary("edit_file", { success: true, path: "x.ts", linesChanged: 5 })
    ).toBe("5 lines changed");
  });

  it("list_files with valid result", () => {
    expect(
      getToolResultSummary("list_files", { success: true, files: ["a", "b"], directories: ["c"], total: 3 })
    ).toBe("2 files, 1 dirs");
  });

  it("run_command with valid result", () => {
    expect(
      getToolResultSummary("run_command", { success: true, exitCode: 0, duration: 150, stdout: "", stderr: "" })
    ).toBe("exit 0 (150ms)");
  });
});

describe("getToolResultSummary — failure cases (the bug)", () => {
  it("read_file failure does NOT crash on missing .lines", () => {
    expect(
      getToolResultSummary("read_file", { success: false, error: "File not found", toolName: "read_file" })
    ).toBe("Error: File not found");
  });

  it("list_files failure does NOT crash on missing .files", () => {
    expect(
      getToolResultSummary("list_files", { success: false, error: "Dir not found", toolName: "list_files" })
    ).toBe("Error: Dir not found");
  });

  it("run_command failure does NOT crash on missing .exitCode", () => {
    expect(
      getToolResultSummary("run_command", { success: false, error: "timeout", toolName: "run_command" })
    ).toBe("Error: timeout");
  });

  it("list_files with undefined files returns 'done' not crash", () => {
    // Edge case: success: true but files field missing (corrupted result)
    expect(
      getToolResultSummary("list_files", { success: true })
    ).toBe("done");
  });

  it("run_command with undefined exitCode returns 'done' not crash", () => {
    expect(
      getToolResultSummary("run_command", { success: true })
    ).toBe("done");
  });

  it("read_file with undefined lines returns 'done' not crash", () => {
    expect(
      getToolResultSummary("read_file", { success: true })
    ).toBe("done");
  });
});

describe("getToolResultSummary — edge cases", () => {
  it("null result", () => {
    expect(getToolResultSummary("read_file", null)).toBe("null");
  });

  it("string result", () => {
    expect(getToolResultSummary("read_file", "raw string")).toBe("raw string");
  });

  it("unknown tool name", () => {
    expect(getToolResultSummary("unknown_tool", { success: true })).toBe("done");
  });
});