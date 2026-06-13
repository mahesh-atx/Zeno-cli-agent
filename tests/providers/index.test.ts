// src/providers/index.test.ts
import { describe, it, expect } from "vitest";
import {
  getProvider,
  getDefaultModel,
  getModelsForProvider,
  isKnownModel,
  isStreamResult,
  PROVIDER_MODELS,
  PROVIDER_DEFAULT_MODELS,
} from "../../src/providers/index";
import { config } from "../../src/core/config";

// ━━━ PROVIDER_MODELS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PROVIDER_MODELS", () => {
  it("has entries for all three providers", () => {
    expect(PROVIDER_MODELS).toHaveProperty("groq");
    expect(PROVIDER_MODELS).toHaveProperty("openrouter");
    expect(PROVIDER_MODELS).toHaveProperty("nvidia");
  });

  it("each provider has at least one model", () => {
    for (const [, models] of Object.entries(PROVIDER_MODELS)) {
      expect(models.length).toBeGreaterThan(0);
    }
  });

  it("all model names are non-empty strings", () => {
    for (const [, models] of Object.entries(PROVIDER_MODELS)) {
      for (const model of models) {
        expect(typeof model).toBe("string");
        expect(model.length).toBeGreaterThan(0);
      }
    }
  });
});

// ━━━ PROVIDER_DEFAULT_MODELS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PROVIDER_DEFAULT_MODELS", () => {
  it("has a default for each provider", () => {
    expect(PROVIDER_DEFAULT_MODELS).toHaveProperty("groq");
    expect(PROVIDER_DEFAULT_MODELS).toHaveProperty("openrouter");
    expect(PROVIDER_DEFAULT_MODELS).toHaveProperty("nvidia");
  });

  it("default models are in the provider model list", () => {
    for (const [provider, defaultModel] of Object.entries(
      PROVIDER_DEFAULT_MODELS
    )) {
      const models = PROVIDER_MODELS[provider as keyof typeof PROVIDER_MODELS];
      expect(models).toContain(defaultModel);
    }
  });
});

// ━━━ getDefaultModel ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getDefaultModel", () => {
  it("returns a string for groq", () => {
    expect(typeof getDefaultModel("groq")).toBe("string");
  });

  it("returns a string for openrouter", () => {
    expect(typeof getDefaultModel("openrouter")).toBe("string");
  });

  it("returns a string for nvidia", () => {
    expect(typeof getDefaultModel("nvidia")).toBe("string");
  });

  it("matches PROVIDER_DEFAULT_MODELS", () => {
    expect(getDefaultModel("groq")).toBe(PROVIDER_DEFAULT_MODELS["groq"]);
    expect(getDefaultModel("openrouter")).toBe(
      PROVIDER_DEFAULT_MODELS["openrouter"]
    );
    expect(getDefaultModel("nvidia")).toBe(PROVIDER_DEFAULT_MODELS["nvidia"]);
  });
});

// ━━━ getModelsForProvider ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getModelsForProvider", () => {
  it("returns array for groq", () => {
    expect(Array.isArray(getModelsForProvider("groq"))).toBe(true);
  });

  it("returns array for openrouter", () => {
    expect(Array.isArray(getModelsForProvider("openrouter"))).toBe(true);
  });

  it("returns array for nvidia", () => {
    expect(Array.isArray(getModelsForProvider("nvidia"))).toBe(true);
  });

  it("matches PROVIDER_MODELS", () => {
    expect(getModelsForProvider("groq")).toBe(PROVIDER_MODELS["groq"]);
  });
});

// ━━━ isKnownModel ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isKnownModel", () => {
  it("returns true for known groq model", () => {
    const model = PROVIDER_MODELS["groq"][0];
    expect(isKnownModel("groq", model)).toBe(true);
  });

  it("returns true for known openrouter model", () => {
    const model = PROVIDER_MODELS["openrouter"][0];
    expect(isKnownModel("openrouter", model)).toBe(true);
  });

  it("returns false for unknown model", () => {
    expect(isKnownModel("groq", "not-a-real-model")).toBe(false);
  });

  it("returns false for model on wrong provider", () => {
    const openrouterModel = PROVIDER_MODELS["openrouter"][0];
    expect(isKnownModel("groq", openrouterModel)).toBe(false);
  });
});

// ━━━ isStreamResult ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isStreamResult", () => {
  it("returns true for object with stream property", () => {
    const fakeStream = { stream: (async function* () {})() };
    expect(isStreamResult(fakeStream)).toBe(true);
  });

  it("returns false for rate_limit AgentEvent", () => {
    const event = {
      kind: "rate_limit" as const,
      message: "rate limited",
      retryable: true as const,
      requiresUserAction: false as const,
      retryAfterMs: 30000,
      provider: "groq",
      timestamp: Date.now(),
    };
    expect(isStreamResult(event)).toBe(false);
  });

  it("returns false for auth_error AgentEvent", () => {
    const event = {
      kind: "auth_error" as const,
      message: "auth failed",
      retryable: false as const,
      requiresUserAction: true as const,
      provider: "groq",
      timestamp: Date.now(),
    };
    expect(isStreamResult(event)).toBe(false);
  });

  it("returns false for network_error AgentEvent", () => {
    const event = {
      kind: "network_error" as const,
      message: "network dropped",
      retryable: true as const,
      requiresUserAction: true as const,
      provider: "groq",
      timestamp: Date.now(),
    };
    expect(isStreamResult(event)).toBe(false);
  });
});

// ━━━ getProvider ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getProvider", () => {
  it("returns a function for groq", () => {
    expect(typeof getProvider("groq", config)).toBe("function");
  });

  it("returns a function for openrouter", () => {
    expect(typeof getProvider("openrouter", config)).toBe("function");
  });

  it("returns a function for nvidia", () => {
    expect(typeof getProvider("nvidia", config)).toBe("function");
  });

  it("throws for unknown provider", () => {
    expect(() =>
      getProvider("unknown" as never, config)
    ).toThrow();
  });

  it("returned function accepts messages and model", () => {
    const fn = getProvider("groq", config);
    // It should be callable — we are not calling it (would hit real API)
    expect(fn.length).toBeGreaterThanOrEqual(2);
  });
});