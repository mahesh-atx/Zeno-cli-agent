// src/core/agent.ts
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGroq } from "@ai-sdk/groq";

import { config } from "./config";
import type { Conversation } from "./conversation";
import type { ProviderName } from "./config";
import { getTool, buildAISDKTools } from "../tools";
import type { ActionType } from "./permissions";
import { translateProviderError } from "../errors/apiErrors";
import {
  isRateLimitEvent,
  isAuthEvent,
  isNetworkEvent,
  isServerErrorEvent,
  makeToolErrorEvent,
  type AgentEvent,
  type RateLimitEvent,
  type NetworkEvent,
} from "../errors/base";
import { catchToolError } from "../errors/toolErrors";

// ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AgentOptions {
  provider: ProviderName;
  model: string;
  conversation: Conversation;
  onToken?: (token: string) => void;
  onToolCall?: (toolName: string, input: unknown) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  onPermissionRequest?: (
    action: ActionType,
    title: string,
    details: string[]
  ) => Promise<boolean>;
  // Typed event callbacks — replaces generic onError
  onAgentEvent?: (event: AgentEvent) => void;
  // Called when a rate limit requires a countdown wait
  onRateLimitWait?: (event: RateLimitEvent, remainingMs: number) => void;
  // Called when a network drop requires user to press R
  onNetworkDrop?: (event: NetworkEvent) => void;
  // Called when an unrecoverable error stops the loop
  onFatalError?: (event: AgentEvent) => void;
  // Signal that user pressed R to resume after network drop
  retrySignal?: { shouldRetry: () => boolean; reset: () => void };
  // Legacy — kept for backward compatibility, receives event.message
  onError?: (error: Error) => void;
}

// ━━━ Retry Configuration ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAX_ITERATIONS = 10;
const MAX_RETRIES = 4;

// Exponential backoff: 1s, 2s, 4s, 8s
function getBackoffMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ━━━ Build Provider Model ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildProviderModel(provider: ProviderName, model: string) {
  switch (provider) {
    case "openrouter": {
      if (!config.openrouterApiKey) throw new Error("OPENROUTER_API_KEY is not set.");
      const client = createOpenAI({
        apiKey: config.openrouterApiKey,
        baseURL: "https://openrouter.ai/api/v1",
        headers: {
          "HTTP-Referer": "https://github.com/cli-agent",
          "X-Title": "CLI Agent",
        },
      });
      return client(model);
    }
    case "groq": {
      if (!config.groqApiKey) throw new Error("GROQ_API_KEY is not set.");
      const client = createGroq({ apiKey: config.groqApiKey });
      return client(model);
    }
    case "nvidia": {
      if (!config.nvidiaApiKey) throw new Error("NVIDIA_API_KEY is not set.");
      const client = createOpenAI({
        apiKey: config.nvidiaApiKey,
        baseURL: "https://integrate.api.nvidia.com/v1",
      });
      return client(model);
    }
    default: {
      const _e: never = provider;
      throw new Error(`Unknown provider: ${_e}`);
    }
  }
}

// ━━━ Tool Result Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getToolResultSummary(toolName: string, result: unknown): string {
  if (typeof result !== "object" || result === null) return String(result);
  const r = result as Record<string, unknown>;
  if ("success" in r && !r.success) return `Error: ${r.error}`;

  switch (toolName) {
    case "read_file":
      return `${r.lines} lines, ${r.size} bytes`;
    case "write_file":
      return `${r.isNew ? "Created" : "Updated"}: ${r.path}`;
    case "edit_file":
      return `${r.linesChanged} lines changed`;
    case "list_files": {
      const lf = r as { files: string[]; directories: string[] };
      return `${lf.files.length} files, ${lf.directories.length} dirs`;
    }
    case "run_command": {
      const rc = r as { exitCode: number; duration: number };
      return `exit ${rc.exitCode} (${rc.duration}ms)`;
    }
    default:
      return "done";
  }
}

// ━━━ Permission Bridge ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let globalPermissionHandler:
  | ((action: ActionType, title: string, details: string[]) => Promise<boolean>)
  | null = null;

export function setPermissionHandler(
  handler: (action: ActionType, title: string, details: string[]) => Promise<boolean>
) {
  globalPermissionHandler = handler;
}

export async function requestPermission(
  action: ActionType,
  title: string,
  details: string[]
): Promise<boolean> {
  if (globalPermissionHandler) {
    return globalPermissionHandler(action, title, details);
  }
  return true;
}

// ━━━ Rate Limit Wait ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pauses the loop and fires countdown ticks every second.

async function waitForRateLimit(
  event: RateLimitEvent,
  onTick?: (event: RateLimitEvent, remainingMs: number) => void
): Promise<void> {
  let remaining = event.retryAfterMs;
  const TICK_MS = 1000;

  while (remaining > 0) {
    if (onTick) onTick(event, remaining);
    const wait = Math.min(TICK_MS, remaining);
    await sleep(wait);
    remaining -= wait;
  }
  // Final tick at 0
  if (onTick) onTick(event, 0);
}

// ━━━ Network Drop Wait ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pauses the loop until user presses R (via retrySignal).

async function waitForUserRetry(
  retrySignal: NonNullable<AgentOptions["retrySignal"]>
): Promise<void> {
  // Poll every 200ms — cheap, no busy loop
  while (!retrySignal.shouldRetry()) {
    await sleep(200);
  }
  retrySignal.reset();
}

