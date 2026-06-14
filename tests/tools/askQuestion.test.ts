import { describe, it, expect } from "vitest";
import { askQuestion, AskQuestionSchema } from "../../src/tools/askQuestion";

describe("AskQuestionSchema", () => {
  it("accepts minimal input with just a question", () => {
    const result = AskQuestionSchema.safeParse({
      question: "What framework should I use?",
    });
    expect(result.success).toBe(true);
  });

  it("defaults required to true", () => {
    const result = AskQuestionSchema.parse({
      question: "What framework?",
    });
    expect(result.required).toBe(true);
  });

  it("accepts optional options array", () => {
    const result = AskQuestionSchema.safeParse({
      question: "Which one?",
      options: ["React", "Vue", "Svelte"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty options array", () => {
    const result = AskQuestionSchema.safeParse({
      question: "Which one?",
      options: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing question", () => {
    const result = AskQuestionSchema.safeParse({
      options: ["A", "B"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string options", () => {
    const result = AskQuestionSchema.safeParse({
      question: "Which?",
      options: [1, 2, 3],
    });
    expect(result.success).toBe(false);
  });
});

describe("askQuestion", () => {
  it("returns success true", async () => {
    const result = await askQuestion({
      question: "What is the target Node version?",
      required: true,
    });
    expect(result.success).toBe(true);
  });

  it("returns requires_user_input true always", async () => {
    const result = await askQuestion({
      question: "Any question",
      required: true,
    });
    expect(result.requires_user_input).toBe(true);
  });

  it("echoes the question back", async () => {
    const q = "Should I use tabs or spaces?";
    const result = await askQuestion({ question: q, required: true });
    expect(result.question).toBe(q);
  });

  it("echoes options when provided", async () => {
    const opts = ["tabs", "spaces"];
    const result = await askQuestion({
      question: "Tabs or spaces?",
      options: opts,
      required: true,
    });
    expect(result.options).toEqual(opts);
  });

  it("options is undefined when not provided", async () => {
    const result = await askQuestion({
      question: "Open ended question",
      required: true,
    });
    expect(result.options).toBeUndefined();
  });

  it("includes hints array", async () => {
    const result = await askQuestion({
      question: "Question",
      required: true,
    });
    expect(Array.isArray(result.hints)).toBe(true);
    expect(result.hints!.length).toBeGreaterThan(0);
  });

  it("hints tell the agent to pause and not call more tools", async () => {
    const result = await askQuestion({
      question: "Question",
      required: true,
    });
    const hintsText = result.hints!.join(" ").toLowerCase();
    expect(hintsText).toMatch(/pause|stop|wait|do not/i);
  });
});