import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGroq } from "@ai-sdk/groq";

import { config } from "./config";
import type { Conversation } from "./conversation";
import type { ProviderName } from "./config";
import { getTool, buildAISDKTools } from "../tools";
import type { ActionType } from "./permissions";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  onError?: (error: Error) => void;
}

// ─── Build Provider Model ─────────────────────────────────────────────────────

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

// ─── Tool Result Summary ──────────────────────────────────────────────────────

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

// ─── Permission Bridge ────────────────────────────────────────────────────────

// Global permission handler — set by App.tsx before agent runs
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
  // Fallback — auto-approve if no UI handler registered
  return true;
}

// ─── Agent Loop ───────────────────────────────────────────────────────────────

export async function runAgent(options: AgentOptions): Promise<string> {
  const {
    provider,
    model,
    conversation,
    onToken,
    onToolCall,
    onToolResult,
    onPermissionRequest,
    onError,
  } = options;

  // Wire permission handler for this run
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
  const MAX_ITERATIONS = 10;

  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;

    const pendingToolCalls: Array<{
      toolName: string;
      input: unknown;
    }> = [];

    try {
      const result = streamText({
        model: providerModel,
        messages,
        tools: aiTools,
        maxSteps: 1,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });

      let chunkText = "";

      for await (const chunk of result.fullStream) {
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

      // No tool calls — done
      if (pendingToolCalls.length === 0) break;

      if (chunkText) {
        messages.push({ role: "assistant", content: chunkText });
      }

      // Execute each tool
      for (const { toolName, input } of pendingToolCalls) {
        if (onToolCall) onToolCall(toolName, input);

        const toolDef = getTool(toolName);

        if (!toolDef) {
          const errResult = { success: false, error: `Tool not found: ${toolName}` };
          if (onToolResult) onToolResult(toolName, errResult);
          messages.push({
            role: "user",
            content: `Tool result for ${toolName}:\n${JSON.stringify(errResult, null, 2)}`,
          });
          continue;
        }

        let toolResult: unknown;

        try {
          toolResult = await toolDef.execute(input);
        } catch (toolError) {
          toolResult = {
            success: false,
            error: toolError instanceof Error ? toolError.message : "Unknown tool error",
          };
        }

        if (onToolResult) onToolResult(toolName, toolResult);

        messages.push({
          role: "user",
          content: `Tool result for ${toolName}:\n${JSON.stringify(toolResult, null, 2)}`,
        });
      }

    } catch (error) {
      if (error instanceof Error) {
        if (onError) onError(error);
        throw error;
      }
      throw new Error("Unknown error in agent loop");
    }
  }

  if (iterationCount >= MAX_ITERATIONS) {
    const warning = "\n[Agent reached maximum tool call iterations]";
    fullAssistantText += warning;
    if (onToken) onToken(warning);
  }

  return fullAssistantText;
}