import { describe, it, expect, vi, beforeEach } from "vitest";
import { getToolResultSummary } from "../../src/core/agent";

// ─── getToolResultSummary ────────────────────────────────────────────────────
// These tests verify the summary function that was previously dead code.
// After Fix 1, this is the single source of truth for both agent and UI.

describe("getToolResultSummary", () => {
  describe("error cases", () => {
    it("returns error message when success is false", () => {
      const result = getToolResultSummary("read_file", {
        success: false,
        error: "File not found",
      });
      expect(result).toContain("File not found");
    });

    it("handles non-object result", () => {
      const result = getToolResultSummary("read_file", "plain string");
      expect(result).toBe("plain string");
    });

    it("handles null result", () => {
      const result = getToolResultSummary("read_file", null);
      expect(result).toBe("null");
    });

    it("handles number result", () => {
      const result = getToolResultSummary("read_file", 42);
      expect(result).toBe("42");
    });
  });

  describe("read_file", () => {
    it("returns lines and size when present", () => {
      const result = getToolResultSummary("read_file", {
        lines: 120,
        size: 4096,
      });
      expect(result).toContain("120");
      expect(result).toContain("4096");
    });

    it("returns done when fields missing", () => {
      const result = getToolResultSummary("read_file", { content: "x" });
      expect(result).toBe("done");
    });
  });

  describe("write_file", () => {
    it("shows Created for new files", () => {
      const result = getToolResultSummary("write_file", {
        path: "src/foo.ts",
        isNew: true,
      });
      expect(result).toContain("Created");
    });

    it("shows Updated for existing files", () => {
      const result = getToolResultSummary("write_file", {
        path: "src/foo.ts",
        isNew: false,
      });
      expect(result).toContain("Updated");
    });

    it("returns done when path missing", () => {
      const result = getToolResultSummary("write_file", {});
      expect(result).toBe("done");
    });
  });

  describe("edit_file", () => {
    it("returns linesChanged count", () => {
      const result = getToolResultSummary("edit_file", { linesChanged: 7 });
      expect(result).toContain("7");
    });

    it("returns done when linesChanged missing", () => {
      const result = getToolResultSummary("edit_file", {});
      expect(result).toBe("done");
    });
  });

  describe("list_files", () => {
    it("returns count from entries array", () => {
      const result = getToolResultSummary("list_files", {
        entries: ["a", "b", "c"],
      });
      expect(result).toContain("3");
    });

    it("returns files and dirs count", () => {
      const result = getToolResultSummary("list_files", {
        files: ["a.ts", "b.ts"],
        directories: ["src"],
      });
      expect(result).toContain("2");
      expect(result).toContain("1");
    });

    it("returns done when no recognizable shape", () => {
      const result = getToolResultSummary("list_files", {});
      expect(result).toBe("done");
    });
  });

  describe("run_command", () => {
    it("returns exit code and duration", () => {
      const result = getToolResultSummary("run_command", {
        exitCode: 0,
        duration: 342,
      });
      expect(result).toContain("0");
      expect(result).toContain("342");
    });

    it("returns done when fields missing", () => {
      const result = getToolResultSummary("run_command", { stdout: "ok" });
      expect(result).toBe("done");
    });
  });

  describe("web_search", () => {
    it("returns result count", () => {
      const result = getToolResultSummary("web_search", {
        results: [{}, {}, {}],
      });
      expect(result).toContain("3");
    });

    it("returns done when results missing", () => {
      const result = getToolResultSummary("web_search", {});
      expect(result).toBe("done");
    });
  });

  describe("web_fetch", () => {
    it("returns title when present", () => {
      const result = getToolResultSummary("web_fetch", {
        title: "TypeScript Docs",
      });
      expect(result).toContain("TypeScript Docs");
    });

    it("returns done when title missing", () => {
      const result = getToolResultSummary("web_fetch", { content: "..." });
      expect(result).toBe("done");
    });
  });

  describe("search_files", () => {
    it("returns total and searched count", () => {
      const result = getToolResultSummary("search_files", {
        total: 12,
        searchedFiles: 47,
      });
      expect(result).toContain("12");
      expect(result).toContain("47");
    });

    it("handles missing searchedFiles with question mark", () => {
      const result = getToolResultSummary("search_files", { total: 5 });
      expect(result).toContain("5");
      expect(result).toContain("?");
    });

    it("returns done when total missing", () => {
      const result = getToolResultSummary("search_files", {});
      expect(result).toBe("done");
    });
  });

  describe("glob_files", () => {
    it("returns match count", () => {
      const result = getToolResultSummary("glob_files", { total: 23 });
      expect(result).toContain("23");
    });

    it("shows truncated label when truncated is true", () => {
      const result = getToolResultSummary("glob_files", {
        total: 100,
        truncated: true,
      });
      expect(result.toLowerCase()).toContain("truncated");
    });

    it("does not show truncated when false", () => {
      const result = getToolResultSummary("glob_files", {
        total: 10,
        truncated: false,
      });
      expect(result.toLowerCase()).not.toContain("truncated");
    });

    it("returns done when total missing", () => {
      const result = getToolResultSummary("glob_files", {});
      expect(result).toBe("done");
    });
  });

  describe("delete_file", () => {
    it("shows dry run message", () => {
      const result = getToolResultSummary("delete_file", {
        dryRun: true,
        deletedPaths: ["a.ts", "b.ts"],
      });
      expect(result.toUpperCase()).toContain("DRY RUN");
      expect(result).toContain("2");
    });

    it("shows deleted type and path", () => {
      const result = getToolResultSummary("delete_file", {
        type: "file",
        path: "src/old.ts",
        dryRun: false,
      });
      expect(result.toLowerCase()).toContain("deleted");
      expect(result).toContain("file");
    });

    it("returns done when no recognizable shape", () => {
      const result = getToolResultSummary("delete_file", {});
      expect(result).toBe("done");
    });
  });

  describe("todo_write", () => {
    it("returns the message field", () => {
      const result = getToolResultSummary("todo_write", {
        message: "Added task: Write tests",
      });
      expect(result).toContain("Added task: Write tests");
    });

    it("returns done when message missing", () => {
      const result = getToolResultSummary("todo_write", { tasks: [] });
      expect(result).toBe("done");
    });
  });

  describe("ask_question", () => {
    it("returns truncated question", () => {
      const q = "Should I use tabs or spaces for indentation?";
      const result = getToolResultSummary("ask_question", { question: q });
      expect(result).toContain("Asked:");
    });

    it("truncates long questions at 40 chars", () => {
      const q = "A".repeat(80);
      const result = getToolResultSummary("ask_question", { question: q });
      expect(result.length).toBeLessThan(80);
      expect(result).toContain("...");
    });

    it("returns done when question missing", () => {
      const result = getToolResultSummary("ask_question", {});
      expect(result).toBe("done");
    });
  });

  describe("send_message", () => {
    it("shows info icon for info type", () => {
      const result = getToolResultSummary("send_message", {
        ui_message: { content: "Working...", type: "info" },
        ends_turn: false,
      });
      expect(result).toContain("ℹ");
    });

    it("shows error icon for error type", () => {
      const result = getToolResultSummary("send_message", {
        ui_message: { content: "Something failed", type: "error" },
        ends_turn: false,
      });
      expect(result).toContain("❌");
    });

    it("shows warning icon for warning type", () => {
      const result = getToolResultSummary("send_message", {
        ui_message: { content: "Be careful", type: "warning" },
        ends_turn: false,
      });
      expect(result).toContain("⚠");
    });

    it("shows success icon for success type", () => {
      const result = getToolResultSummary("send_message", {
        ui_message: { content: "All done", type: "success" },
        ends_turn: false,
      });
      expect(result).toContain("✅");
    });

    it("shows ends turn label when ends_turn is true", () => {
      const result = getToolResultSummary("send_message", {
        ui_message: { content: "Done", type: "success" },
        ends_turn: true,
      });
      expect(result).toContain("[ends turn]");
    });

    it("does not show ends turn label when ends_turn is false", () => {
      const result = getToolResultSummary("send_message", {
        ui_message: { content: "Working", type: "info" },
        ends_turn: false,
      });
      expect(result).not.toContain("[ends turn]");
    });

    it("truncates long content at 40 chars", () => {
      const result = getToolResultSummary("send_message", {
        ui_message: { content: "X".repeat(80), type: "info" },
        ends_turn: false,
      });
      expect(result).toContain("...");
    });

    it("returns done when ui_message missing", () => {
      const result = getToolResultSummary("send_message", { ends_turn: false });
      expect(result).toBe("done");
    });

    it("returns done when content is empty string", () => {
      const result = getToolResultSummary("send_message", {
        ui_message: { content: "", type: "info" },
        ends_turn: false,
      });
      expect(result).toBe("done");
    });
  });

  describe("unknown tool", () => {
    it("returns done for unrecognized tool name", () => {
      const result = getToolResultSummary("some_future_tool", { data: 123 });
      expect(result).toBe("done");
    });
  });
});