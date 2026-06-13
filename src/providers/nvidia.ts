import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Message } from "../core/conversation";
import type { Config } from "../core/config";
import type { StreamResult } from "./openrouter";

// ─── Available NVIDIA Models ──────────────────────────────────────────────────

export const NVIDIA_MODELS = [
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "nvidia/llama-3.3-70b-instruct",
  "meta/llama-3.1-8b-instruct",
  "meta/llama-3.1-70b-instruct",
  "mistralai/mixtral-8x7b-instruct-v0.1",
] as const;

export const NVIDIA_DEFAULT_MODEL = "nvidia/llama-3.1-nemotron-70b-instruct";

// ─── NVIDIA NIM Client ────────────────────────────────────────────────────────

export async function chatWithNvidia(
  messages: Message[],
  model: string,
  config: Config
): Promise<StreamResult> {
  if (!config.nvidiaApiKey) {
    throw new Error(
      "NVIDIA_API_KEY is not set. Add it to your .env file."
    );
  }

  // NVIDIA NIM uses an OpenAI-compatible endpoint
  const nvidia = createOpenAI({
    apiKey: config.nvidiaApiKey,
    baseURL: "https://integrate.api.nvidia.com/v1",
  });

  const formattedMessages = messages.map((msg) => ({
    role: msg.role as "system" | "user" | "assistant",
    content: msg.content,
  }));

  try {
    const result = streamText({
      model: nvidia(model),
      messages: formattedMessages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    return {
      stream: result.textStream,
    };
  } catch (error) {
    throw handleNvidiaError(error);
  }
}

// ─── Error Handling ───────────────────────────────────────────────────────────

function handleNvidiaError(error: unknown): Error {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("401") || message.includes("unauthorized")) {
      return new Error(
        "Invalid NVIDIA API key (401). Check NVIDIA_API_KEY in your .env file."
      );
    }

    if (message.includes("429") || message.includes("rate limit")) {
      return new Error(
        "NVIDIA NIM rate limit hit (429). Wait a moment and try again, or switch providers with /model."
      );
    }

    if (message.includes("500") || message.includes("server error")) {
      return new Error(
        "NVIDIA NIM server error (500). The API may be temporarily down."
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

    return new Error(`NVIDIA NIM error: ${error.message}`);
  }

  return new Error("Unknown error communicating with NVIDIA NIM.");
}
