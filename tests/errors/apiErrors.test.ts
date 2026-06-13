// src/errors/apiErrors.test.ts
import { describe, it, expect } from "vitest";
import { translateProviderError, parseRetryAfterMs } from "../../src/errors/apiErrors";

// ━━━ parseRetryAfterMs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseRetryAfterMs", () => {
  it("parses integer seconds from retry-after header", () => {
    expect(parseRetryAfterMs({ "retry-after": "60" })).toBe(60000);
  });

  it("parses integer seconds from Retry-After header (capitalized)", () => {
    expect(parseRetryAfterMs({ "Retry-After": "30" })).toBe(30000);
  });

  it("parses x-ratelimit-reset-requests header", () => {
    expect(
      parseRetryAfterMs({ "x-ratelimit-reset-requests": "45" })
    ).toBe(45000);
  });

  it("parses x-ratelimit-reset header", () => {
    expect(parseRetryAfterMs({ "x-ratelimit-reset": "20" })).toBe(20000);
  });

  it("returns default 60000ms when no header present", () => {
    expect(parseRetryAfterMs({})).toBe(60000);
  });

  it("returns default when header value is not a number", () => {
    expect(parseRetryAfterMs({ "retry-after": "not-a-number" })).toBe(60000);
  });

  it("treats large numbers as unix timestamps in seconds", () => {
    // A unix timestamp 30 seconds in the future
    const futureTs = Math.floor((Date.now() + 30000) / 1000);
    const result = parseRetryAfterMs({ "retry-after": String(futureTs) });
    // Should be approximately 30000ms (within 1s tolerance)
    expect(result).toBeGreaterThan(28000);
    expect(result).toBeLessThan(32000);
  });

  it("parses ISO date string", () => {
    const future = new Date(Date.now() + 30000).toISOString();
    const result = parseRetryAfterMs({ "retry-after": future });
    expect(result).toBeGreaterThan(28000);
    expect(result).toBeLessThan(32000);
  });

  it("prefers retry-after over x-ratelimit-reset-requests", () => {
    const result = parseRetryAfterMs({
      "retry-after": "10",
      "x-ratelimit-reset-requests": "60",
    });
    expect(result).toBe(10000);
  });
});

// ━━━ translateProviderError ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("translateProviderError — HTTP status codes via object", () => {
  it("401 → auth_error", () => {
    const e = translateProviderError("groq", { status: 401 }, 1);
    expect(e.kind).toBe("auth_error");
    expect(e.retryable).toBe(false);
    expect(e.requiresUserAction).toBe(true);
  });

  it("403 → auth_error", () => {
    const e = translateProviderError("groq", { status: 403 }, 1);
    expect(e.kind).toBe("auth_error");
  });

  it("429 → rate_limit", () => {
    const e = translateProviderError("groq", { status: 429 }, 1);
    expect(e.kind).toBe("rate_limit");
    expect(e.retryable).toBe(true);
    expect(e.requiresUserAction).toBe(false);
  });

  it("429 with retry-after header uses header value", () => {
    const e = translateProviderError(
      "groq",
      { status: 429, responseHeaders: { "retry-after": "30" } },
      1
    );
    if (e.kind === "rate_limit") {
      expect(e.retryAfterMs).toBe(30000);
    } else {
      expect.fail("Expected rate_limit event");
    }
  });

  it("429 without retry-after header uses default 60000ms", () => {
    const e = translateProviderError("groq", { status: 429 }, 1);
    if (e.kind === "rate_limit") {
      expect(e.retryAfterMs).toBe(60000);
    } else {
      expect.fail("Expected rate_limit event");
    }
  });

  it("500 → server_error", () => {
    const e = translateProviderError("groq", { status: 500 }, 1);
    expect(e.kind).toBe("server_error");
    expect(e.retryable).toBe(true);
  });

  it("502 → server_error", () => {
    const e = translateProviderError("groq", { status: 502 }, 1);
    expect(e.kind).toBe("server_error");
  });

  it("503 → server_error", () => {
    const e = translateProviderError("groq", { status: 503 }, 1);
    expect(e.kind).toBe("server_error");
  });

  it("server_error message includes attempt number", () => {
    const e = translateProviderError("groq", { status: 500 }, 3);
    expect(e.message).toContain("3");
  });

  it("statusCode field on object takes priority", () => {
    const e = translateProviderError("groq", { statusCode: 401 }, 1);
    expect(e.kind).toBe("auth_error");
  });

  it("stores provider name on all events", () => {
    const e401 = translateProviderError("openrouter", { status: 401 }, 1);
    const e429 = translateProviderError("nvidia", { status: 429 }, 1);
    const e500 = translateProviderError("groq", { status: 500 }, 1);

    if (e401.kind === "auth_error") expect(e401.provider).toBe("openrouter");
    if (e429.kind === "rate_limit") expect(e429.provider).toBe("nvidia");
    if (e500.kind === "server_error") expect(e500.provider).toBe("groq");
  });
});

