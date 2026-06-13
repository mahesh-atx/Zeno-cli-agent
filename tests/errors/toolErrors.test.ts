// src/errors/toolErrors.test.ts
import { describe, it, expect } from "vitest";
import { catchToolError, catchToolErrorAsEvent } from "../../src/errors/toolErrors";

// ━━━ catchToolError ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("catchToolError — OS error codes", () => {
  function makeErrnoError(
    message: string,
    code: string,
    filePath?: string
  ): NodeJS.ErrnoException {
    const err = new Error(message) as NodeJS.ErrnoException;
    err.code = code;
    err.path = filePath;
    return err;
  }

  it("ENOENT produces readable message", () => {
    const err = makeErrnoError("no such file", "ENOENT", "/tmp/missing.txt");
    const result = catchToolError("read_file", err);
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
    expect(result.error).toContain("ENOENT");
  });

  it("EACCES produces readable message", () => {
    const err = makeErrnoError("permission denied", "EACCES", "/etc/shadow");
    const result = catchToolError("write_file", err);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Permission denied");
    expect(result.error).toContain("EACCES");
  });

  it("EEXIST produces readable message", () => {
    const err = makeErrnoError("file exists", "EEXIST", "/tmp/exists.txt");
    const result = catchToolError("write_file", err);
    expect(result.success).toBe(false);
    expect(result.error).toContain("EEXIST");
  });

  it("ENOTDIR produces readable message", () => {
    const err = makeErrnoError("not a dir", "ENOTDIR", "/tmp/file.txt");
    const result = catchToolError("list_files", err);
    expect(result.success).toBe(false);
    expect(result.error).toContain("ENOTDIR");
  });

  it("EISDIR produces readable message", () => {
    const err = makeErrnoError("is a dir", "EISDIR", "/tmp/dir");
    const result = catchToolError("read_file", err);
    expect(result.success).toBe(false);
    expect(result.error).toContain("EISDIR");
  });

  it("ENOSPC produces readable message", () => {
    const err = makeErrnoError("no space left", "ENOSPC");
    const result = catchToolError("write_file", err);
    expect(result.success).toBe(false);
    expect(result.error).toContain("ENOSPC");
  });

  it("EPERM produces readable message", () => {
    const err = makeErrnoError("operation not permitted", "EPERM");
    const result = catchToolError("run_command", err);
    expect(result.success).toBe(false);
    expect(result.error).toContain("EPERM");
  });

  it("unknown OS code falls back gracefully", () => {
    const err = makeErrnoError("weird error", "EWEIRD");
    const result = catchToolError("read_file", err);
    expect(result.success).toBe(false);
    expect(result.error).toContain("EWEIRD");
  });

  it("always sets toolName", () => {
    const err = makeErrnoError("no such file", "ENOENT");
    const result = catchToolError("edit_file", err);
    expect(result.toolName).toBe("edit_file");
  });
});

describe("catchToolError — standard Error objects", () => {
  it("captures Error.message", () => {
    const result = catchToolError("run_command", new Error("command failed"));
    expect(result.success).toBe(false);
    expect(result.error).toContain("command failed");
  });

  it("sets toolName correctly", () => {
    const result = catchToolError("run_command", new Error("oops"));
    expect(result.toolName).toBe("run_command");
  });
});

describe("catchToolError — non-Error thrown values", () => {
  it("handles string thrown", () => {
    const result = catchToolError("list_files", "raw string");
    expect(result.success).toBe(false);
    expect(result.error).toContain("raw string");
  });

  it("handles number thrown", () => {
    const result = catchToolError("list_files", 42);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("handles null thrown", () => {
    const result = catchToolError("list_files", null);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("handles undefined thrown", () => {
    const result = catchToolError("list_files", undefined);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("catchToolError — output shape", () => {
  it("is JSON serialisable (no circular refs)", () => {
    const result = catchToolError(
      "read_file",
      Object.assign(new Error("boom"), { code: "ENOENT", path: "/tmp/x" })
    );
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("parsed JSON has correct fields", () => {
    const result = catchToolError("read_file", new Error("boom"));
    const parsed = JSON.parse(JSON.stringify(result));
    expect(parsed).toHaveProperty("success", false);
    expect(parsed).toHaveProperty("error");
    expect(parsed).toHaveProperty("toolName");
  });
});

// ━━━ catchToolErrorAsEvent ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("catchToolErrorAsEvent", () => {
  it("returns tool_error kind", () => {
    const e = catchToolErrorAsEvent("read_file", new Error("boom"));
    expect(e.kind).toBe("tool_error");
  });

  it("sets toolName", () => {
    const e = catchToolErrorAsEvent("write_file", new Error("boom"));
    expect(e.toolName).toBe("write_file");
  });

  it("sets toolResultText for LLM feed", () => {
    const e = catchToolErrorAsEvent("edit_file", new Error("search not found"));
    expect(e.toolResultText).toContain("edit_file");
    expect(e.toolResultText).toContain("search not found");
  });

  it("not retryable", () => {
    const e = catchToolErrorAsEvent("read_file", new Error("boom"));
    expect(e.retryable).toBe(false);
  });
});