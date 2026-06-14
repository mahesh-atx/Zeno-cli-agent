import { describe, it, expect } from "vitest";
import { sendMessage, SendMessageSchema } from "../../src/tools/sendMessage";
import { ZodError } from "zod";

describe("sendMessage tool", () => {
  it("should return the correct output format without ends_turn", async () => {
    const result = await sendMessage({
      message: "Hello world",
      title: "Greeting",
      type: "info",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message_sent).toBe(true);
      expect(result.ends_turn).toBe(false);
      expect(result.ui_message).toEqual({
        content: "Hello world",
        type: "info",
      });
      expect(result.hints?.[0]).toContain("continue calling tools");
    }
  });

  it("should return the correct output format with ends_turn", async () => {
    const result = await sendMessage({
      message: "Task completed",
      type: "success",
      ends_turn: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message_sent).toBe(true);
      expect(result.ends_turn).toBe(true);
      expect(result.ui_message).toEqual({
        content: "Task completed",
        type: "success",
      });
      expect(result.hints?.[0]).toContain("ended your turn");
    }
  });

  describe("schema validation", () => {
    it("should parse valid input", () => {
      const input = { message: "M", title: "T", type: "success", ends_turn: true };
      expect(SendMessageSchema.parse(input)).toEqual(input);
    });

    it("should provide defaults if optional fields are omitted", () => {
      const input = { message: "M" };
      expect(SendMessageSchema.parse(input)).toEqual({
        message: "M",
        type: "info",
        ends_turn: false,
      });
    });

    it("should throw on missing message", () => {
      expect(() => SendMessageSchema.parse({ title: "T" })).toThrow(ZodError);
    });

    it("should throw on invalid type enum", () => {
      expect(() => SendMessageSchema.parse({ message: "M", type: "invalid" })).toThrow(ZodError);
    });
  });
});
