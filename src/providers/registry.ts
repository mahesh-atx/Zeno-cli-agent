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
}

// ─── Model Lists (canonical source) ──────────────────────────────────────────
// Keep these as single source; other files should import from here

export const GROQ_MODELS = [
  "llama-3.1-70b-versatile",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
  "gemma2-9b-it",
] as const;

export const NVIDIA_MODELS = [
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "nvidia/llama-3.3-70b-instruct",
  "meta/llama-3.1-8b-instruct",
  "meta/llama-3.1-70b-instruct",
  "mistralai/mixtral-8x7b-instruct-v0.1",
] as const;

export const OPENCODEZEN_MODELS = [
  "minimax-m3-free",
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
] as const;

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";
export const NVIDIA_DEFAULT_MODEL = "nvidia/llama-3.1-nemotron-70b-instruct";
export const OPENCODEZEN_DEFAULT_MODEL = "mimo-v2.5-free";
export const OPENROUTER_DEFAULT_MODEL = "poolside/laguna-m.1:free";

// ─── Token Limits (single source) ────────────────────────────────────────────

export const TOKEN_LIMITS: Record<ProviderName, number> = {
  openrouter: 128000,
  groq: 32768,
  nvidia: 128000,
  opencodezen: 128000,
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const providerRegistry: Record<ProviderName, ProviderDefinition> = {
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
          "HTTP-Referer": "https://github.com/cli-agent",
          "X-Title": "CLI Agent",
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

export function getProviderDefinition(provider: ProviderName): ProviderDefinition {
  const def = providerRegistry[provider];
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

export function getApiKeyForProvider(provider: ProviderName, config: Config): string | null {
  return getProviderDefinition(provider).getApiKey(config);
}
