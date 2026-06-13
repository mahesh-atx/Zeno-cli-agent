import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Message } from "../core/conversation";
import type { Config } from "../core/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StreamResult {
  stream: AsyncIterable<string>;
}

// ─── OpenRouter Client ────────────────────────────────────────────────────────

export async function chatWithOpenRouter(
  messages: Message[],
  model: string,
  config: Config
): Promise<StreamResult> {
  if (!config.openrouterApiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to your .env file."
    );
  }

  // OpenRouter is OpenAI-compatible — just swap the base URL
  const openrouter = createOpenAI({
    apiKey: config.openrouterApiKey,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://github.com/cli-agent",
      "X-Title": "CLI Agent",
    },
  });

  // Map our internal message format to AI SDK format
  const formattedMessages = messages.map((msg) => ({
    role: msg.role as "system" | "user" | "assistant",
    content: msg.content,
  }));

  try {
    const result = streamText({
      model: openrouter(model),
      messages: formattedMessages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    return {
      stream: result.textStream,
    };
  } catch (error) {
    throw handleOpenRouterError(error);
  }
}

// ─── Error Handling ───────────────────────────────────────────────────────────

function handleOpenRouterError(error: unknown): Error {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("401") || message.includes("unauthorized")) {
      return new Error(
        "Invalid OpenRouter API key (401). Check OPENROUTER_API_KEY in your .env file."
      );
    }

    if (message.includes("429") || message.includes("rate limit")) {
      return new Error(
        "OpenRouter rate limit hit (429). Wait a moment and try again."
      );
    }

    if (message.includes("500") || message.includes("server error")) {
      return new Error(
        "OpenRouter server error (500). The API may be temporarily down."
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

    return new Error(`OpenRouter error: ${error.message}`);
  }

  return new Error("Unknown error communicating with OpenRouter.");
}
