import type { Config, ProviderName } from "../core/config";
import type { Message } from "../core/conversation";
import type { StreamResult } from "./openrouter";

import { chatWithOpenRouter } from "./openrouter";
import { chatWithGroq, GROQ_MODELS, GROQ_DEFAULT_MODEL } from "./groq";
import { chatWithNvidia, NVIDIA_MODELS, NVIDIA_DEFAULT_MODEL } from "./nvidia";

// ─── Model Registry ───────────────────────────────────────────────────────────

export const PROVIDER_MODELS: Record<ProviderName, readonly string[]> = {
  openrouter: [
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3-haiku",
    "google/gemini-flash-1.5",
    "meta-llama/llama-3.1-70b-instruct",
  ],
  groq: GROQ_MODELS,
  nvidia: NVIDIA_MODELS,
};

export const PROVIDER_DEFAULT_MODELS: Record<ProviderName, string> = {
  openrouter: "openai/gpt-4o-mini",
  groq: GROQ_DEFAULT_MODEL,
  nvidia: NVIDIA_DEFAULT_MODEL,
};

// ─── Provider Factory ─────────────────────────────────────────────────────────

/**
 * Returns a chat function for the given provider name.
 * All three return the same StreamResult interface.
 */
export function getProvider(
  providerName: ProviderName,
  config: Config
): (messages: Message[], model: string) => Promise<StreamResult> {
  switch (providerName) {
    case "openrouter":
      return (messages, model) => chatWithOpenRouter(messages, model, config);

    case "groq":
      return (messages, model) => chatWithGroq(messages, model, config);

    case "nvidia":
      return (messages, model) => chatWithNvidia(messages, model, config);

    default: {
      // TypeScript exhaustive check
      const _exhaustive: never = providerName;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}

/**
 * Returns the default model for a given provider.
 */
export function getDefaultModel(providerName: ProviderName): string {
  return PROVIDER_DEFAULT_MODELS[providerName];
}

/**
 * Returns all models for a given provider.
 */
export function getModelsForProvider(providerName: ProviderName): readonly string[] {
  return PROVIDER_MODELS[providerName];
}

/**
 * Validates that a model name is known for a given provider.
 * Returns true for unknown models too — providers may accept
 * models not in our local list.
 */
export function isKnownModel(
  providerName: ProviderName,
  model: string
): boolean {
  return PROVIDER_MODELS[providerName].includes(model);
}

export type { StreamResult };
