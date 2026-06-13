import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGroq } from "@ai-sdk/groq";
import chalk from "chalk";

import { config } from "./config";
import type { Conversation } from "./conversation";
import type { ProviderName } from "./config";
import { TOOLS, getTool, buildAISDKTools } from "../tools";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentOptions {
  provider: ProviderName;
  model: string;
  conversation: Conversation;
  onToken?: (token: string) => void;
  onToolCall?: (toolName: string, input: unknown) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  onError?: (error: Error) => void;
}

// ─── Build Provider Model ─────────────────────────────────────────────────────

function buildProviderModel(provider: ProviderName, model: string) {
  switch (provider) {
    case "openrouter": {
      if (!config.openrouterApiKey) {
        throw new Error("OPENROUTER_API_KEY is not set.");
      }
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
      if (!config.groqApiKey) {
        throw new Error("GROQ_API_KEY is not set.");
      }
      const client = createGroq({ apiKey: config.groqApiKey });
      return client(model);
    }

    case "nvidia": {
      if (!config.nvidiaApiKey) {
        throw new Error("NVIDIA_API_KEY is not set.");
      }
      const client = createOpenAI({
        apiKey: config.nvidiaApiKey,
        baseURL: "https://integrate.api.nvidia.com/v1",
      });
      return client(model);
    }

    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}

// ─── Tool Display ─────────────────────────────────────────────────────────────

function formatToolInput(toolName: string, input: unknown): string {
  if (typeof input !== "object" || input === null) return String(input);

  const obj = input as Record<string, unknown>;
  const entries = Object.entries(obj)
    .slice(0, 3)
    .map(([k, v]) => {
      const val = typeof v === "string" && v.length > 60
        ? v.slice(0, 60) + "..."
        : String(v);
      return `${k}: ${val}`;
    });

  return entries.join(", ");
}

function formatToolResult(toolName: string, result: unknown): string {
  if (typeof result !== "object" || result === null) return String(result);

  const obj = result as Record<string, unknown>;

  if ("success" in obj && !obj.success) {
    return chalk.red(`✗ ${obj.error}`);
  }

  // Tool-specific summaries
  switch (toolName) {
    case "read_file":
      return chalk.green(`✓ ${obj.lines} lines returned (${obj.size} bytes)`);

    case "write_file":
      return chalk.green(
        `✓ ${obj.isNew ? "Created" : "Updated"} (${obj.bytesWritten} bytes)`
      );

    case "edit_file":
      return chalk.green(`✓ ${obj.linesChanged} lines changed`);

    case "list_files": {
      const r = obj as { files: string[]; directories: string[]; total: number };
      return chalk.green(
        `✓ ${r.files.length} files, ${r.directories.length} directories`
      );
    }

    case "run_command": {
      const r = obj as { exitCode: number; duration: number };
      const statusColor = r.exitCode === 0 ? chalk.green : chalk.yellow;
      return statusColor(`✓ exit ${r.exitCode} (${r.duration}ms)`);
    }

    default:
      return chalk.green("✓ done");
  }
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
    onError,
  } = options;

  const providerModel = buildProviderModel(provider, model);
  const aiTools = buildAISDKTools();

  // Map messages to AI SDK format
  const messages = conversation.getMessages().map((msg) => ({
    role: msg.role as "system" | "user" | "assistant",
    content: msg.content,
  }));

  let fullAssistantText = "";
  let iterationCount = 0;
  const MAX_ITERATIONS = 10; // prevent infinite loops

  // Tool call accumulator for the current response
  const pendingToolCalls: Array<{
    toolName: string;
    input: unknown;
    toolCallId: string;
  }> = [];

  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;
    pendingToolCalls.length = 0;

    try {
      const result = streamText({
        model: providerModel,
        messages,
        tools: aiTools,
        maxSteps: 1,           // We manage the loop manually
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });

      // Stream text tokens
      let chunkText = "";

      for await (const chunk of result.fullStream) {
        if (chunk.type === "text-delta") {
          const token = chunk.textDelta;
          chunkText += token;
          fullAssistantText += token;
          if (onToken) onToken(token);

        } else if (chunk.type === "tool-call") {
          // Tool call detected
          pendingToolCalls.push({
            toolName: chunk.toolName,
            input: chunk.args,
            toolCallId: chunk.toolCallId,
          });
        }
      }

      // If no tool calls, we're done
      if (pendingToolCalls.length === 0) {
        break;
      }

      // Add assistant message with tool calls to history
      if (chunkText) {
        // Add any text the assistant said before calling tools
        messages.push({
          role: "assistant",
          content: chunkText,
        });
      }

      // Execute each tool call
      for (const toolCall of pendingToolCalls) {
        const { toolName, input, toolCallId } = toolCall;

        // Notify caller that tool is being called
        if (onToolCall) onToolCall(toolName, input);

        // Display tool call
        console.log("");
        console.log(chalk.cyan(`  ┌─ ⚙  ${toolName}`));
        console.log(chalk.dim(`  │  ${formatToolInput(toolName, input)}`));

        // Find and execute the tool
        const toolDef = getTool(toolName);

        if (!toolDef) {
          const errMsg = `Tool not found: ${toolName}`;
          console.log(chalk.red(`  └─ ✗ ${errMsg}`));

          messages.push({
            role: "user" as const,
            content: `Tool result for ${toolName}:\n${JSON.stringify({ success: false, error: errMsg }, null, 2)}`,
          });

          if (onToolResult) onToolResult(toolName, { success: false, error: errMsg });
          continue;
        }

        let toolResult: unknown;

        try {
          toolResult = await toolDef.execute(input);
        } catch (toolError) {
          const errMsg =
            toolError instanceof Error
              ? toolError.message
              : "Unknown tool error";

          toolResult = { success: false, error: errMsg };
        }

        // Display result summary
        console.log(chalk.cyan(`  └─ ${formatToolResult(toolName, toolResult)}`));

        // For run_command, also show stdout/stderr if present
        if (toolName === "run_command" && typeof toolResult === "object" && toolResult !== null) {
          const r = toolResult as { stdout?: string; stderr?: string; exitCode?: number };
          if (r.stdout && r.stdout.trim()) {
            console.log(chalk.dim("  stdout:"));
            r.stdout
              .trim()
              .split("\n")
              .slice(0, 20)
              .forEach((line) => console.log(chalk.dim(`    ${line}`)));
          }
          if (r.stderr && r.stderr.trim()) {
            console.log(chalk.yellow("  stderr:"));
            r.stderr
              .trim()
              .split("\n")
              .slice(0, 10)
              .forEach((line) => console.log(chalk.yellow(`    ${line}`)));
          }
        }

        if (onToolResult) onToolResult(toolName, toolResult);

        // Add tool result to messages
        // Using a simple assistant message approach for compatibility
        messages.push({
          role: "user" as const,
          content: `Tool result for ${toolName}:\n${JSON.stringify(toolResult, null, 2)}`,
        });
      }

      // Continue loop — agent will process tool results and respond

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