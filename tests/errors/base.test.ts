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
  isAgentPausedEvent,
  isAgentTurnEndEvent,
  type AgentEvent,
  type AgentPausedEvent,
  type AgentTurnEndEvent,
} from "../../src/errors/base";

// ─── Factory Tests ──────────────────────────────────────────────────────────

describe("makeRateLimitEvent", () => {
  it("has correct kind", () => {
    const e = makeRateLimitEvent("groq", 5000);
    expect(e.kind).toBe("rate_limit");
  });

  it("has retryable true", () => {
    const e = makeRateLimitEvent("groq", 5000);
    expect(e.retryable).toBe(true);
  });

  it("has requiresUserAction false", () => {
    const e = makeRateLimitEvent("groq", 5000);
    expect(e.requiresUserAction).toBe(false);
  });

  it("stores retryAfterMs", () => {
    const e = makeRateLimitEvent("groq", 8000);
    expect(e.retryAfterMs).toBe(8000);
  });

  it("stores provider", () => {
    const e = makeRateLimitEvent("openrouter", 1000);
    expect(e.provider).toBe("openrouter");
  });

  it("uses default statusCode 429", () => {
    const e = makeRateLimitEvent("groq", 1000);
    expect(e.statusCode).toBe(429);
  });

  it("accepts custom statusCode", () => {
    const e = makeRateLimitEvent("groq", 1000, 503);
    expect(e.statusCode).toBe(503);
  });

  it("message includes provider name", () => {
    const e = makeRateLimitEvent("groq", 5000);
    expect(e.message).toContain("groq");
  });

  it("message includes wait time in seconds", () => {
    const e = makeRateLimitEvent("groq", 5000);
    expect(e.message).toContain("5s");
  });

  it("has a timestamp", () => {
    const before = Date.now();
    const e = makeRateLimitEvent("groq", 1000);
    const after = Date.now();
    expect(e.timestamp).toBeGreaterThanOrEqual(before);
    expect(e.timestamp).toBeLessThanOrEqual(after);
  });
});

describe("makeAuthEvent", () => {
  it("has correct kind", () => {
    const e = makeAuthEvent("nvidia");
    expect(e.kind).toBe("auth_error");
  });

  it("has retryable false", () => {
    const e = makeAuthEvent("nvidia");
    expect(e.retryable).toBe(false);
  });

  it("has requiresUserAction true", () => {
    const e = makeAuthEvent("nvidia");
    expect(e.requiresUserAction).toBe(true);
  });

  it("defaults to statusCode 401", () => {
    const e = makeAuthEvent("nvidia");
    expect(e.statusCode).toBe(401);
  });

  it("message mentions API key", () => {
    const e = makeAuthEvent("nvidia");
    expect(e.message.toLowerCase()).toMatch(/api key|authentication/i);
  });
});

describe("makeNetworkEvent", () => {
  it("has correct kind", () => {
    const e = makeNetworkEvent("groq", "ECONNRESET");
    expect(e.kind).toBe("network_error");
  });

  it("has retryable true", () => {
    const e = makeNetworkEvent("groq", "timeout");
    expect(e.retryable).toBe(true);
  });

  it("has requiresUserAction true", () => {
    const e = makeNetworkEvent("groq", "timeout");
    expect(e.requiresUserAction).toBe(true);
  });

  it("message includes detail", () => {
    const e = makeNetworkEvent("groq", "ECONNRESET");
    expect(e.message).toContain("ECONNRESET");
  });

  it("message tells user to press R", () => {
    const e = makeNetworkEvent("groq", "timeout");
    expect(e.message).toMatch(/press R/i);
  });
});

describe("makeServerErrorEvent", () => {
  it("has correct kind", () => {
    const e = makeServerErrorEvent("openrouter", 500, 1);
    expect(e.kind).toBe("server_error");
  });

  it("has retryable true", () => {
    const e = makeServerErrorEvent("openrouter", 500, 1);
    expect(e.retryable).toBe(true);
  });

  it("message includes status code", () => {
    const e = makeServerErrorEvent("openrouter", 503, 2);
    expect(e.message).toContain("503");
  });

  it("message includes attempt number", () => {
    const e = makeServerErrorEvent("openrouter", 500, 3);
    expect(e.message).toContain("3");
  });
});