// ━━━ Agent Loop ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function runAgent(options: AgentOptions): Promise<string> {
  const {
    provider,
    model,
    conversation,
    onToken,
    onToolCall,
    onToolResult,
    onPermissionRequest,
    onAgentEvent,
    onRateLimitWait,
    onNetworkDrop,
    onFatalError,
    retrySignal,
    onError,
  } = options;

  if (onPermissionRequest) {
    setPermissionHandler(onPermissionRequest);
  }

  const providerModel = buildProviderModel(provider, model);
  const aiTools = buildAISDKTools();

  const messages = conversation.getMessages().map((msg) => ({
    role: msg.role as "system" | "user" | "assistant",
    content: msg.content,
  }));

  let fullAssistantText = "";
  let iterationCount = 0;

  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;

    const pendingToolCalls: Array<{ toolName: string; input: unknown }> = [];

    // ── HTTP call with retry loop ──────────────────────────────
    let streamResult: ReturnType<typeof streamText> | null = null;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      attempt++;

      try {
        streamResult = streamText({
          model: providerModel,
          messages,
          tools: aiTools,
          maxSteps: 1,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        });

        // Attempt to access the stream — this is where SDK throws
        // We need to force evaluation to catch HTTP errors here.
        // If streamText is lazy, the error surfaces during iteration below.
        break; // Success — exit retry loop

      } catch (rawError) {
        const event = translateProviderError(provider, rawError, attempt);

        if (onAgentEvent) onAgentEvent(event);

        // ── Rate limit: pause and countdown ──
        if (isRateLimitEvent(event)) {
          await waitForRateLimit(event, onRateLimitWait);
          continue; // retry
        }

        // ── Server error: exponential backoff ──
        if (isServerErrorEvent(event)) {
          if (attempt >= MAX_RETRIES) {
            if (onFatalError) onFatalError(event);
            if (onError) onError(new Error(event.message));
            return fullAssistantText;
          }
          const backoff = getBackoffMs(attempt);
          await sleep(backoff);
          continue; // retry
        }

        // ── Network drop: pause until user presses R ──
        if (isNetworkEvent(event)) {
          if (onNetworkDrop) onNetworkDrop(event);
          if (retrySignal) {
            await waitForUserRetry(retrySignal);
            continue; // retry
          }
          // No retry signal wired — treat as fatal for this attempt
          if (onFatalError) onFatalError(event);
          if (onError) onError(new Error(event.message));
          return fullAssistantText;
        }

        // ── Auth error: unrecoverable — hand to UI ──
        if (isAuthEvent(event)) {
          if (onFatalError) onFatalError(event);
          if (onError) onError(new Error(event.message));
          return fullAssistantText;
        }

        // ── Unknown: stop ──
        if (onFatalError) onFatalError(event);
        if (onError) onError(new Error(event.message));
        return fullAssistantText;
      }
    }

    if (!streamResult) break;

    // ── Stream consumption with mid-stream error handling ──────
    try {
      let chunkText = "";

      for await (const chunk of streamResult.fullStream) {
        if (chunk.type === "text-delta") {
          const token = chunk.textDelta;
          chunkText += token;
          fullAssistantText += token;
          if (onToken) onToken(token);
        } else if (chunk.type === "tool-call") {
          pendingToolCalls.push({
            toolName: chunk.toolName,
            input: chunk.args,
          });
        }
      }

      // No tool calls → done
      if (pendingToolCalls.length === 0) break;

      if (chunkText) {
        messages.push({ role: "assistant", content: chunkText });
      }

    } catch (streamError) {
      // Mid-stream errors (connection drops mid-response)
      const event = translateProviderError(provider, streamError, attempt);

      if (onAgentEvent) onAgentEvent(event);

      if (isNetworkEvent(event)) {
        if (onNetworkDrop) onNetworkDrop(event);
        if (retrySignal) {
          await waitForUserRetry(retrySignal);
          iterationCount--; // Retry this iteration
          continue;
        }
      }

      if (onFatalError) onFatalError(event);
      if (onError) onError(new Error(event.message));
      return fullAssistantText;
    }

    // ── Tool execution ─────────────────────────────────────────
    for (const { toolName, input } of pendingToolCalls) {
      if (onToolCall) onToolCall(toolName, input);

      const toolDef = getTool(toolName);

      if (!toolDef) {
        // Tool not found → clean result back to LLM
        const errResult = {
          success: false,
          error: `Tool not found: ${toolName}`,
          toolName,
        };
        if (onToolResult) onToolResult(toolName, errResult);
        messages.push({
          role: "user",
          content: `Tool result for ${toolName}:\n${JSON.stringify(errResult, null, 2)}`,
        });
        continue;
      }

      let toolResult: unknown;

      try {
        // wrapExecute in tools/index.ts already catches OS errors,
        // but we have a second safety net here for anything that escapes.
        toolResult = await toolDef.execute(input);
      } catch (toolError) {
        // This catch should rarely fire — wrapExecute handles it.
        // Belt-and-suspenders: format cleanly, never crash.
        const failure = catchToolError(toolName, toolError);
        const event = makeToolErrorEvent(toolName, toolError);
        if (onAgentEvent) onAgentEvent(event);
        toolResult = failure;
      }

      if (onToolResult) onToolResult(toolName, toolResult);

      // Feed tool result back to LLM (including errors — LLM self-corrects)
      messages.push({
        role: "user",
        content: `Tool result for ${toolName}:\n${JSON.stringify(toolResult, null, 2)}`,
      });
    }
  }

  if (iterationCount >= MAX_ITERATIONS) {
    const warning = "\n[Agent reached maximum tool call iterations]";
    fullAssistantText += warning;
    if (onToken) onToken(warning);
  }

  return fullAssistantText;
}