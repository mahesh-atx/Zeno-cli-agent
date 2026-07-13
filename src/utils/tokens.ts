// Token counting — now uses gpt-tokenizer for accuracy with fallback

import type { Message } from "../core/conversation";

// Lazy-loaded tokenizer to avoid import cost at startup if not needed
let encodeFunction: ((text: string) => number[]) | null = null;
let tokenizerAvailable = false;

function getTokenizer(): ((text: string) => number[]) | null {
  if (encodeFunction !== null || tokenizerAvailable) {
    return encodeFunction;
  }
  try {
    // gpt-tokenizer is pure JS, no wasm, safe to require
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const gptTokenizer = require("gpt-tokenizer") as { encode: (s: string) => number[] };
    if (gptTokenizer && typeof gptTokenizer.encode === "function") {
      encodeFunction = gptTokenizer.encode;
      tokenizerAvailable = true;
      return encodeFunction;
    }
  } catch {
    // Fallback to heuristic
  }
  // Mark as attempted to avoid repeated try
  tokenizerAvailable = true;
  encodeFunction = null;
  return null;
}

/**
 * Estimates token count for a string.
 * Uses gpt-tokenizer (cl100k_base) if available for accurate count,
 * otherwise falls back to heuristic with code-aware divisor.
 */
export function countTokens(text: string): number {
  if (!text || text.length === 0) return 0;

  const encoder = getTokenizer();
  if (encoder) {
    try {
      return encoder(text).length;
    } catch {
      // fallback on error
    }
  }

  // Fallback heuristic: code-aware
  // Code typically has higher token density (~3.5 chars/token) vs prose (~4)
  const isCodeLike =
    /[{}();=<>]/.test(text) &&
    (text.includes("function") ||
      text.includes("const ") ||
      text.includes("import ") ||
      text.includes("export ") ||
      text.includes("=>") ||
      /[\{\}]{2,}/.test(text));

  const divisor = isCodeLike ? 3.5 : 4;
  return Math.ceil(text.length / divisor);
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

export function countHistoryTokens(messages: Message[]): number {
  return messages.reduce((total, msg) => total + countMessageTokens(msg), 0);
}

export function formatTokenCount(count: number): string {
  return count.toLocaleString("en-US");
}
