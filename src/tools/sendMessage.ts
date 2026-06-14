import { z } from "zod";

export const SendMessageSchema = z.object({
  message: z.string().describe("The message body to display to the user"),
  title: z.string().optional().describe( // ← add this
    "Optional short title shown as a header above the message"
  ),
  type: z.enum(["info", "warning", "success", "error"]).optional().default("info"),
  ends_turn: z.boolean().optional().default(false).describe(
    "Set to true if this message concludes your current task"
  ),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export interface SendMessageOutput {
  success: true;
  message_sent: true;
  ends_turn: boolean; // Special flag for agent.ts
  ui_message: {
    title?: string;
    content: string;
    type: string;
  };
  hints?: string[];
}

export async function sendMessage(input: SendMessageInput): Promise<SendMessageOutput> {
  return {
    success: true,
    message_sent: true,
    ends_turn: input.ends_turn ?? false,
    ui_message: {
      title: input.title,
      content: input.message,
      type: input.type,
    },
    hints: input.ends_turn 
      ? ["You have ended your turn. The agent loop will stop and wait for the user's next prompt."]
      : ["Message sent to user. You may continue calling tools to complete your background work."],
  };
}