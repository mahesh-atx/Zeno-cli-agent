// src/errors/apiErrors.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Provider Layer translation — reads HTTP status codes and
// headers, returns typed AgentEvents. Never throws to console.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  AgentEvent,
  makeAuthEvent,
  makeNetworkEvent,
  makeRateLimitEvent,
  makeServerErrorEvent,
  makeUnknownErrorEvent,
} from "./base";

// ─── Retry-After Header Parsing ──────────────────────────────
// Providers encode this differently:
//   Groq:       "retry-after" as integer seconds
//   OpenRouter: "x-ratelimit-reset-requests" as ISO timestamp or seconds
//   NVIDIA:     "retry-after" as integer seconds

const DEFAULT_RATE_LIMIT_MS = 60_000; // 1 minute fallback

export function parseRetryAfterMs(headers: Record<string, string>): number {
  // Try standard retry-after (seconds as integer)
  const retryAfter =
    headers["retry-after"] ??
    headers["Retry-After"] ??
    headers["x-ratelimit-reset-requests"] ??
    headers["x-ratelimit-reset"];

  if (!retryAfter) return DEFAULT_RATE_LIMIT_MS;

  // If it looks like a number, treat as seconds
  const asNumber = Number(retryAfter);
  if (!isNaN(asNumber) && asNumber > 0) {
    // Sanity: if > 100000 it's probably a unix timestamp in seconds
    if (asNumber > 100_000) {
      const ms = asNumber * 1000 - Date.now();
      return ms > 0 ? ms : DEFAULT_RATE_LIMIT_MS;
    }
    return asNumber * 1000;
  }

  // If it looks like an ISO date string
  const asDate = Date.parse(retryAfter);
  if (!isNaN(asDate)) {
    const ms = asDate - Date.now();
    return ms > 0 ? ms : DEFAULT_RATE_LIMIT_MS;
  }

  return DEFAULT_RATE_LIMIT_MS;
}

// ─── Main Translation Function ────────────────────────────────
// Call this inside every provider's catch block.
// Input:  raw unknown error from AI SDK / fetch
// Output: typed AgentEvent — never throws

export function translateProviderError(
  provider: string,
  error: unknown,
  attempt = 1
): AgentEvent {
  // ── AI SDK wraps HTTP errors in objects with a .status field ──
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;

    // Status code — AI SDK exposes this as .status or .statusCode
    const status =
      typeof e["status"] === "number"
        ? e["status"]
        : typeof e["statusCode"] === "number"
        ? e["statusCode"]
        : null;

    // Response headers — AI SDK may expose as .responseHeaders
    const headers: Record<string, string> =
      typeof e["responseHeaders"] === "object" && e["responseHeaders"] !== null
        ? (e["responseHeaders"] as Record<string, string>)
        : {};

    if (status === 401 || status === 403) {
      return makeAuthEvent(provider, status);
    }

    if (status === 429) {
      const retryAfterMs = parseRetryAfterMs(headers);
      return makeRateLimitEvent(provider, retryAfterMs, status);
    }

    if (status !== null && status >= 500 && status < 600) {
      return makeServerErrorEvent(provider, status, attempt);
    }
  }

  // ── Network-level errors (no HTTP response at all) ──
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("econnreset") ||
      msg.includes("network") ||
      msg.includes("fetch failed") ||
      msg.includes("etimedout") ||
      msg.includes("socket hang up")
    ) {
      return makeNetworkEvent(provider, error.message);
    }

    // String-based status detection (fallback for SDK versions that
    // embed the status in the message string)
    const msgRaw = error.message;

    if (msgRaw.includes("401") || msgRaw.toLowerCase().includes("unauthorized")) {
      return makeAuthEvent(provider, 401);
    }
    if (msgRaw.includes("429") || msgRaw.toLowerCase().includes("rate limit")) {
      return makeRateLimitEvent(provider, DEFAULT_RATE_LIMIT_MS, 429);
    }
    if (msgRaw.includes("500") || msgRaw.includes("503") || msgRaw.includes("502")) {
      return makeServerErrorEvent(provider, 500, attempt);
    }
  }

  return makeUnknownErrorEvent(error);
}