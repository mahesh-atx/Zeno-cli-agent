// src/core/tokens.test.ts
import { describe, it, expect } from "vitest";
import {
  countTokens,
  countMessageTokens,
  countHistoryTokens,
  formatTokenCount,
} from "../../src/utils/tokens";
import type { Message } from "../../src/core/conversation";

// ━━━ countTokens ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("countTokens", () => {
  it("returns 0 for empty string", () => {
    expect(countTokens("")).toBe(0);
  });

  it("returns 0 for null-like empty input", () => {
    expect(countTokens("")).toBe(0);
  });

  it("returns positive number for non-empty string", () => {
    expect(countTokens("hello world")).toBeGreaterThan(0);
  });

  it("longer strings have more tokens than shorter", () => {
    const short = countTokens("hello");
    const long = countTokens("hello world this is a much longer string");
    expect(long).toBeGreaterThan(short);
  });

  it("uses approximately 1 token per 4 characters", () => {
    // 40 chars → ~10 tokens (ceil(40/4) = 10)
    const text = "a".repeat(40);
    expect(countTokens(text)).toBe(10);
  });

  it("rounds up (ceil not floor)", () => {
    // 5 chars → ceil(5/4) = 2
    expect(countTokens("hello")).toBe(2);
  });
});

// ━━━ countMessageTokens ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("countMessageTokens", () => {
  it("adds 4 overhead tokens to content tokens", () => {
    const msg: Message = { role: "user", content: "hello" };
    const contentTokens = countTokens("hello");
    expect(countMessageTokens(msg)).toBe(contentTokens + 4);
  });

  it("works for all roles", () => {
    const roles: Array<Message["role"]> = ["system", "user", "assistant"];
    for (const role of roles) {
      const msg: Message = { role, content: "test content" };
      expect(countMessageTokens(msg)).toBeGreaterThan(0);
    }
  });

  it("empty content message still has overhead tokens", () => {
    const msg: Message = { role: "user", content: "" };
    expect(countMessageTokens(msg)).toBe(4);
  });
});

// ━━━ countHistoryTokens ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("countHistoryTokens", () => {
  it("returns 0 for empty array", () => {
    expect(countHistoryTokens([])).toBe(0);
  });

  it("sums tokens across all messages", () => {
    const messages: Message[] = [
      { role: "system", content: "You are an assistant." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];
    const expected = messages.reduce(
      (sum, m) => sum + countMessageTokens(m),
      0
    );
    expect(countHistoryTokens(messages)).toBe(expected);
  });

  it("single message returns countMessageTokens of that message", () => {
    const msg: Message = { role: "user", content: "test" };
    expect(countHistoryTokens([msg])).toBe(countMessageTokens(msg));
  });

  it("more messages = more tokens", () => {
    const few: Message[] = [
      { role: "user", content: "hello" },
    ];
    const many: Message[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "how are you" },
      { role: "assistant", content: "fine thanks" },
    ];
    expect(countHistoryTokens(many)).toBeGreaterThan(countHistoryTokens(few));
  });
});

// ━━━ formatTokenCount ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatTokenCount", () => {
  it("formats zero", () => {
    expect(formatTokenCount(0)).toBe("0");
  });

  it("formats small number without commas", () => {
    const result = formatTokenCount(999);
    expect(result).toContain("999");
  });

  it("formats thousands with comma separator", () => {
    // en-US locale uses commas
    const result = formatTokenCount(1000);
    expect(result).toBe("1,000");
  });

  it("formats large number correctly", () => {
    const result = formatTokenCount(128000);
    expect(result).toBe("128,000");
  });

  it("returns a string", () => {
    expect(typeof formatTokenCount(42)).toBe("string");
  });
});