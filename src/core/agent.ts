// src/core/agent.ts
import { streamText } from "ai";
import * as path from "path";

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
import { getProviderDefinition } from "../providers/registry";

// ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  export interface AgentOptions {
  provider: ProviderName;
  model: string;
  conversation: Conversation;
  contextManager?: import("./context").ContextManager;
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

// ━━━ Build Provider Model — now uses unified registry ───────────────────────

function buildProviderModel(provider: ProviderName, model: string) {
  const def = getProviderDefinition(provider);
  const apiKey = def.getApiKey(config);
  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()}_API_KEY is not set.`);
  }
  return def.createModel(apiKey, model);
}

// ━━━ Tool Result Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getToolResultSummary(toolName: string, result: unknown): string {
  if (typeof result !== "object" || result === null) return String(result);
  const r = result as Record<string, unknown>;
  if ("success" in r && !r.success) return `Error: ${r.error}`;

  switch (toolName) {
    case "read_file":
      return r.lines != null && r.size != null
        ? `${r.lines} lines, ${r.size} bytes`
        : "done";
    case "write_file":
      return r.isNew != null
        ? `${r.isNew ? "Created" : "Updated"}`
        : "done";
    case "edit_file":
      return r.linesChanged != null
        ? `${r.linesChanged} lines changed`
        : "done";
    case "list_files": {
      const entries = r.entries as string[] | undefined;
      const files = r.files as string[] | undefined;
      const dirs = r.directories as string[] | undefined;
      if (entries) {
        return `${entries.length} items`;
      } else if (files && dirs) {
        return `${files.length} files, ${dirs.length} dirs`;
      }
      return "done";
    }
    case "run_command": {
      const exitCode = r.exitCode as number | undefined;
      const duration = r.duration as number | undefined;
      return exitCode != null && duration != null
        ? `exit ${exitCode} (${duration}ms)`
        : "done";
    }
    case "web_search": {
      const results = r.results as any[] | undefined;
      return results ? `Found ${results.length} results` : "done";
    }
    case "web_fetch": {
      const title = r.title as string | undefined;
      return title ? `Fetched: ${title}` : "done";
    }
    
case "search_files": {
  const total    = r.total        as number  | undefined;
  const searched = r.searchedFiles as number | undefined;
  return total != null
    ? `${total} results from ${searched ?? "?"} files`
    : "done";
}

case "glob_files": {
  const total     = r.total     as number  | undefined;
  const truncated = r.truncated as boolean | undefined;
  return total != null
    ? `${total} matches${truncated ? " (truncated)" : ""}`
    : "done";
}

case "delete_file": {
  const type    = r.type    as string  | undefined;
  const dryRun  = r.dryRun  as boolean | undefined;
  const deleted = r.deletedPaths as string[] | undefined;
  if (dryRun) return `DRY RUN: would delete ${deleted?.length ?? 1} item(s)`;
  return type ? `Deleted ${type}: ${r.path ?? ""}` : "done";
}
    case "todo_write": {
      const msg = r.message as string | undefined;
      return msg || "done";
    }
    case "ask_question": {
      const q = r.question as string | undefined;
      return q ? `Asked: ${q.slice(0, 40)}...` : "done";
    }
    case "send_message": {
  const uiMsg   = r.ui_message as { title?: string; content: string; type: string } | undefined;
  //              ^^^^^^^^^^^   ✅ real field
  const endsTurn = r.ends_turn as boolean | undefined;
  //               ^^^^^^^^^^  ✅ snake_case matches actual output

  if (!uiMsg?.content) return "done";

  const typeIcon =
    uiMsg.type === "error"   ? "❌" :
    uiMsg.type === "warning" ? "⚠️" :
    uiMsg.type === "success" ? "✅" : "ℹ️";

  const preview = uiMsg.content.length > 40
    ? uiMsg.content.slice(0, 40) + "..."
    : uiMsg.content;

  const turnLabel = endsTurn ? " [ends turn]" : "";

  return `${typeIcon} ${preview}${turnLabel}`;
}
case "apply_patch": {
  const patches = r.patches as Array<{ path: string; status: string }> | undefined;
  const applied = patches?.filter(p => p.status === "APPLIED");
  const failed = patches?.filter(p => p.status !== "APPLIED" && p.status !== "DRY_RUN");
  
  if (applied && applied.length > 0) {
    const fileList = applied.map(p => path.basename(p.path)).join(", ");
    return `Patches applied: ${fileList} (${applied.length})`;
  }
  
  if (failed && failed.length > 0) {
    const fileList = failed.map(p => path.basename(p.path)).join(", ");
    return `Patch failed: ${fileList} (${failed.length})`;
  }
  
  // Dry run or no patches
  const dryRun = patches?.find(p => p.status === "DRY_RUN");
  if (dryRun) {
    const fileList = dryRun.path ? path.basename(dryRun.path) : "unknown";
    return `Dry run validated: ${fileList}`;
  }
  
  return "patch applied";
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
  return new Promise<void>((resolve) => {
    const check = () => {
      if (retrySignal.shouldRetry()) {
        retrySignal.reset();
        resolve();
      } else {
        setTimeout(check, 300);
      }
    };
    check();
  });
}

// ━━━ Agent Loop ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function runAgent(options: AgentOptions): Promise<string> {
   const {
    provider,
    model,
    conversation,
    contextManager,
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

  // ── Inject context files into system prompt ──────────────────
  // If a ContextManager is provided, rebuild the system prompt
  // with context files prepended before every agent run.
  if (contextManager) {
    const fullSystemPrompt = contextManager.buildSystemPrompt(
      conversation.getBaseSystemPrompt()
    );
    conversation.updateSystemPrompt(fullSystemPrompt);

    // Auto-truncate history if we are near the token limit
    const historyTokens = conversation.getHistoryTokens();
    if (contextManager.shouldTruncate(historyTokens)) {
      const allMessages = conversation.getMessages();
      const { truncated, removedCount } =
        contextManager.truncateHistory(allMessages);
      if (removedCount > 0) {
        conversation.applyTruncatedHistory(truncated);
      }
    }
  }

  const providerModel = buildProviderModel(provider, model);
  const aiTools = buildAISDKTools();

  let fullAssistantText = "";
  let iterationCount = 0;
  let streamRetries = 0;

  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;

    const pendingToolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }> = [];
    let streamResult: ReturnType<typeof streamText> | null = null;
    let chunkText = "";

    // ── HTTP call with retry loop ──────────────────────────────
    while (streamRetries < MAX_RETRIES) {
      streamRetries++;
      const messages = conversation.getMessages();

      try {
        streamResult = streamText({
          model: providerModel,
          messages: messages as any, // CoreMessage mapped correctly
          tools: aiTools,
          maxSteps: 1,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        });

        // ── Stream consumption ─────────────────────────────────
        chunkText = "";
        pendingToolCalls.length = 0; // reset for retries

        for await (const chunk of streamResult.fullStream) {
          if (chunk.type === "text-delta") {
            const token = chunk.textDelta;
            chunkText += token;
            if (onToken) onToken(token);
          } else if (chunk.type === "tool-call") {
            pendingToolCalls.push({
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              input: chunk.args,
            });
          } else if (chunk.type === "error") {
            // The AI SDK surfaces some failures (e.g. tool-schema
            // serialization, mid-stream network drops) as error chunks
            // rather than thrown exceptions. Re-throw so the catch block
            // below routes them through the same retry/event pipeline —
            // otherwise the stream ends silently with no tool call and
            // no error shown to the user.
            throw chunk.error;
          }
        }

        // ── Output-truncation detection ────────────────────────
        // When the model hits maxTokens mid-generation it is cut off.
        // If it was mid-tool-call, the JSON arguments are truncated, so
        // the AI SDK emits NO tool-call chunk (the args never parse) and
        // the loop would otherwise exit with empty text and no tool call
        // — the silent "ghost" where the spinner stops with no response.
        // finishReason "length" means the output was truncated by the
        // token limit; surface a clear, actionable error instead.
        if (chunkText.length === 0 && pendingToolCalls.length === 0) {
          let finishReason: unknown = undefined;
          try {
            finishReason = await streamResult.finishReason;
          } catch {
            // Some provider/SDK versions reject awaiting finishReason
            // after an aborted stream — treat as unknown and fall through.
          }
          if (finishReason === "length") {
            const event = makeToolErrorEvent(
              "maxTokens",
              new Error(
                `Output was truncated at ${config.maxTokens} tokens before the model ` +
                `could finish its response (finishReason: "length"). This usually means ` +
                `the file or edit was too large to emit in one tool call within the ` +
                `current MAX_TOKENS limit. Raise MAX_TOKENS in .env (e.g. 16384) or ask ` +
                `for the change in smaller chunks.`
              )
            );
            if (onAgentEvent) onAgentEvent(event);
            if (onFatalError) onFatalError(event);
            if (onError) onError(new Error(event.message));
            return fullAssistantText;
          }
        }

        break; // Success — stream fully consumed, exit retry loop!

      } catch (rawError) {
        const event = translateProviderError(provider, rawError, streamRetries);

        if (onAgentEvent) onAgentEvent(event);

        // ── Rate limit: pause and countdown ──
        if (isRateLimitEvent(event)) {
          await waitForRateLimit(event, onRateLimitWait);
          continue; // retry
        }

        // ── Server error: exponential backoff ──
        if (isServerErrorEvent(event)) {
          if (streamRetries >= MAX_RETRIES) {
            if (onFatalError) onFatalError(event);
            if (onError) onError(new Error(event.message));
            return fullAssistantText;
          }
          const backoff = getBackoffMs(streamRetries);
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
          // No retry signal wired — treat as fatal
          if (onFatalError) onFatalError(event);
          if (onError) onError(new Error(event.message));
          return fullAssistantText;
        }

        // ── Auth error or Unknown: unrecoverable ──
        if (onFatalError) onFatalError(event);
        if (onError) onError(new Error(event.message));
        return fullAssistantText;
      }
    }

    if (!streamResult) break;

    fullAssistantText += chunkText;

    // Save assistant message to conversation
    if (chunkText || pendingToolCalls.length > 0) {
      const assistantContent: any[] = [];
      if (chunkText) {
        assistantContent.push({ type: "text", text: chunkText });
      }
      for (const tc of pendingToolCalls) {
        assistantContent.push({
          type: "tool-call",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.input,
        });
      }
      
      if (assistantContent.length === 1 && assistantContent[0].type === "text") {
        conversation.addMessage({ role: "assistant", content: chunkText });
      } else if (assistantContent.length > 0) {
        conversation.addMessage({ role: "assistant", content: assistantContent });
      }
    }

    if (pendingToolCalls.length === 0) break;

    // ── Tool execution ─────────────────────────────────────────
    const toolResultBlocks: any[] = [];

    for (const tc of pendingToolCalls) {
      const { toolName, input } = tc;
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
        toolResultBlocks.push({
          type: "tool-result",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          result: errResult,
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

      if (toolResult && typeof toolResult === "object") {
        const res = toolResult as Record<string, any>;
        
        // Break if ask_question was called
        if (res.requires_user_input === true) {
          if (onAgentEvent) {
            onAgentEvent({
              kind: "agent_paused",
              message: `Agent paused: ${res.question}`,
              question: res.question as string,
              options: res.options as string[] | undefined,
              retryable: false,
              requiresUserAction: true,
              timestamp: Date.now(),
            });
          }
          return fullAssistantText; // Exit runAgent immediately
        }
        
        // Break if send_message with ends_turn was called
        if (res.message_sent === true && res.ends_turn === true) {
          if (onAgentEvent) {
            const uiMsg = res.ui_message as {
              title?: string;
              content: string;
              type: string;
            };
            onAgentEvent({
              kind: "agent_turn_end",
              message: `Agent finished turn: ${uiMsg.content}`,
              uiMessage: uiMsg,
              retryable: false,
              requiresUserAction: false,
              timestamp: Date.now(),
            });
          }
          return fullAssistantText; // Exit runAgent immediately
        }
      }

      // Feed tool result back to LLM
      toolResultBlocks.push({
        type: "tool-result",
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        result: toolResult,
      });
    }

    // Save ALL tool results as a single tool message block
    if (toolResultBlocks.length > 0) {
      conversation.addMessage({
        role: "tool",
        content: toolResultBlocks,
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