describe("translateProviderError — network-level Error objects", () => {
  it("ECONNREFUSED → network_error", () => {
    const e = translateProviderError(
      "groq",
      new Error("fetch failed: ECONNREFUSED"),
      1
    );
    expect(e.kind).toBe("network_error");
    expect(e.retryable).toBe(true);
    expect(e.requiresUserAction).toBe(true);
  });

  it("ENOTFOUND → network_error", () => {
    const e = translateProviderError(
      "groq",
      new Error("getaddrinfo ENOTFOUND api.groq.com"),
      1
    );
    expect(e.kind).toBe("network_error");
  });

  it("ECONNRESET → network_error", () => {
    const e = translateProviderError(
      "groq",
      new Error("socket hang up ECONNRESET"),
      1
    );
    expect(e.kind).toBe("network_error");
  });

  it("fetch failed → network_error", () => {
    const e = translateProviderError("groq", new Error("fetch failed"), 1);
    expect(e.kind).toBe("network_error");
  });

  it("401 in message string → auth_error", () => {
    const e = translateProviderError(
      "groq",
      new Error("Request failed with status 401"),
      1
    );
    expect(e.kind).toBe("auth_error");
  });

  it("unauthorized in message string → auth_error", () => {
    const e = translateProviderError(
      "groq",
      new Error("unauthorized"),
      1
    );
    expect(e.kind).toBe("auth_error");
  });

  it("429 in message string → rate_limit", () => {
    const e = translateProviderError(
      "groq",
      new Error("Request failed with status 429"),
      1
    );
    expect(e.kind).toBe("rate_limit");
  });

  it("rate limit in message string → rate_limit", () => {
    const e = translateProviderError(
      "groq",
      new Error("rate limit exceeded"),
      1
    );
    expect(e.kind).toBe("rate_limit");
  });

  it("500 in message string → server_error", () => {
    const e = translateProviderError(
      "groq",
      new Error("Request failed with status 500"),
      1
    );
    expect(e.kind).toBe("server_error");
  });
});

describe("translateProviderError — unknown inputs", () => {
  it("null → unknown_error", () => {
    const e = translateProviderError("groq", null, 1);
    expect(e.kind).toBe("unknown_error");
  });

  it("string → unknown_error", () => {
    const e = translateProviderError("groq", "some string error", 1);
    expect(e.kind).toBe("unknown_error");
  });

  it("number → unknown_error", () => {
    const e = translateProviderError("groq", 42, 1);
    expect(e.kind).toBe("unknown_error");
  });

  it("empty object → unknown_error", () => {
    const e = translateProviderError("groq", {}, 1);
    expect(e.kind).toBe("unknown_error");
  });

  it("unknown_error is not retryable", () => {
    const e = translateProviderError("groq", null, 1);
    expect(e.retryable).toBe(false);
  });
});