import { z } from "zod";

// Their schema + one small addition for UI rendering
export const AskQuestionSchema = z.object({
  question: z.string().describe("The question to ask the user"),
  options: z.array(z.string()).optional().describe(
    "Optional multiple-choice options to present to the user"
  ),
  // ↓ Helps App.tsx know how urgent this question is
  required: z.boolean().optional().default(true).describe(
    "If false, agent can proceed with a reasonable default if user dismisses"
  ),
});

export type AskQuestionInput = z.infer<typeof AskQuestionSchema>;

export interface AskQuestionOutput {
  success: true;
  requires_user_input: true; // Special flag for agent.ts
  question: string;
  options?: string[];
  hints?: string[];
}

export async function askQuestion(input: AskQuestionInput): Promise<AskQuestionOutput> {
  return {
    success: true,
    requires_user_input: true,
    question: input.question,
    options: input.options,
    hints: [
      "You have asked the user a question. Your current execution loop will now pause.",
      "Do NOT call any more tools. Wait for the user's next message to resume your work."
    ],
  };
}