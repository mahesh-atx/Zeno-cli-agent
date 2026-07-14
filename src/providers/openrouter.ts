// src/providers/openrouter.ts — delegates to registry, keeps StreamResult type
import { streamText } from "ai";
import type { Message } from "../core/conversation";
import type { Config } from "../core/config";
import { translateProviderError } from "../errors/apiErrors";
import type { AgentEvent } from "../errors/base";
import { providerRegistry, OPENROUTER_MODELS as REGISTRY_MODELS, OPENROUTER_DEFAULT_MODEL as REGISTRY_DEFAULT } from "./registry";

export interface StreamResult {
  stream: AsyncIterable<string>;
}

export const OPENROUTER_MODELS = REGISTRY_MODELS;
export const OPENROUTER_DEFAULT_MODEL = REGISTRY_DEFAULT;

export async function chatWithOpenRouter(
  messages: Message[],
  model: string,
  config: Config,
  attempt = 1
): Promise<StreamResult | AgentEvent> {
  const def = providerRegistry.openrouter;
  const apiKey = def.getApiKey(config);
  if (!apiKey) {
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

  const formattedMessages = messages.map((msg) => ({
    role: msg.role as "system" | "user" | "assistant",
    content: msg.content,
  }));

  try {
    const modelInstance = def.createModel(apiKey, model);
    const result = streamText({
      model: modelInstance,
      messages: formattedMessages as any,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
    return { stream: result.textStream };
  } catch (error) {
    return translateProviderError("openrouter", error, attempt);
  }
}
