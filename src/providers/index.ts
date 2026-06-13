// src/providers/index.ts
import type { Config, ProviderName } from "../core/config";
import type { Message } from "../core/conversation";
import type { StreamResult } from "./openrouter";
import type { AgentEvent } from "../errors/base";

import { chatWithOpenRouter } from "./openrouter";
import { chatWithGroq, GROQ_MODELS, GROQ_DEFAULT_MODEL } from "./groq";
import { chatWithNvidia, NVIDIA_MODELS, NVIDIA_DEFAULT_MODEL } from "./nvidia";

// ─── Model Registry ───────────────────────────────────────────

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

// ─── Provider Factory ─────────────────────────────────────────
// Return type is now StreamResult | AgentEvent — callers must
// check whether the result is an event before consuming the stream.

export function getProvider(
  providerName: ProviderName,
  config: Config
): (messages: Message[], model: string, attempt?: number) => Promise<StreamResult | AgentEvent> {
  switch (providerName) {
    case "openrouter":
      return (messages, model, attempt = 1) =>
        chatWithOpenRouter(messages, model, config, attempt);

    case "groq":
      return (messages, model, attempt = 1) =>
        chatWithGroq(messages, model, config, attempt);

    case "nvidia":
      return (messages, model, attempt = 1) =>
        chatWithNvidia(messages, model, config, attempt);

    default: {
      const _exhaustive: never = providerName;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}

// ─── Type Guard ───────────────────────────────────────────────
// Use this wherever getProvider result is consumed to distinguish
// a successful StreamResult from a typed AgentEvent failure.

export function isStreamResult(
  result: StreamResult | AgentEvent
): result is StreamResult {
  return "stream" in result;
}

// ─── Helpers ──────────────────────────────────────────────────

export function getDefaultModel(providerName: ProviderName): string {
  return PROVIDER_DEFAULT_MODELS[providerName];
}

export function getModelsForProvider(providerName: ProviderName): readonly string[] {
  return PROVIDER_MODELS[providerName];
}

export function isKnownModel(providerName: ProviderName, model: string): boolean {
  return PROVIDER_MODELS[providerName].includes(model);
}

export type { StreamResult };