describe("makeToolErrorEvent", () => {
  it("has correct kind", () => {
    const e = makeToolErrorEvent("read_file", new Error("ENOENT"));
    expect(e.kind).toBe("tool_error");
  });

  it("has retryable false", () => {
    const e = makeToolErrorEvent("read_file", new Error("ENOENT"));
    expect(e.retryable).toBe(false);
  });

  it("captures Error message", () => {
    const e = makeToolErrorEvent("read_file", new Error("file not found"));
    expect(e.message).toContain("file not found");
  });

  it("captures string error", () => {
    const e = makeToolErrorEvent("write_file", "permission denied");
    expect(e.message).toContain("permission denied");
  });

  it("stores toolName", () => {
    const e = makeToolErrorEvent("run_command", new Error("timeout"));
    expect(e.toolName).toBe("run_command");
  });

  it("toolResultText is a clean string for LLM", () => {
    const e = makeToolErrorEvent("read_file", new Error("ENOENT"));
    expect(typeof e.toolResultText).toBe("string");
    expect(e.toolResultText.length).toBeGreaterThan(0);
  });

  it("handles null error gracefully", () => {
    const e = makeToolErrorEvent("list_files", null);
    expect(e.message).toBeDefined();
    expect(typeof e.message).toBe("string");
  });

  it("handles undefined error gracefully", () => {
    const e = makeToolErrorEvent("list_files", undefined);
    expect(e.message).toBeDefined();
  });
});

describe("makeUnknownErrorEvent", () => {
  it("has correct kind", () => {
    const e = makeUnknownErrorEvent(new Error("strange"));
    expect(e.kind).toBe("unknown_error");
  });

  it("has retryable false", () => {
    const e = makeUnknownErrorEvent(new Error("strange"));
    expect(e.retryable).toBe(false);
  });

  it("has requiresUserAction true", () => {
    const e = makeUnknownErrorEvent(new Error("strange"));
    expect(e.requiresUserAction).toBe(true);
  });

  it("extracts message from Error", () => {
    const e = makeUnknownErrorEvent(new Error("very strange"));
    expect(e.message).toBe("very strange");
  });
});

// ─── Type Guard Tests ───────────────────────────────────────────────────────

describe("Type Guards", () => {
  it("isRateLimitEvent returns true for rate_limit", () => {
    const e = makeRateLimitEvent("groq", 1000);
    expect(isRateLimitEvent(e)).toBe(true);
  });

  it("isRateLimitEvent returns false for other kinds", () => {
    const e = makeAuthEvent("groq");
    expect(isRateLimitEvent(e)).toBe(false);
  });

  it("isAuthEvent returns true for auth_error", () => {
    const e = makeAuthEvent("groq");
    expect(isAuthEvent(e)).toBe(true);
  });

  it("isNetworkEvent returns true for network_error", () => {
    const e = makeNetworkEvent("groq", "ECONNRESET");
    expect(isNetworkEvent(e)).toBe(true);
  });

  it("isServerErrorEvent returns true for server_error", () => {
    const e = makeServerErrorEvent("groq", 500, 1);
    expect(isServerErrorEvent(e)).toBe(true);
  });

  it("isToolErrorEvent returns true for tool_error", () => {
    const e = makeToolErrorEvent("read_file", new Error("x"));
    expect(isToolErrorEvent(e)).toBe(true);
  });

  it("isAgentPausedEvent returns true for agent_paused", () => {
    const e: AgentPausedEvent = {
      kind: "agent_paused",
      message: "test",
      question: "What do you want?",
      retryable: false,
      requiresUserAction: true,
      timestamp: Date.now(),
    };
    expect(isAgentPausedEvent(e)).toBe(true);
  });

  it("isAgentPausedEvent returns false for non-paused", () => {
    const e = makeRateLimitEvent("groq", 1000);
    expect(isAgentPausedEvent(e)).toBe(false);
  });

  it("isAgentTurnEndEvent returns true for agent_turn_end", () => {
    const e: AgentTurnEndEvent = {
      kind: "agent_turn_end",
      message: "done",
      uiMessage: { content: "All done", type: "success" },
      retryable: false,
      requiresUserAction: false,
      timestamp: Date.now(),
    };
    expect(isAgentTurnEndEvent(e)).toBe(true);
  });

  it("isAgentTurnEndEvent returns false for non-end", () => {
    const e = makeNetworkEvent("groq", "timeout");
    expect(isAgentTurnEndEvent(e)).toBe(false);
  });

  it("all guards return false for every other event kind", () => {
    const events: AgentEvent[] = [
      makeRateLimitEvent("groq", 1000),
      makeAuthEvent("groq"),
      makeNetworkEvent("groq", "x"),
      makeServerErrorEvent("groq", 500, 1),
      makeToolErrorEvent("read_file", new Error("x")),
      makeUnknownErrorEvent(new Error("x")),
    ];

    for (const e of events) {
      if (e.kind !== "agent_paused") expect(isAgentPausedEvent(e)).toBe(false);
      if (e.kind !== "agent_turn_end") expect(isAgentTurnEndEvent(e)).toBe(false);
    }
  });
});