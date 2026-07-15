import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import os from "os";

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProviderName = "openrouter" | "groq" | "nvidia" | "opencodezen" | string;

export interface CustomProviderProfile {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  apiKey?: string;
}

export interface Config {
  openrouterApiKey: string | null;
  groqApiKey: string | null;
  nvidiaApiKey: string | null;
  opencodezenApiKey: string | null;
  defaultProvider: ProviderName;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  debug?: boolean;
  customProviders: CustomProviderProfile[];
}

interface FileConfig {
  openrouterApiKey?: string;
  groqApiKey?: string;
  nvidiaApiKey?: string;
  opencodezenApiKey?: string;
  defaultProvider?: string;
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
  debug?: boolean;
  providers?: {
    openrouter?: { apiKey?: string };
    groq?: { apiKey?: string };
    nvidia?: { apiKey?: string };
    opencodezen?: { apiKey?: string };
  };
  customProviders?: CustomProviderProfile[];
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_PROVIDERS: ProviderName[] = ["openrouter", "groq", "nvidia", "opencodezen"];

function isValidProvider(value: string, fileConfigCustomProviders: CustomProviderProfile[] = []): boolean {
  return VALID_PROVIDERS.includes(value as any) || fileConfigCustomProviders.some(p => p.id === value);
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

function isTestEnv(): boolean {
  return !!process.env.VITEST || process.env.NODE_ENV === "test" || process.env.CI === "true";
}

// ─── Config File Loading (P2) ────────────────────────────────────────────────

function getXdgConfigPath(): string {
  const xdgHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdgHome, "cli-agent", "config.json");
}

function getProjectConfigPaths(): string[] {
  return [
    path.join(process.cwd(), ".cli-agent", "config.json"),
    path.join(process.cwd(), "cli-agent.json"),
    path.join(process.cwd(), ".cli-agent.json"),
  ];
}

function loadFileConfig(filePath: string): FileConfig | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as FileConfig;
    return parsed;
  } catch {
    return null;
  }
}

function mergeFileConfigs(): FileConfig {
  let merged: FileConfig = {};

  const xdgConfig = loadFileConfig(getXdgConfigPath());
  if (xdgConfig) {
    merged = { ...merged, ...xdgConfig };
    if (xdgConfig.providers) {
      merged.providers = { ...(merged.providers || {}), ...xdgConfig.providers };
    }
    if (xdgConfig.customProviders) {
      merged.customProviders = [...(merged.customProviders || []), ...xdgConfig.customProviders];
    }
  }

  for (const p of getProjectConfigPaths()) {
    const projConfig = loadFileConfig(p);
    if (projConfig) {
      merged = { ...merged, ...projConfig };
      if (projConfig.providers) {
        merged.providers = { ...(merged.providers || {}), ...projConfig.providers };
      }
      if (projConfig.customProviders) {
        merged.customProviders = [...(merged.customProviders || []), ...projConfig.customProviders];
      }
      break; // first project config wins
    }
  }

  return merged;
}

function getApiKeyFromFileConfig(fileConfig: FileConfig, provider: ProviderName): string | undefined {
  const flatKeyMap: Record<string, keyof FileConfig> = {
    openrouter: "openrouterApiKey",
    groq: "groqApiKey",
    nvidia: "nvidiaApiKey",
    opencodezen: "opencodezenApiKey",
  };

  const key = flatKeyMap[provider];
  if (key) {
    const flat = fileConfig[key] as string | undefined;
    if (flat) return flat;
  }

  if (fileConfig.providers && (fileConfig.providers as any)[provider]?.apiKey) {
    return (fileConfig.providers as any)[provider].apiKey;
  }

  return undefined;
}

// ─── Startup Validation ───────────────────────────────────────────────────────

