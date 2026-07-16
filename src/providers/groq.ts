// src/providers/groq.ts — now delegates to unified registry
import { streamText } from "ai";
import type { Message } from "../core/conversation";
import type { Config } from "../core/config";
import type { StreamResult } from "./openrouter";
import { translateProviderError } from "../errors/apiErrors";
import type { AgentEvent } from "../errors/base";
import { builtinProviders, GROQ_MODELS as REGISTRY_MODELS, GROQ_DEFAULT_MODEL as REGISTRY_DEFAULT } from "./registry";

// Re-export canonical lists from registry
export const GROQ_MODELS = REGISTRY_MODELS;
export const GROQ_DEFAULT_MODEL = REGISTRY_DEFAULT;

/**
 * @deprecated Use builtinProviders.groq.createModel via getProvider() in providers/index.ts
 * Kept for backward compat with old tests, now uses registry internally
 */
export async function chatWithGroq(
  messages: Message[],
  model: string,
  config: Config,
  attempt = 1
): Promise<StreamResult | AgentEvent> {
  const def = builtinProviders.groq;
  const apiKey = def.getApiKey(config);
  if (!apiKey) {
    return {
      kind: "auth_error",
      message: "GROQ_API_KEY is not set. Add it to your .env file.",
      statusCode: 401,
      retryable: false,
      requiresUserAction: true,
      provider: "groq",
      timestamp: Date.now(),
    };
  }

  const formattedMessages = messages.map((msg) => ({
    role: msg.role as "system" | "user" | "assistant",
    content: msg.content,
  }));

  try {
    const groqModel = def.createModel(apiKey, model);
    const result = streamText({
      model: groqModel,
      messages: formattedMessages as any,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
    return { stream: result.textStream };
  } catch (error) {
    return translateProviderError("groq", error, attempt);
  }
}
