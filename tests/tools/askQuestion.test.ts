import { describe, it, expect } from "vitest";
import { askQuestion, AskQuestionSchema } from "../../src/tools/askQuestion";
import { ZodError } from "zod";

describe("askQuestion tool", () => {
  it("should return the correct output format without options", async () => {
    const result = await askQuestion({
      question: "What is your name?",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.requires_user_input).toBe(true);
      expect(result.question).toBe("What is your name?");
      expect(result.options).toBeUndefined();
      expect(result.hints).toBeDefined();
    }
  });

  it("should return the correct output format with options", async () => {
    const result = await askQuestion({
      question: "Choose a color",
      options: ["Red", "Blue", "Green"],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.requires_user_input).toBe(true);
      expect(result.question).toBe("Choose a color");
      expect(result.options).toEqual(["Red", "Blue", "Green"]);
      expect(result.hints).toBeDefined();
    }
  });

  describe("schema validation", () => {
    it("should parse valid input", () => {
      const input = { question: "Q", options: ["A"], required: false };
      expect(AskQuestionSchema.parse(input)).toEqual(input);
    });

    it("should provide default for required if omitted", () => {
      const input = { question: "Q" };
      expect(AskQuestionSchema.parse(input)).toEqual({ question: "Q", required: true });
    });

    it("should throw on missing question", () => {
      expect(() => AskQuestionSchema.parse({ options: ["A"] })).toThrow(ZodError);
    });
  });
});
