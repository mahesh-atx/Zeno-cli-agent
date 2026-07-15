import { createOpenAI } from "@ai-sdk/openai";
import { createGroq } from "@ai-sdk/groq";
import type { ProviderName, Config } from "../core/config";

// ─── Provider Definition ─────────────────────────────────────────────────────

export interface ProviderDefinition {
  id: ProviderName;
  label: string;
  defaultModel: string;
  models: readonly string[];
  tokenLimit: number;
  getApiKey: (config: Config) => string | null;
  createModel: (apiKey: string, model: string) => any; // LanguageModel
  isCustom?: boolean;
}

// ─── Model Lists (canonical source) ──────────────────────────────────────────
// Keep these as single source; other files should import from here

export const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
  "qwen/qwen3.6-27b",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "groq/compound",
  "groq/compound-mini",
  "allam-2-7b",
] as const;

export const NVIDIA_MODELS = [
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "meta/llama-3.3-70b-instruct",
  "deepseek-ai/deepseek-v4-flash",
  "mistralai/mistral-large-3-675b-instruct-2512",
  "qwen/qwen3-next-80b-a3b-instruct",
  "meta/codellama-70b",
  "deepseek-ai/deepseek-coder-6.7b-instruct",
  "google/gemma-3-12b-it",
  "meta/llama-3.1-8b-instruct",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.5-122b-a10b",
  "qwen/qwen3.5-397b-a17b",
  "stepfun-ai/step-3.5-flash",
  "stepfun-ai/step-3.7-flash",
  "z-ai/glm-5.2",
  "nvidia/nemotron-mini-4b-instruct",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia/nemotron-3-nano-30b-a3b",
  "moonshotai/kimi-k2.6",
  "microsoft/phi-4-multimodal-instruct",
  "minimaxai/minimax-m2.7",
  "minimaxai/minimax-m3",
  "mistralai/codestral-22b-instruct-v0.1",
  "mistralai/ministral-14b-instruct-2512",
  "mistralai/mistral-7b-instruct-v0.3",
  "mistralai/mistral-large",
  "mistralai/mistral-large-2-instruct",
  "mistralai/mistral-medium-3.5-128b",
  "google/gemma-4-31b-it",
  "deepseek-ai/deepseek-v4-pro",
] as const;

export const OPENCODEZEN_MODELS = [
  "deepseek-v4-flash-free",
  "mimo-v2.5-free",
  "nemotron-3-ultra-free",
  "north-mini-code-free",
] as const;

// OpenRouter has many free models; keep canonical list here
export const OPENROUTER_MODELS = [
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
  "tencent/hy3:free",
  "cohere/north-mini-code:free",
  "openrouter/free",
  "qwen/qwen3-coder:free",
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
] as const;

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";
export const NVIDIA_DEFAULT_MODEL = "nvidia/llama-3.1-nemotron-70b-instruct";
export const OPENCODEZEN_DEFAULT_MODEL = "mimo-v2.5-free";
export const OPENROUTER_DEFAULT_MODEL = "poolside/laguna-m.1:free";

// ─── Token Limits (single source) ────────────────────────────────────────────

export const TOKEN_LIMITS: Record<string, number> = {
  openrouter: 128000,
  groq: 32768,
  nvidia: 128000,
  opencodezen: 128000,
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const builtinProviders: Record<string, ProviderDefinition> = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: OPENROUTER_DEFAULT_MODEL,
    models: OPENROUTER_MODELS,
    tokenLimit: TOKEN_LIMITS.openrouter,
    getApiKey: (c) => c.openrouterApiKey,
    createModel: (apiKey, model) => {
      const client = createOpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        headers: {
          "HTTP-Referer": "https://github.com/spark",
          "X-Title": "SPARK",
        },
      });
      return client(model);
    },
  },
  groq: {
    id: "groq",
    label: "Groq",
    defaultModel: GROQ_DEFAULT_MODEL,
    models: GROQ_MODELS,
    tokenLimit: TOKEN_LIMITS.groq,
    getApiKey: (c) => c.groqApiKey,
    createModel: (apiKey, model) => {
      const client = createGroq({ apiKey });
      return client(model);
    },
  },
  nvidia: {
    id: "nvidia",
    label: "NVIDIA",
    defaultModel: NVIDIA_DEFAULT_MODEL,
    models: NVIDIA_MODELS,
    tokenLimit: TOKEN_LIMITS.nvidia,
    getApiKey: (c) => c.nvidiaApiKey,
    createModel: (apiKey, model) => {
      const client = createOpenAI({
        apiKey,
        baseURL: "https://integrate.api.nvidia.com/v1",
      });
      return client(model);
    },
  },
  opencodezen: {
    id: "opencodezen",
    label: "OpenCodeZen",
    defaultModel: OPENCODEZEN_DEFAULT_MODEL,
    models: OPENCODEZEN_MODELS,
    tokenLimit: TOKEN_LIMITS.opencodezen,
    getApiKey: (c) => c.opencodezenApiKey,
    createModel: (apiKey, model) => {
      const client = createOpenAI({
        apiKey,
        baseURL: "https://opencode.ai/zen/v1",
      });
      return client(model);
    },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { config } from "../core/config";

export function getAllProviders(): Record<string, ProviderDefinition> {
  const merged = { ...builtinProviders };
  for (const cp of config.customProviders || []) {
    merged[cp.id] = {
      id: cp.id,
      label: cp.name,
      defaultModel: cp.defaultModel,
      models: [cp.defaultModel],
      tokenLimit: 128000,
      isCustom: true,
      getApiKey: () => cp.apiKey || null,
      createModel: (apiKey, model) => {
        const client = createOpenAI({
          apiKey: apiKey || "custom-key",
          baseURL: cp.baseUrl,
        });
        return client(model);
      },
    };
  }
  return merged;
}

export function getProviderDefinition(provider: ProviderName): ProviderDefinition {
  const def = getAllProviders()[provider];
  if (!def) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return def;
}

export function getModelsForProvider(provider: ProviderName): readonly string[] {
  return getProviderDefinition(provider).models;
}

export function getDefaultModelForProvider(provider: ProviderName): string {
  return getProviderDefinition(provider).defaultModel;
}

export function getTokenLimitForProvider(provider: ProviderName): number {
  return getProviderDefinition(provider).tokenLimit;
}

export function isKnownModel(provider: ProviderName, model: string): boolean {
  return getModelsForProvider(provider).includes(model);
}

export function getApiKeyForProvider(provider: ProviderName, cfg: Config): string | null {
  return getProviderDefinition(provider).getApiKey(cfg);
}
