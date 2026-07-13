// src/providers/index.ts
import type { Config, ProviderName } from "../core/config";
import type { Message } from "../core/conversation";
import type { StreamResult } from "./openrouter";
import type { AgentEvent } from "../errors/base";

import { chatWithOpenRouter } from "./openrouter";
import { chatWithGroq, GROQ_MODELS, GROQ_DEFAULT_MODEL } from "./groq";
import { chatWithNvidia, NVIDIA_MODELS, NVIDIA_DEFAULT_MODEL } from "./nvidia";
import { chatWithOpenCodeZen, OPENCODEZEN_MODELS, OPENCODEZEN_DEFAULT_MODEL } from "./opencodezen";

// ─── Model Registry ───────────────────────────────────────────

export const PROVIDER_MODELS: Record<ProviderName, readonly string[]> = {
  openrouter: [
    "poolside/laguna-m.1:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "openai/gpt-oss-120b:free",
    "z-ai/glm-4.5-air:free",
    "poolside/laguna-xs.2:free",
    "openai/gpt-oss-20b:free",
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "google/gemma-4-31b-it:free",
    "moonshotai/kimi-k2.6:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "nvidia/nemotron-nano-9b-v2:free",
    "nvidia/nemotron-nano-12b-v2-vl:free",
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/llama-nemotron-embed-vl-1b-v2:free",
    "liquid/lfm-2.5-1.2b-thinking:free",
    "liquid/lfm-2.5-1.2b-instruct:free",
    "nvidia/nemotron-3.5-content-safety:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "sourceful/riverflow-v2.5-pro:free",
    "sourceful/riverflow-v2.5-fast:free",
    "venice/uncensored:free",
    "nousresearch/hermes-3-405b-instruct:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "qwen/qwen3-coder-480b-a35b:free",
  ],
  groq: GROQ_MODELS,
  nvidia: NVIDIA_MODELS,
  opencodezen: OPENCODEZEN_MODELS,
};

export const PROVIDER_DEFAULT_MODELS: Record<ProviderName, string> = {
  openrouter: "poolside/laguna-m.1:free",
  groq: GROQ_DEFAULT_MODEL,
  nvidia: NVIDIA_DEFAULT_MODEL,
  opencodezen: OPENCODEZEN_DEFAULT_MODEL,
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

    case "opencodezen":
      return (messages, model, attempt = 1) =>
        chatWithOpenCodeZen(messages, model, config, attempt);

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