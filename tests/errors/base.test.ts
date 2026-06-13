// Empty test file
// src/errors/base.test.ts
import { describe, it, expect } from "vitest";
import {
  makeRateLimitEvent,
  makeAuthEvent,
  makeNetworkEvent,
  makeServerErrorEvent,
  makeToolErrorEvent,
  makeUnknownErrorEvent,
  isRateLimitEvent,
  isAuthEvent,
  isNetworkEvent,
  isServerErrorEvent,
  isToolErrorEvent,
  type AgentEvent,
} from "../../src/errors/base";

// ━━━ Factory: makeRateLimitEvent ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("makeRateLimitEvent", () => {
  it("produces correct kind", () => {
    const e = makeRateLimitEvent("groq", 30000);
    expect(e.kind).toBe("rate_limit");
  });

  it("is retryable and does not require user action", () => {
    const e = makeRateLimitEvent("groq", 30000);
    expect(e.retryable).toBe(true);
    expect(e.requiresUserAction).toBe(false);
  });

  it("stores retryAfterMs correctly", () => {
    const e = makeRateLimitEvent("groq", 45000);
    expect(e.retryAfterMs).toBe(45000);
  });

  it("stores provider correctly", () => {
    const e = makeRateLimitEvent("openrouter", 30000);
    expect(e.provider).toBe("openrouter");
  });

  it("stores statusCode correctly", () => {
    const e = makeRateLimitEvent("groq", 30000, 429);
    expect(e.statusCode).toBe(429);
  });

  it("includes human readable message with seconds", () => {
    const e = makeRateLimitEvent("groq", 30000);
    expect(e.message).toContain("30s");
    expect(e.message).toContain("groq");
  });

  it("sets timestamp close to now", () => {
    const before = Date.now();
    const e = makeRateLimitEvent("groq", 30000);
    const after = Date.now();
    expect(e.timestamp).toBeGreaterThanOrEqual(before);
    expect(e.timestamp).toBeLessThanOrEqual(after);
  });
});

// ━━━ Factory: makeAuthEvent ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("makeAuthEvent", () => {
  it("produces correct kind", () => {
    const e = makeAuthEvent("nvidia");
    expect(e.kind).toBe("auth_error");
  });

  it("is not retryable and requires user action", () => {
    const e = makeAuthEvent("nvidia");
    expect(e.retryable).toBe(false);
    expect(e.requiresUserAction).toBe(true);
  });

  it("stores provider", () => {
    const e = makeAuthEvent("nvidia");
    expect(e.provider).toBe("nvidia");
  });

  it("defaults statusCode to 401", () => {
    const e = makeAuthEvent("groq");
    expect(e.statusCode).toBe(401);
  });

  it("accepts custom statusCode", () => {
    const e = makeAuthEvent("groq", 403);
    expect(e.statusCode).toBe(403);
  });

  it("includes provider in message", () => {
    const e = makeAuthEvent("openrouter");
    expect(e.message).toContain("openrouter");
  });
});

// ━━━ Factory: makeNetworkEvent ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("makeNetworkEvent", () => {
  it("produces correct kind", () => {
    const e = makeNetworkEvent("groq", "ECONNREFUSED");
    expect(e.kind).toBe("network_error");
  });

  it("is retryable and requires user action", () => {
    const e = makeNetworkEvent("groq", "ECONNREFUSED");
    expect(e.retryable).toBe(true);
    expect(e.requiresUserAction).toBe(true);
  });

  it("includes provider and detail in message", () => {
    const e = makeNetworkEvent("groq", "ECONNREFUSED");
    expect(e.message).toContain("groq");
    expect(e.message).toContain("ECONNREFUSED");
  });

  it("sets provider field", () => {
    const e = makeNetworkEvent("nvidia", "ENOTFOUND");
    expect(e.provider).toBe("nvidia");
  });
});

// ━━━ Factory: makeServerErrorEvent ━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("makeServerErrorEvent", () => {
  it("produces correct kind", () => {
    const e = makeServerErrorEvent("groq", 500, 1);
    expect(e.kind).toBe("server_error");
  });

  it("is retryable and does not require user action", () => {
    const e = makeServerErrorEvent("groq", 500, 1);
    expect(e.retryable).toBe(true);
    expect(e.requiresUserAction).toBe(false);
  });

  it("includes attempt number in message", () => {
    const e = makeServerErrorEvent("groq", 500, 3);
    expect(e.message).toContain("3");
  });

  it("stores statusCode", () => {
    const e = makeServerErrorEvent("groq", 503, 1);
    expect(e.statusCode).toBe(503);
  });
});

