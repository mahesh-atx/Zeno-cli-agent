import { describe, it, expect } from "vitest";
import { getToolResultSummary } from "../../src/core/agent";

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

  it("list_files with entries array", () => {
    expect(
      getToolResultSummary("list_files", { success: true, entries: ["a", "b", "c"], total: 3 })
    ).toBe("3 items");
  });

  it("list_files with files/dirs", () => {
    expect(
      getToolResultSummary("list_files", { success: true, files: ["a", "b"], directories: ["c"], total: 3 })
    ).toBe("2 files, 1 dirs");
  });

  it("run_command with valid result", () => {
    expect(
      getToolResultSummary("run_command", { success: true, exitCode: 0, duration: 150, stdout: "", stderr: "" })
    ).toBe("exit 0 (150ms)");
  });

  it("web_search with results", () => {
    expect(
      getToolResultSummary("web_search", { success: true, results: [{ title: "A", url: "a", snippet: "..." }] })
    ).toBe("Found 1 results");
  });

  it("web_fetch with title", () => {
    expect(
      getToolResultSummary("web_fetch", { success: true, title: "Example Page", url: "https://example.com", content: "..." })
    ).toBe("Fetched: Example Page");
  });

  it("search_files with matches", () => {
    expect(
      getToolResultSummary("search_files", { success: true, total: 5, searchedFiles: 10, matches: [] })
    ).toBe("5 results from 10 files");
  });

  it("search_files without searchedFiles", () => {
    expect(
      getToolResultSummary("search_files", { success: true, total: 3 })
    ).toBe("3 results from ? files");
  });

  it("glob_files with matches", () => {
    expect(
      getToolResultSummary("glob_files", { success: true, total: 12, truncated: false })
    ).toBe("12 matches");
  });

  it("glob_files with truncation", () => {
    expect(
      getToolResultSummary("glob_files", { success: true, total: 200, truncated: true })
    ).toBe("200 matches (truncated)");
  });

  it("delete_file dry run", () => {
    expect(
      getToolResultSummary("delete_file", { success: true, type: "file", dryRun: true, deletedPaths: ["old.ts"] })
    ).toBe("DRY RUN: would delete 1 item(s)");
  });

  it("delete_file actual deletion", () => {
    expect(
      getToolResultSummary("delete_file", { success: true, type: "file", path: "old.ts", dryRun: false })
    ).toBe("Deleted file: old.ts");
  });

  it("delete_file directory deletion", () => {
    expect(
      getToolResultSummary("delete_file", { success: true, type: "directory", path: "dist/", dryRun: false })
    ).toBe("Deleted directory: dist/");
  });

  it("todo_write with message", () => {
    expect(
      getToolResultSummary("todo_write", { success: true, tasks: [], message: "Added task: Fix bug" })
    ).toBe("Added task: Fix bug");
  });

  it("ask_question with question", () => {
    expect(
      getToolResultSummary("ask_question", { success: true, question: "Which approach do you prefer?" })
    ).toBe("Asked: Which approach do you prefer?...");
  });

  it("send_message with content", () => {
    expect(
      getToolResultSummary("send_message", {
        success: true,
        message_sent: true,
        ends_turn: false,
        ui_message: { content: "Refactoring complete", type: "success" },
      })
    ).toBe("✅ Refactoring complete");
  });

  it("send_message ends turn", () => {
    expect(
      getToolResultSummary("send_message", {
        success: true,
        message_sent: true,
        ends_turn: true,
        ui_message: { content: "All done", type: "info" },
      })
    ).toBe("ℹ️ All done [ends turn]");
  });

  it("send_message warning type", () => {
    expect(
      getToolResultSummary("send_message", {
        success: true,
        message_sent: true,
        ends_turn: false,
        ui_message: { content: "Disk space low", type: "warning" },
      })
    ).toBe("⚠️ Disk space low");
  });

  it("send_message error type", () => {
    expect(
      getToolResultSummary("send_message", {
        success: true,
        message_sent: true,
        ends_turn: false,
        ui_message: { content: "Build failed", type: "error" },
      })
    ).toBe("❌ Build failed");
  });

  it("send_message truncates long content", () => {
    const long = "x".repeat(50);
    expect(
      getToolResultSummary("send_message", {
        success: true,
        message_sent: true,
        ends_turn: false,
        ui_message: { content: long, type: "info" },
      })
    ).toBe(`ℹ️ ${long.slice(0, 40)}...`);
  });

  it("send_message without content returns done", () => {
    expect(
      getToolResultSummary("send_message", { success: true, message_sent: true, ends_turn: false })
    ).toBe("done");
  });
});

describe("getToolResultSummary — failure cases", () => {
  it("read_file failure", () => {
    expect(
      getToolResultSummary("read_file", { success: false, error: "File not found", toolName: "read_file" })
    ).toBe("Error: File not found");
  });

  it("list_files failure", () => {
    expect(
      getToolResultSummary("list_files", { success: false, error: "Dir not found", toolName: "list_files" })
    ).toBe("Error: Dir not found");
  });

  it("run_command failure", () => {
    expect(
      getToolResultSummary("run_command", { success: false, error: "timeout", toolName: "run_command" })
    ).toBe("Error: timeout");
  });

  it("web_search failure", () => {
    expect(
      getToolResultSummary("web_search", { success: false, error: "Search failed with status 500" })
    ).toBe("Error: Search failed with status 500");
  });

  it("web_fetch failure", () => {
    expect(
      getToolResultSummary("web_fetch", { success: false, error: "HTTP error 404" })
    ).toBe("Error: HTTP error 404");
  });

  it("search_files failure", () => {
    expect(
      getToolResultSummary("search_files", { success: false, error: "Directory not found" })
    ).toBe("Error: Directory not found");
  });

  it("glob_files failure", () => {
    expect(
      getToolResultSummary("glob_files", { success: false, error: "Glob search failed" })
    ).toBe("Error: Glob search failed");
  });

  it("delete_file failure", () => {
    expect(
      getToolResultSummary("delete_file", { success: false, error: "Path not found", path: "x" })
    ).toBe("Error: Path not found");
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

  it("success but missing fields fallback to done", () => {
    expect(getToolResultSummary("read_file", { success: true })).toBe("done");
  });

  it("list_files missing both entries and files/dirs", () => {
    expect(getToolResultSummary("list_files", { success: true })).toBe("done");
  });

  it("run_command missing exitCode", () => {
    expect(getToolResultSummary("run_command", { success: true })).toBe("done");
  });
});
