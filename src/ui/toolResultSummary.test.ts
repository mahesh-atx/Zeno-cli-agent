// src/ui/toolResultSummary.test.ts
import { describe, it, expect } from "vitest";

import { getToolResultSummary } from "../core/agent";

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