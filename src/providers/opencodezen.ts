// src/providers/opencodezen.ts — delegates to registry
import { streamText } from "ai";
import type { Message } from "../core/conversation";
import type { Config } from "../core/config";
import type { StreamResult } from "./openrouter";
import { translateProviderError } from "../errors/apiErrors";
import type { AgentEvent } from "../errors/base";
import { builtinProviders, OPENCODEZEN_MODELS as REGISTRY_MODELS, OPENCODEZEN_DEFAULT_MODEL as REGISTRY_DEFAULT } from "./registry";

export const OPENCODEZEN_MODELS = REGISTRY_MODELS;
export const OPENCODEZEN_DEFAULT_MODEL = REGISTRY_DEFAULT;

export async function chatWithOpenCodeZen(
  messages: Message[],
  model: string,
  config: Config,
  attempt = 1
): Promise<StreamResult | AgentEvent> {
  const def = builtinProviders.opencodezen;
  const apiKey = def.getApiKey(config);
  if (!apiKey) {
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

  const formatted = messages.map((msg) => ({
    role: msg.role as "system" | "user" | "assistant",
    content: msg.content,
  }));

  try {
    const modelInstance = def.createModel(apiKey, model);
    const result = streamText({
      model: modelInstance,
      messages: formatted as any,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
    return { stream: result.textStream };
  } catch (error) {
    return translateProviderError("opencodezen", error, attempt);
  }
}
