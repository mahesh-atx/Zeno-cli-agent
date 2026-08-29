import { z } from "zod";
import { LIMITS } from "./guards";

export const SendMessageSchema = z.object({
  message: z.string().min(1).max(LIMITS.MAX_MESSAGE_LENGTH).describe("The message body to display to the user"),
  title: z.string().max(LIMITS.MAX_TITLE_LENGTH).optional().describe("Optional short title shown as a header"),
  type: z.enum(["info", "warning", "success", "error"]).optional().default("info"),
  ends_turn: z.boolean().optional().default(false).describe("Set to true if this message concludes your current task"),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export interface SendMessageOutput {
  success: true;
  message_sent: true;
  ends_turn: boolean;
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
      title: input.title?.trim(),
      content: input.message.trim(),
      type: input.type ?? "info",
    },
    hints: input.ends_turn
      ? ["You have ended your turn. Agent loop will stop and wait for user's next prompt."]
      : ["Message sent to user. You may continue calling tools to complete background work."],
  };
}