function validateConfig(config: Config): void {
  if (isTestEnv()) return;

  const errors: string[] = [];

  const hasAnyKey =
    config.openrouterApiKey !== null ||
    config.groqApiKey !== null ||
    config.nvidiaApiKey !== null ||
    config.opencodezenApiKey !== null ||
    config.customProviders.length > 0;

  if (!hasAnyKey) {
    errors.push(
      "No API keys found. Add at least one of the following to your .env file or config.json:\n" +
      "  - OPENROUTER_API_KEY\n" +
      "  - GROQ_API_KEY\n" +
      "  - NVIDIA_API_KEY\n" +
      "  - OPENCODEZEN_API_KEY\n" +
      `  Config file locations: ${getXdgConfigPath()}, .cli-agent/config.json`
    );
  }

  const providerKeyMap: Record<ProviderName, string | null> = {
    openrouter: config.openrouterApiKey,
    groq: config.groqApiKey,
    nvidia: config.nvidiaApiKey,
    opencodezen: config.opencodezenApiKey,
  };

  if (hasAnyKey && VALID_PROVIDERS.includes(config.defaultProvider as any) && providerKeyMap[config.defaultProvider] === null) {
    errors.push(
      `DEFAULT_PROVIDER is set to "${config.defaultProvider}" but the matching API key is empty.\n` +
      `Set ${config.defaultProvider.toUpperCase()}_API_KEY in .env or change DEFAULT_PROVIDER.`
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
  const fileConfig = mergeFileConfigs();

  const rawProvider = process.env.DEFAULT_PROVIDER ?? fileConfig.defaultProvider ?? "openrouter";

  if (!isValidProvider(rawProvider, fileConfig.customProviders || [])) {
    if (isTestEnv()) {
      console.warn(`[config] Invalid DEFAULT_PROVIDER "${rawProvider}" in test env, falling back to openrouter`);
    } else {
      console.error(
        `✗ Invalid DEFAULT_PROVIDER: "${rawProvider}"\n` +
        `  Valid options: openrouter, groq, nvidia, opencodezen, or a custom provider ID`
      );
      process.exit(1);
    }
  }

  const safeProvider: ProviderName = isValidProvider(rawProvider, fileConfig.customProviders || []) ? rawProvider : "openrouter";

  const config: Config = {
    openrouterApiKey:
      process.env.OPENROUTER_API_KEY ||
      getApiKeyFromFileConfig(fileConfig, "openrouter") ||
      (isTestEnv() ? "test-key" : null),
    groqApiKey:
      process.env.GROQ_API_KEY ||
      getApiKeyFromFileConfig(fileConfig, "groq") ||
      null,
    nvidiaApiKey:
      process.env.NVIDIA_API_KEY ||
      getApiKeyFromFileConfig(fileConfig, "nvidia") ||
      null,
    opencodezenApiKey:
      process.env.OPENCODEZEN_API_KEY ||
      getApiKeyFromFileConfig(fileConfig, "opencodezen") ||
      null,
    defaultProvider: safeProvider,
    defaultModel:
      process.env.DEFAULT_MODEL ??
      fileConfig.defaultModel ??
      "poolside/laguna-m.1:free",
    temperature: (() => {
      if (process.env.TEMPERATURE) return readNumber("TEMPERATURE", 0.7, 0, 2);
      if (fileConfig.temperature !== undefined) {
        const v = fileConfig.temperature;
        if (typeof v === "number" && !isNaN(v)) {
          return Math.min(2, Math.max(0, v));
        }
      }
      return 0.7;
    })(),
    maxTokens: (() => {
      if (process.env.MAX_TOKENS) return readNumber("MAX_TOKENS", 16384, 256, 128000);
      if (fileConfig.maxTokens !== undefined) {
        const v = fileConfig.maxTokens;
        if (typeof v === "number" && !isNaN(v)) {
          return Math.min(128000, Math.max(256, v));
        }
      }
      return 16384;
    })(),
    debug:
      process.env.DEBUG === "1" ||
      process.env.DEBUG === "true" ||
      fileConfig.debug === true,
    customProviders: fileConfig.customProviders || [],
  };

  if (config.debug) {
    console.log(`[config] Loaded from XDG: ${getXdgConfigPath()} (exists: ${fs.existsSync(getXdgConfigPath())})`);
    console.log(`[config] Provider: ${config.defaultProvider}, Model: ${config.defaultModel}`);
  }

  validateConfig(config);

  return config;
}

export const config = loadConfig();
export const configFilePaths = {
  xdg: getXdgConfigPath(),
  project: getProjectConfigPaths(),
};

// ─── Custom Provider Persistence ─────────────────────────────────────────────

export function saveCustomProvider(profile: CustomProviderProfile): void {
  const p = getXdgConfigPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const fileConfig = loadFileConfig(p) || {};
  if (!fileConfig.customProviders) fileConfig.customProviders = [];

  const idx = fileConfig.customProviders.findIndex(c => c.id === profile.id);
  if (idx !== -1) {
    fileConfig.customProviders[idx] = profile;
  } else {
    fileConfig.customProviders.push(profile);
  }

  fs.writeFileSync(p, JSON.stringify(fileConfig, null, 2), "utf-8");
  
  // Update in-memory config immediately
  const memIdx = config.customProviders.findIndex(c => c.id === profile.id);
  if (memIdx !== -1) config.customProviders[memIdx] = profile;
  else config.customProviders.push(profile);
}

export function deleteCustomProvider(id: string): void {
  const p = getXdgConfigPath();
  const fileConfig = loadFileConfig(p);
  if (!fileConfig || !fileConfig.customProviders) return;

  fileConfig.customProviders = fileConfig.customProviders.filter(c => c.id !== id);
  fs.writeFileSync(p, JSON.stringify(fileConfig, null, 2), "utf-8");

  // Update in-memory config immediately
  config.customProviders = config.customProviders.filter(c => c.id !== id);
}