// ━━━ Factory: makeToolErrorEvent ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("makeToolErrorEvent", () => {
  it("produces correct kind", () => {
    const e = makeToolErrorEvent("read_file", new Error("boom"));
    expect(e.kind).toBe("tool_error");
  });

  it("is not retryable", () => {
    const e = makeToolErrorEvent("read_file", new Error("boom"));
    expect(e.retryable).toBe(false);
  });

  it("does not require user action", () => {
    const e = makeToolErrorEvent("read_file", new Error("boom"));
    expect(e.requiresUserAction).toBe(false);
  });

  it("stores toolName", () => {
    const e = makeToolErrorEvent("write_file", new Error("boom"));
    expect(e.toolName).toBe("write_file");
  });

  it("formats toolResultText for LLM consumption", () => {
    const e = makeToolErrorEvent("run_command", new Error("permission denied"));
    expect(e.toolResultText).toContain("run_command");
    expect(e.toolResultText).toContain("permission denied");
  });

  it("handles non-Error thrown values", () => {
    const e = makeToolErrorEvent("list_files", "raw string thrown");
    expect(e.toolResultText).toContain("raw string thrown");
  });

  it("handles null thrown value", () => {
    const e = makeToolErrorEvent("list_files", null);
    expect(e.kind).toBe("tool_error");
  });
});

// ━━━ Factory: makeUnknownErrorEvent ━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("makeUnknownErrorEvent", () => {
  it("produces correct kind", () => {
    const e = makeUnknownErrorEvent(new Error("???"));
    expect(e.kind).toBe("unknown_error");
  });

  it("is not retryable and requires user action", () => {
    const e = makeUnknownErrorEvent(new Error("???"));
    expect(e.retryable).toBe(false);
    expect(e.requiresUserAction).toBe(true);
  });

  it("captures error message", () => {
    const e = makeUnknownErrorEvent(new Error("something weird"));
    expect(e.message).toContain("something weird");
  });

  it("handles string thrown", () => {
    const e = makeUnknownErrorEvent("raw string");
    expect(e.message).toContain("raw string");
  });
});

// ━━━ Type Guards ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("type guards", () => {
  const events: AgentEvent[] = [
    makeRateLimitEvent("groq", 30000),
    makeAuthEvent("groq"),
    makeNetworkEvent("groq", "ECONNREFUSED"),
    makeServerErrorEvent("groq", 500, 1),
    makeToolErrorEvent("read_file", new Error("boom")),
    makeUnknownErrorEvent(new Error("???")),
  ];

  it("isRateLimitEvent — true only for rate_limit", () => {
    const results = events.map(isRateLimitEvent);
    expect(results).toEqual([true, false, false, false, false, false]);
  });

  it("isAuthEvent — true only for auth_error", () => {
    const results = events.map(isAuthEvent);
    expect(results).toEqual([false, true, false, false, false, false]);
  });

  it("isNetworkEvent — true only for network_error", () => {
    const results = events.map(isNetworkEvent);
    expect(results).toEqual([false, false, true, false, false, false]);
  });

  it("isServerErrorEvent — true only for server_error", () => {
    const results = events.map(isServerErrorEvent);
    expect(results).toEqual([false, false, false, true, false, false]);
  });

  it("isToolErrorEvent — true only for tool_error", () => {
    const results = events.map(isToolErrorEvent);
    expect(results).toEqual([false, false, false, false, true, false]);
  });

  it("type guard narrows type correctly for rate_limit", () => {
    const e = events[0];
    if (isRateLimitEvent(e)) {
      // TypeScript would error here if narrowing failed
      expect(typeof e.retryAfterMs).toBe("number");
      expect(typeof e.provider).toBe("string");
    }
  });

  it("type guard narrows type correctly for tool_error", () => {
    const e = events[4];
    if (isToolErrorEvent(e)) {
      expect(typeof e.toolName).toBe("string");
      expect(typeof e.toolResultText).toBe("string");
    }
  });
});