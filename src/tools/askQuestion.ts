import { z } from "zod";
import { LIMITS } from "./guards";

export const AskQuestionSchema = z.object({
  question: z.string().min(1).max(LIMITS.MAX_QUESTION_LENGTH).describe("The question to ask the user"),
  options: z.array(z.string().min(1).max(LIMITS.MAX_OPTION_LENGTH)).max(LIMITS.MAX_OPTIONS_COUNT).optional().describe(
    "Optional multiple-choice options to present to the user"
  ),
  required: z.boolean().optional().default(true).describe(
    "If false, agent can proceed with a reasonable default if user dismisses"
  ),
});

export type AskQuestionInput = z.infer<typeof AskQuestionSchema>;

export interface AskQuestionOutput {
  success: true;
  requires_user_input: true;
  question: string;
  options?: string[];
  hints?: string[];
}

export async function askQuestion(input: AskQuestionInput): Promise<AskQuestionOutput> {
  // Deduplicate options if provided, trim
  let options = input.options?.map(o => o.trim()).filter(o => o.length > 0);
  if (options) {
    options = [...new Set(options)];
    if (options.length === 0) options = undefined;
  }

  return {
    success: true,
    requires_user_input: true,
    question: input.question.trim(),
    options,
    hints: [
      "You have asked the user a question. Your execution loop will now pause.",
      "Do NOT call any more tools. Wait for user's next message to resume.",
    ],
  };
}
