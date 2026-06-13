import { createGroq } from "@ai-sdk/groq";
import { streamText } from "ai";
import type { Message } from "../core/conversation";
import type { Config } from "../core/config";
import type { StreamResult } from "./openrouter";

// ─── Available Groq Models ────────────────────────────────────────────────────

export const GROQ_MODELS = [
  "llama-3.1-70b-versatile",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
  "gemma2-9b-it",
] as const;

export const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";

// ─── Groq Client ──────────────────────────────────────────────────────────────

export async function chatWithGroq(
  messages: Message[],
  model: string,
  config: Config
): Promise<StreamResult> {
  if (!config.groqApiKey) {
    throw new Error(
      "GROQ_API_KEY is not set. Add it to your .env file."
    );
  }

  const groq = createGroq({
    apiKey: config.groqApiKey,
  });

  const formattedMessages = messages.map((msg) => ({
    role: msg.role as "system" | "user" | "assistant",
    content: msg.content,
  }));

  try {
    const result = streamText({
      model: groq(model),
      messages: formattedMessages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    return {
      stream: result.textStream,
    };
  } catch (error) {
    throw handleGroqError(error);
  }
}

// ─── Error Handling ───────────────────────────────────────────────────────────

function handleGroqError(error: unknown): Error {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("401") || message.includes("unauthorized")) {
      return new Error(
        "Invalid Groq API key (401). Check GROQ_API_KEY in your .env file."
      );
    }

    if (message.includes("429") || message.includes("rate limit")) {
      return new Error(
        "Groq rate limit hit (429). Wait a moment and try again, or switch providers with /model."
      );
    }

    if (message.includes("500") || message.includes("server error")) {
      return new Error(
        "Groq server error (500). The API may be temporarily down."
      );
    }

    if (
      message.includes("econnrefused") ||
      message.includes("enotfound") ||
      message.includes("network")
    ) {
      return new Error(
        "Connection failed. Check your internet connection and try again."
      );
    }

    return new Error(`Groq error: ${error.message}`);
  }

  return new Error("Unknown error communicating with Groq.");
}
