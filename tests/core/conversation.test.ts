// src/core/conversation.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { Conversation } from "../../src/core/conversation";

// ━━━ Constructor ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Conversation — constructor", () => {
  it("starts empty", () => {
    const c = new Conversation();
    expect(c.isEmpty()).toBe(true);
    expect(c.getMessageCount()).toBe(0);
  });

  it("uses default system prompt", () => {
    const c = new Conversation();
    const msgs = c.getMessages();
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content.length).toBeGreaterThan(0);
  });

  it("accepts custom system prompt", () => {
    const c = new Conversation("Custom prompt.");
    expect(c.getBaseSystemPrompt()).toBe("Custom prompt.");
  });
});

// ━━━ addUserMessage / addAssistantMessage ━━━━━━━━━━━━━━━━━━━━━

describe("Conversation — adding messages", () => {
  let c: Conversation;
  beforeEach(() => { c = new Conversation(); });

  it("addUserMessage increments count", () => {
    c.addUserMessage("hello");
    expect(c.getMessageCount()).toBe(1);
  });

  it("addAssistantMessage increments count", () => {
    c.addAssistantMessage("hi");
    expect(c.getMessageCount()).toBe(1);
  });

  it("adds messages in order", () => {
    c.addUserMessage("user1");
    c.addAssistantMessage("assistant1");
    c.addUserMessage("user2");
    const history = c.getHistory();
    expect(history[0].content).toBe("user1");
    expect(history[1].content).toBe("assistant1");
    expect(history[2].content).toBe("user2");
  });

  it("addUserMessage sets correct role", () => {
    c.addUserMessage("hello");
    expect(c.getHistory()[0].role).toBe("user");
  });

  it("addAssistantMessage sets correct role", () => {
    c.addAssistantMessage("hello");
    expect(c.getHistory()[0].role).toBe("assistant");
  });
});

// ━━━ getMessages ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Conversation.getMessages", () => {
  it("always has system prompt at index 0", () => {
    const c = new Conversation();
    expect(c.getMessages()[0].role).toBe("system");
  });

  it("system prompt is at index 0 even with messages", () => {
    const c = new Conversation();
    c.addUserMessage("hello");
    c.addAssistantMessage("hi");
    expect(c.getMessages()[0].role).toBe("system");
  });

  it("returns system + history in correct order", () => {
    const c = new Conversation("SYS");
    c.addUserMessage("U");
    c.addAssistantMessage("A");
    const msgs = c.getMessages();
    expect(msgs).toHaveLength(3);
    expect(msgs[0].content).toBe("SYS");
    expect(msgs[1].content).toBe("U");
    expect(msgs[2].content).toBe("A");
  });

  it("does not mutate internal state", () => {
    const c = new Conversation();
    c.addUserMessage("hello");
    const msgs1 = c.getMessages();
    msgs1.push({ role: "user", content: "injected" });
    expect(c.getMessageCount()).toBe(1);
  });
});

// ━━━ getHistory ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Conversation.getHistory", () => {
  it("returns empty array initially", () => {
    const c = new Conversation();
    expect(c.getHistory()).toHaveLength(0);
  });

  it("does not include system prompt", () => {
    const c = new Conversation("SYS");
    c.addUserMessage("U");
    const h = c.getHistory();
    expect(h.every((m) => m.role !== "system")).toBe(true);
  });

  it("returns a copy, not internal reference", () => {
    const c = new Conversation();
    c.addUserMessage("hello");
    const h = c.getHistory();
    h.push({ role: "user", content: "injected" });
    expect(c.getMessageCount()).toBe(1);
  });
});

// ━━━ updateSystemPrompt ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Conversation.updateSystemPrompt", () => {
  it("changes the system prompt in getMessages", () => {
    const c = new Conversation("original");
    c.updateSystemPrompt("updated");
    expect(c.getMessages()[0].content).toBe("updated");
  });

  it("does not change getBaseSystemPrompt", () => {
    const c = new Conversation("base");
    c.updateSystemPrompt("with context block\n---\nbase");
    expect(c.getBaseSystemPrompt()).toBe("base");
  });
});

// ━━━ updateBaseSystemPrompt ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Conversation.updateBaseSystemPrompt", () => {
  it("updates both base and active prompt", () => {
    const c = new Conversation("old");
    c.updateBaseSystemPrompt("new base");
    expect(c.getBaseSystemPrompt()).toBe("new base");
    expect(c.getMessages()[0].content).toBe("new base");
  });
});

// ━━━ removeLastMessage ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Conversation.removeLastMessage", () => {
  it("removes the last message", () => {
    const c = new Conversation();
    c.addUserMessage("hello");
    c.addAssistantMessage("hi");
    c.removeLastMessage();
    expect(c.getMessageCount()).toBe(1);
    expect(c.getHistory()[0].content).toBe("hello");
  });

  it("does nothing when empty", () => {
    const c = new Conversation();
    expect(() => c.removeLastMessage()).not.toThrow();
    expect(c.getMessageCount()).toBe(0);
  });
});

