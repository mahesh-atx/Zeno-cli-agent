// src/providers/nvidia.ts
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Message } from "../core/conversation";
import type { Config } from "../core/config";
import type { StreamResult } from "./openrouter";
import { translateProviderError } from "../errors/apiErrors";
import type { AgentEvent } from "../errors/base";

// ━━━ Available NVIDIA Models ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const NVIDIA_MODELS = [
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "nvidia/llama-3.3-70b-instruct",
  "meta/llama-3.1-8b-instruct",
  "meta/llama-3.1-70b-instruct",
  "mistralai/mixtral-8x7b-instruct-v0.1",
] as const;

export const NVIDIA_DEFAULT_MODEL = "nvidia/llama-3.1-nemotron-70b-instruct";

// ━━━ NVIDIA NIM Client ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Returns a StreamResult on success.
 * On failure, returns a typed AgentEvent — never throws to console.
 */
export async function chatWithNvidia(
  messages: Message[],
  model: string,
  config: Config,
  attempt = 1
): Promise<StreamResult | AgentEvent> {
  if (!config.nvidiaApiKey) {
    return {
      kind: "auth_error",
      message: "NVIDIA_API_KEY is not set. Add it to your .env file.",
      statusCode: 401,
      retryable: false,
      requiresUserAction: true,
      provider: "nvidia",
      timestamp: Date.now(),
    };
  }

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

    return { stream: result.textStream };
  } catch (error) {
    return translateProviderError("nvidia", error, attempt);
  }
}