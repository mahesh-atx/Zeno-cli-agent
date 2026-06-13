// src/errors/test-manual.test.ts
// Run with: npx tsx src/errors/test-manual.test.ts

import { translateProviderError } from "./apiErrors";
import { parseRetryAfterMs } from "./apiErrors";

console.log("\n━━━ translateProviderError tests ━━━\n");

// ── Test 1: 429 with retry-after header ──
const fake429 = {
  status: 429,
  responseHeaders: { "retry-after": "30" },
};
const result1 = translateProviderError("groq", fake429, 1);
console.log("Test 1 — 429 rate limit:");
console.log("  kind:", result1.kind);                          // rate_limit
console.log("  retryable:", result1.retryable);               // true
console.log("  requiresUserAction:", result1.requiresUserAction); // false
if (result1.kind === "rate_limit") {
  console.log("  retryAfterMs:", result1.retryAfterMs);       // 30000
}

// ── Test 2: 401 auth error ──
const fake401 = { status: 401 };
const result2 = translateProviderError("openrouter", fake401, 1);
console.log("\nTest 2 — 401 auth:");
console.log("  kind:", result2.kind);                         // auth_error
console.log("  retryable:", result2.retryable);              // false
console.log("  requiresUserAction:", result2.requiresUserAction); // true

// ── Test 3: Network error (ECONNREFUSED) ──
const fakeNetwork = new Error("fetch failed: ECONNREFUSED");
const result3 = translateProviderError("nvidia", fakeNetwork, 1);
console.log("\nTest 3 — network error:");
console.log("  kind:", result3.kind);                         // network_error
console.log("  retryable:", result3.retryable);              // true
console.log("  requiresUserAction:", result3.requiresUserAction); // true

// ── Test 4: 500 server error ──
const fake500 = { status: 500 };
const result4 = translateProviderError("groq", fake500, 2);
console.log("\nTest 4 — 500 server error:");
console.log("  kind:", result4.kind);                         // server_error
console.log("  retryable:", result4.retryable);              // true
console.log("  message:", result4.message);                   // includes attempt 2

// ── Test 5: retry-after header parsing ──
console.log("\n━━━ parseRetryAfterMs tests ━━━\n");
console.log("  integer seconds '60':",
  parseRetryAfterMs({ "retry-after": "60" }));               // 60000
console.log("  no header:",
  parseRetryAfterMs({}));                                     // 60000 (default)
console.log("  x-ratelimit-reset-requests '45':",
  parseRetryAfterMs({ "x-ratelimit-reset-requests": "45" })); // 45000

console.log("\n✓ All tests complete\n");