import { describe, it, expect } from "vitest";
import {
  isRateLimitEvent,
  isNetworkEvent,
  isAuthEvent,
  makeRateLimitEvent,
  makeNetworkEvent,
  makeAuthEvent,
  makeServerErrorEvent,
  type AgentEvent,
} from "../../src/errors/base";

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

describe("Agent Retry Logic", () => {
  it("routes rate_limit events correctly", () => {
    const event = makeRateLimitEvent("groq", 30000);
    expect(event.retryable).toBe(true);
    expect(event.requiresUserAction).toBe(false);
    expect(simulateAgentResponse(event)).toBe("PAUSE loop, wait 30000ms, then retry");
  });

  it("routes network_error events correctly", () => {
    const event = makeNetworkEvent("openrouter", "ECONNREFUSED");
    expect(event.retryable).toBe(true);
    expect(event.requiresUserAction).toBe(true);
    expect(simulateAgentResponse(event)).toBe("PAUSE loop, show \"Press R to retry\", wait for user");
  });

  it("routes auth_error events correctly", () => {
    const event = makeAuthEvent("nvidia", 401);
    expect(event.retryable).toBe(false);
    expect(event.requiresUserAction).toBe(true);
    expect(simulateAgentResponse(event)).toBe("STOP loop, hand to UI — unrecoverable");
  });

  it("routes server_error events correctly", () => {
    const event1 = makeServerErrorEvent("groq", 500, 1);
    expect(event1.retryable).toBe(true);
    expect(event1.requiresUserAction).toBe(false);
    expect(simulateAgentResponse(event1)).toBe("PAUSE loop, exponential backoff, retry");

    const event2 = makeServerErrorEvent("groq", 503, 3);
    expect(event2.retryable).toBe(true);
    expect(simulateAgentResponse(event2)).toBe("PAUSE loop, exponential backoff, retry");
  });

  it("handles retry signal mechanism", () => {
    let pressed = false;
    const retrySignal = {
      shouldRetry: () => pressed,
      reset: () => { pressed = false; },
    };

    expect(retrySignal.shouldRetry()).toBe(false);
    
    pressed = true;
    expect(retrySignal.shouldRetry()).toBe(true);
    
    retrySignal.reset();
    expect(retrySignal.shouldRetry()).toBe(false);
  });
});
