// src/errors/test-agent-retry.test.ts
// Simulates the agent retry loop without hitting a real API
// Run with: npx tsx src/errors/test-agent-retry.test.ts

import {
  isRateLimitEvent,
  isNetworkEvent,
  isAuthEvent,
  makeRateLimitEvent,
  makeNetworkEvent,
  makeAuthEvent,
  makeServerErrorEvent,
  type AgentEvent,
} from "./base";

// ── Simulate what agent.ts does with each event type ──

function simulateAgentResponse(event: AgentEvent): string {
  if (isRateLimitEvent(event)) {
    return `PAUSE loop, wait ${event.retryAfterMs}ms, then retry`;
  }
  if (isNetworkEvent(event)) {
    return `PAUSE loop, show "Press R to retry", wait for user`;
  }
  if (isAuthEvent(event)) {
    return `STOP loop, hand to UI — unrecoverable`;
  }
  if (event.kind === "server_error") {
    return `PAUSE loop, exponential backoff, retry`;
  }
  return `STOP loop — unknown`;
}

console.log("\n━━━ Agent event routing tests ━━━\n");

const events: AgentEvent[] = [
  makeRateLimitEvent("groq", 30000),
  makeNetworkEvent("openrouter", "ECONNREFUSED"),
  makeAuthEvent("nvidia", 401),
  makeServerErrorEvent("groq", 500, 1),
  makeServerErrorEvent("groq", 503, 3),
];

for (const event of events) {
  console.log(`Event: ${event.kind}`);
  console.log(`  retryable: ${event.retryable}`);
  console.log(`  requiresUserAction: ${event.requiresUserAction}`);
  console.log(`  agent response: ${simulateAgentResponse(event)}`);
  console.log();
}

// ── Test retry signal mechanism ──
console.log("━━━ Retry signal test ━━━\n");

let pressed = false;
const retrySignal = {
  shouldRetry: () => pressed,
  reset: () => { pressed = false; },
};

console.log("Before press — shouldRetry:", retrySignal.shouldRetry()); // false
pressed = true;
console.log("After press  — shouldRetry:", retrySignal.shouldRetry()); // true
retrySignal.reset();
console.log("After reset  — shouldRetry:", retrySignal.shouldRetry()); // false

console.log("\n✓ Agent retry logic tests complete\n");
