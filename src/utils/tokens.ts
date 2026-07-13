// ─── Types ────────────────────────────────────────────────────────────────────

// Re-export from conversation to avoid duplicate definitions
// tokens.ts uses this for its count functions
import type { Message } from "../core/conversation";

// ─── Token Counting ───────────────────────────────────────────────────────────

/**
 * Estimates token count for a string.
 * Uses a simple approximation: 1 token ≈ 4 characters.
 * Good enough for context tracking without a full tokenizer library.
 */
export function countTokens(text: string): number {
  if (!text || text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

export function countMessageTokens(message: Message): number {
  let text = "";
  if (typeof message.content === "string") {
    text = message.content;
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === "text") {
        text += part.text;
      } else if (part.type === "tool-call") {
        text += JSON.stringify(part.args);
      } else if (part.type === "tool-result") {
        text += typeof part.result === "string" ? part.result : JSON.stringify(part.result);
      }
    }
  }
  // ~4 tokens overhead per message for role + formatting
  return countTokens(text) + 4;
}

/**
 * Counts total tokens across all messages in a conversation.
 */
export function countHistoryTokens(messages: Message[]): number {
  return messages.reduce((total, msg) => total + countMessageTokens(msg), 0);
}

/**
 * Formats token count for display.
 * e.g. 1842 → "1,842"
 */
export function formatTokenCount(count: number): string {
  return count.toLocaleString("en-US");
}
