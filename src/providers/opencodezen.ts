// src/providers/opencodezen.ts
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Message } from "../core/conversation";
import type { Config } from "../core/config";
import { translateProviderError } from "../errors/apiErrors";
import type { AgentEvent } from "../errors/base";
import type { StreamResult } from "./openrouter";

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const OPENCODEZEN_MODELS = [
  "minimax-m3-free",
  "mimo-v2.5-free",
  "nemotron-3-ultra-free",
  "north-mini-code-free",
] as const;

export const OPENCODEZEN_DEFAULT_MODEL = "mimo-v2.5-free";

// ━━━ OpenCode Zen Client ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function chatWithOpenCodeZen(
  messages: Message[],
  model: string,
  config: Config,
  attempt = 1
): Promise<StreamResult | AgentEvent> {
  if (!config.opencodezenApiKey) {
    return {
      kind: "auth_error",
      message: "OPENCODEZEN_API_KEY is not set. Add it to your .env file.",
      statusCode: 401,
      retryable: false,
      requiresUserAction: true,
      provider: "opencodezen",
      timestamp: Date.now(),
    };
  }

  const opencodezen = createOpenAI({
    apiKey: config.opencodezenApiKey,
    baseURL: "https://opencode.ai/zen/v1",
  });

  const formattedMessages = messages.map((msg) => ({
    role: msg.role as "system" | "user" | "assistant",
    content: msg.content,
  }));

  try {
    const result = streamText({
      model: opencodezen(model),
      messages: formattedMessages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    return { stream: result.textStream };
  } catch (error) {
    return translateProviderError("opencodezen", error, attempt);
  }
}
