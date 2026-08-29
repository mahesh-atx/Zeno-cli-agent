import { describe, it, expect } from "vitest";
import { sendMessage, SendMessageSchema } from "../../src/tools/sendMessage";

describe("SendMessageSchema", () => {
  it("accepts minimal valid input", () => {
    const result = SendMessageSchema.safeParse({ message: "hello" });
    expect(result.success).toBe(true);
  });

  it("defaults type to info when omitted", () => {
    const result = SendMessageSchema.parse({ message: "hello" });
    expect(result.type).toBe("info");
  });

  it("defaults ends_turn to false when omitted", () => {
    const result = SendMessageSchema.parse({ message: "hello" });
    expect(result.ends_turn).toBe(false);
  });

  it("accepts all valid type values", () => {
    const types = ["info", "warning", "success", "error"] as const;
    for (const type of types) {
      const result = SendMessageSchema.safeParse({ message: "hello", type });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid type value", () => {
    const result = SendMessageSchema.safeParse({
      message: "hello",
      type: "critical",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional title", () => {
    const result = SendMessageSchema.safeParse({
      message: "hello",
      title: "My Title",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty message (hardened)", () => {
    // After hardening, empty message should be rejected
    const result = SendMessageSchema.safeParse({ message: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing message", () => {
    const result = SendMessageSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects message too long", () => {
    const long = "a".repeat(6000);
    const result = SendMessageSchema.safeParse({ message: long });
    expect(result.success).toBe(false);
  });
});

describe("sendMessage", () => {
  it("returns success true always", async () => {
    const result = await sendMessage({
      message: "hello",
      type: "info",
      ends_turn: false,
    });
    expect(result.success).toBe(true);
  });

  it("returns message_sent true always", async () => {
    const result = await sendMessage({
      message: "hello",
      type: "info",
      ends_turn: false,
    });
    expect(result.message_sent).toBe(true);
  });

  it("passes message content to ui_message", async () => {
    const result = await sendMessage({
      message: "Refactor complete",
      type: "success",
      ends_turn: false,
    });
    expect(result.ui_message.content).toBe("Refactor complete");
  });

  it("passes type to ui_message", async () => {
    const result = await sendMessage({
      message: "something failed",
      type: "error",
      ends_turn: false,
    });
    expect(result.ui_message.type).toBe("error");
  });

  it("passes title to ui_message when provided", async () => {
    const result = await sendMessage({
      message: "body text",
      title: "My Header",
      type: "info",
      ends_turn: false,
    });
    expect(result.ui_message.title).toBe("My Header");
  });

  it("ui_message title is undefined when not provided", async () => {
    const result = await sendMessage({
      message: "body text",
      type: "info",
      ends_turn: false,
    });
    expect(result.ui_message.title).toBeUndefined();
  });

  it("ends_turn false returns correct hint about continuing", async () => {
    const result = await sendMessage({
      message: "working on it",
      type: "info",
      ends_turn: false,
    });
    expect(result.ends_turn).toBe(false);
    expect(result.hints).toBeDefined();
    expect(result.hints!.some((h) => h.includes("continue"))).toBe(true);
  });

  it("ends_turn true returns correct hint about stopping", async () => {
    const result = await sendMessage({
      message: "all done",
      type: "success",
      ends_turn: true,
    });
    expect(result.ends_turn).toBe(true);
    expect(result.hints).toBeDefined();
    expect(result.hints!.some((h) => h.includes("stop") || h.includes("wait"))).toBe(true);
  });

  it("all four type values produce valid output", async () => {
    const types = ["info", "warning", "success", "error"] as const;
    for (const type of types) {
      const result = await sendMessage({
        message: "test",
        type,
        ends_turn: false,
      });
      expect(result.ui_message.type).toBe(type);
    }
  });
});
