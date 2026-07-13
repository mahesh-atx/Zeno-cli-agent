import dotenv from "dotenv";
import path from "path";

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProviderName = "openrouter" | "groq" | "nvidia" | "opencodezen";

export interface Config {
  // API Keys
  openrouterApiKey: string | null;
  groqApiKey: string | null;
  nvidiaApiKey: string | null;
  opencodezenApiKey: string | null;

  // Provider + Model
  defaultProvider: ProviderName;
  defaultModel: string;

  // Model settings
  temperature: number;
  maxTokens: number;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_PROVIDERS: ProviderName[] = ["openrouter", "groq", "nvidia", "opencodezen"];

function isValidProvider(value: string): value is ProviderName {
  return VALID_PROVIDERS.includes(value as ProviderName);
}

function readNumber(key: string, fallback: number, min?: number, max?: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  if (isNaN(parsed)) {
    console.warn(`[config] Warning: ${key} is not a valid number. Using default: ${fallback}`);
    return fallback;
  }
  let value = parsed;
  if (min !== undefined && value < min) {
    console.warn(`[config] Warning: ${key}=${value} below min ${min}, clamping to ${min}`);
    value = min;
  }
  if (max !== undefined && value > max) {
    console.warn(`[config] Warning: ${key}=${value} above max ${max}, clamping to ${max}`);
    value = max;
  }
  return value;
}

// ─── Startup Validation ───────────────────────────────────────────────────────

function isTestEnv(): boolean {
  return !!process.env.VITEST || process.env.NODE_ENV === "test" || process.env.CI === "true";
}

function validateConfig(config: Config): void {
  // In test env, skip hard exit — allow dummy config so unit tests can import modules
  if (isTestEnv()) {
    return;
  }

  const errors: string[] = [];

  const hasAnyKey =
    config.openrouterApiKey !== null ||
    config.groqApiKey !== null ||
    config.nvidiaApiKey !== null ||
    config.opencodezenApiKey !== null;

  if (!hasAnyKey) {
    errors.push(
      "No API keys found. Add at least one of the following to your .env file:\n" +
      "  - OPENROUTER_API_KEY\n" +
      "  - GROQ_API_KEY\n" +
      "  - NVIDIA_API_KEY\n" +
      "  - OPENCODEZEN_API_KEY"
    );
  }

  const providerKeyMap: Record<ProviderName, string | null> = {
    openrouter: config.openrouterApiKey,
    groq: config.groqApiKey,
    nvidia: config.nvidiaApiKey,
    opencodezen: config.opencodezenApiKey,
  };

  if (hasAnyKey && providerKeyMap[config.defaultProvider] === null) {
    errors.push(
      `DEFAULT_PROVIDER is set to "${config.defaultProvider}" but the matching API key is empty.\n` +
      `Set ${config.defaultProvider.toUpperCase().replace("NVIDIA", "NVIDIA")}_API_KEY in .env or change DEFAULT_PROVIDER.`
    );
  }

  if (errors.length > 0) {
    console.error("\n✗ Configuration Error:\n");
    errors.forEach((e) => console.error(`  ${e}\n`));
    process.exit(1);
  }
}

// ─── Load Config ──────────────────────────────────────────────────────────────

function loadConfig(): Config {
  const rawProvider = process.env.DEFAULT_PROVIDER ?? "openrouter";

  if (!isValidProvider(rawProvider)) {
    // In test, fallback to openrouter instead of exiting
    if (isTestEnv()) {
      console.warn(`[config] Invalid DEFAULT_PROVIDER "${rawProvider}" in test env, falling back to openrouter`);
    } else {
      console.error(
        `✗ Invalid DEFAULT_PROVIDER: "${rawProvider}"\n` +
        `  Valid options: openrouter, groq, nvidia, opencodezen`
      );
      process.exit(1);
    }
  }

  const safeProvider: ProviderName = isValidProvider(rawProvider) ? rawProvider : "openrouter";

  const config: Config = {
    openrouterApiKey: process.env.OPENROUTER_API_KEY || (isTestEnv() ? "test-key" : null),
    groqApiKey: process.env.GROQ_API_KEY || null,
    nvidiaApiKey: process.env.NVIDIA_API_KEY || null,
    opencodezenApiKey: process.env.OPENCODEZEN_API_KEY || null,
    defaultProvider: safeProvider,
    defaultModel: process.env.DEFAULT_MODEL ?? "poolside/laguna-m.1:free",
    temperature: readNumber("TEMPERATURE", 0.7, 0, 2),
    maxTokens: readNumber("MAX_TOKENS", 16384, 256, 128000),
  };

  validateConfig(config);

  return config;
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const config = loadConfig();
