// src/providers/index.ts — unified registry, no split-brain
import { streamText } from "ai";
import type { Config, ProviderName } from "../core/config";
import type { Message } from "../core/conversation";
import type { AgentEvent } from "../errors/base";
import { translateProviderError } from "../errors/apiErrors";
import {
  providerRegistry,
  TOKEN_LIMITS as REGISTRY_TOKEN_LIMITS,
  getProviderDefinition,
  getModelsForProvider as getModelsFromRegistry,
  getDefaultModelForProvider,
  isKnownModel as isKnownFromRegistry,
} from "./registry";

// Re-export registry models as single source
export {
  GROQ_MODELS,
  NVIDIA_MODELS,
  OPENCODEZEN_MODELS,
  OPENROUTER_MODELS,
  GROQ_DEFAULT_MODEL,
  NVIDIA_DEFAULT_MODEL,
  OPENCODEZEN_DEFAULT_MODEL,
  OPENROUTER_DEFAULT_MODEL,
  TOKEN_LIMITS,
  providerRegistry,
  getProviderDefinition,
} from "./registry";

export interface StreamResult {
  stream: AsyncIterable<string>;
}

export const PROVIDER_MODELS: Record<ProviderName, readonly string[]> = {
  openrouter: providerRegistry.openrouter.models,
  groq: providerRegistry.groq.models,
  nvidia: providerRegistry.nvidia.models,
  opencodezen: providerRegistry.opencodezen.models,
};

export const PROVIDER_DEFAULT_MODELS: Record<ProviderName, string> = {
  openrouter: providerRegistry.openrouter.defaultModel,
  groq: providerRegistry.groq.defaultModel,
  nvidia: providerRegistry.nvidia.defaultModel,
  opencodezen: providerRegistry.opencodezen.defaultModel,
};

export const PROVIDER_TOKEN_LIMITS: Record<ProviderName, number> = {
  openrouter: REGISTRY_TOKEN_LIMITS.openrouter,
  groq: REGISTRY_TOKEN_LIMITS.groq,
  nvidia: REGISTRY_TOKEN_LIMITS.nvidia,
  opencodezen: REGISTRY_TOKEN_LIMITS.opencodezen,
};

// ─── Provider Factory (legacy API, now uses registry internally) ────────────
// This keeps tests passing while using single model creation path.

export function getProvider(
  providerName: ProviderName,
  config: Config
): (messages: Message[], model: string, attempt?: number) => Promise<StreamResult | AgentEvent> {
  const def = getProviderDefinition(providerName);
  const apiKey = def.getApiKey(config);

  return async (messages, model, attempt = 1): Promise<StreamResult | AgentEvent> => {
    if (!apiKey) {
      return {
        kind: "auth_error",
        message: `${providerName.toUpperCase()}_API_KEY is not set. Add it to your .env file.`,
        statusCode: 401,
        retryable: false,
        requiresUserAction: true,
        provider: providerName,
        timestamp: Date.now(),
      };
    }

    try {
      const providerModel = def.createModel(apiKey, model);
      const formatted = messages.map((msg) => ({
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content,
      }));

      const result = streamText({
        model: providerModel,
        messages: formatted as any,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });

      return { stream: result.textStream };
    } catch (error) {
      return translateProviderError(providerName, error, attempt);
    }
  };
}

// ─── Type Guard ───────────────────────────────────────────────────────────────

export function isStreamResult(
  result: StreamResult | AgentEvent
): result is StreamResult {
  return "stream" in result;
}

// ─── Helpers (now delegate to registry) ─────────────────────────────────────

export function getDefaultModel(providerName: ProviderName): string {
  return getDefaultModelForProvider(providerName);
}

export function getModelsForProvider(providerName: ProviderName): readonly string[] {
  return getModelsFromRegistry(providerName);
}

export function isKnownModel(providerName: ProviderName, model: string): boolean {
  return isKnownFromRegistry(providerName, model);
}

export type { AgentEvent };
