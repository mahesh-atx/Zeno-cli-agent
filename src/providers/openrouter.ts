// src/providers/openrouter.ts
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Message } from "../core/conversation";
import type { Config } from "../core/config";
import { translateProviderError } from "../errors/apiErrors";
import type { AgentEvent } from "../errors/base";

// ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface StreamResult {
  stream: AsyncIterable<string>;
}

// ━━━ OpenRouter Client ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Returns a StreamResult on success.
 * On failure, returns a typed AgentEvent — never throws to console.
 */
export async function chatWithOpenRouter(
  messages: Message[],
  model: string,
  config: Config,
  attempt = 1
): Promise<StreamResult | AgentEvent> {
  if (!config.openrouterApiKey) {
    return {
      kind: "auth_error",
      message: "OPENROUTER_API_KEY is not set. Add it to your .env file.",
      statusCode: 401,
      retryable: false,
      requiresUserAction: true,
      provider: "openrouter",
      timestamp: Date.now(),
    };
  }

  const openrouter = createOpenAI({
    apiKey: config.openrouterApiKey,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://github.com/cli-agent",
      "X-Title": "CLI Agent",
    },
  });

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

    return { stream: result.textStream };
  } catch (error) {
    return translateProviderError("openrouter", error, attempt);
  }
}