// ━━━ removeLastExchange ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Conversation.removeLastExchange", () => {
  it("removes last assistant message if present", () => {
    const c = new Conversation();
    c.addUserMessage("u");
    c.addAssistantMessage("a");
    c.removeLastExchange();
    expect(c.getMessageCount()).toBe(1);
    expect(c.getHistory()[0].role).toBe("user");
  });

  it("does nothing if last message is user", () => {
    const c = new Conversation();
    c.addUserMessage("u");
    c.removeLastExchange();
    expect(c.getMessageCount()).toBe(1);
  });
});

// ━━━ applyTruncatedHistory ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Conversation.applyTruncatedHistory", () => {
  it("replaces message history with truncated array", () => {
    const c = new Conversation("SYS");
    c.addUserMessage("u1");
    c.addAssistantMessage("a1");
    c.addUserMessage("u2");
    c.addAssistantMessage("a2");

    // Simulate truncation — keep only last exchange
    const truncated = [
      { role: "system" as const, content: "SYS" },
      { role: "user" as const, content: "u2" },
      { role: "assistant" as const, content: "a2" },
    ];
    c.applyTruncatedHistory(truncated);
    expect(c.getMessageCount()).toBe(2);
    expect(c.getHistory()[0].content).toBe("u2");
  });

  it("strips system message from front if present", () => {
    const c = new Conversation("SYS");
    c.addUserMessage("u");

    const truncated = [
      { role: "system" as const, content: "SYS" },
      { role: "user" as const, content: "u" },
    ];
    c.applyTruncatedHistory(truncated);
    // Should only have 1 message (system stripped)
    expect(c.getMessageCount()).toBe(1);
    expect(c.getHistory()[0].role).toBe("user");
  });

  it("getMessages still has system prompt at index 0 after apply", () => {
    const c = new Conversation("SYS");
    c.addUserMessage("u");
    const truncated = [
      { role: "system" as const, content: "SYS" },
      { role: "user" as const, content: "u" },
    ];
    c.applyTruncatedHistory(truncated);
    expect(c.getMessages()[0].role).toBe("system");
  });
});

// ━━━ clear ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Conversation.clear", () => {
  it("removes all messages", () => {
    const c = new Conversation();
    c.addUserMessage("u");
    c.addAssistantMessage("a");
    c.clear();
    expect(c.isEmpty()).toBe(true);
    expect(c.getMessageCount()).toBe(0);
  });

  it("resets system prompt to base", () => {
    const c = new Conversation("BASE");
    c.updateSystemPrompt("with context files\n---\nBASE");
    c.clear();
    expect(c.getMessages()[0].content).toBe("BASE");
  });
});

// ━━━ Token Counts ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Conversation — token counts", () => {
  it("getTotalTokens > 0 with messages", () => {
    const c = new Conversation();
    c.addUserMessage("hello world");
    expect(c.getTotalTokens()).toBeGreaterThan(0);
  });

  it("getHistoryTokens excludes system prompt", () => {
    const c = new Conversation("very long system prompt ".repeat(100));
    const historyOnly = c.getHistoryTokens();
    const total = c.getTotalTokens();
    expect(historyOnly).toBeLessThan(total);
  });

  it("getHistoryTokens is 0 when empty", () => {
    const c = new Conversation();
    expect(c.getHistoryTokens()).toBe(0);
  });

  it("getLastMessageTokens returns 0 when empty", () => {
    const c = new Conversation();
    expect(c.getLastMessageTokens()).toBe(0);
  });

  it("getLastMessageTokens > 0 after adding message", () => {
    const c = new Conversation();
    c.addUserMessage("hello world this is a test message");
    expect(c.getLastMessageTokens()).toBeGreaterThan(0);
  });
});

// ━━━ getLastAssistantMessage / getLastUserMessage ━━━━━━━━━━━━━

describe("Conversation — getLastXMessage", () => {
  it("getLastAssistantMessage returns null when none exist", () => {
    const c = new Conversation();
    expect(c.getLastAssistantMessage()).toBeNull();
  });

  it("getLastUserMessage returns null when none exist", () => {
    const c = new Conversation();
    expect(c.getLastUserMessage()).toBeNull();
  });

  it("getLastAssistantMessage returns most recent assistant msg", () => {
    const c = new Conversation();
    c.addUserMessage("u");
    c.addAssistantMessage("first");
    c.addUserMessage("u2");
    c.addAssistantMessage("second");
    expect(c.getLastAssistantMessage()?.content).toBe("second");
  });

  it("getLastUserMessage returns most recent user msg", () => {
    const c = new Conversation();
    c.addUserMessage("first");
    c.addAssistantMessage("a");
    c.addUserMessage("second");
    expect(c.getLastUserMessage()?.content).toBe("second");
  });
});