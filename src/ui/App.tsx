import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, Static, useInput, useApp } from "ink";
import { WelcomeBanner } from "./WelcomeBanner";
import { LivePreview } from "./LivePreview";
import { InputBar } from "./InputBar";
import { StatusLine } from "./StatusLine";
import { PermissionPrompt } from "./PermissionPrompt";
import { MessageItem } from "./MessageItem";
import { ToolOutput } from "./ToolOutput";
import type { ChatMessage } from "./MessageItem";
import type { ToolCall, ToolStatus } from "./ToolOutput";
import type { PendingPermission } from "./PermissionPrompt";
import type { ProviderName } from "../core/config";
import { config } from "../core/config";
import { Conversation } from "../core/conversation";
import { runAgent } from "../core/agent";
import { PROVIDER_MODELS } from "../providers";
import { formatTokenCount } from "../utils/tokens";
import { ContextManager } from "../core/context";
import type { AgentEvent, RateLimitEvent, NetworkEvent } from "../errors/base";
import { isAuthEvent, isNetworkEvent, isRateLimitEvent } from "../errors/base";

const TOKEN_LIMITS: Record<ProviderName, number> = {
  openrouter: 128000,
  groq: 32768,
  nvidia: 128000,
};

let idCounter = 0;
const nextId = () => `msg-${++idCounter}`;
const nextToolId = () => `tool-${++idCounter}`;

// Flush a streamed paragraph to <Static> when we see this sequence.
const PARAGRAPH_BREAK = "\n\n";

// Hard cap so a never-ending paragraph doesn't grow the live region unbounded.
// When buffer exceeds this, flush at the last newline (or hard cut).
const MAX_LIVE_CHARS = 1200;

// Throttle live state updates so we don't re-render every single token
// on fast streams. 60ms ≈ ~16fps, smooth and easy on the terminal.
const LIVE_UPDATE_MS = 60;

export function App() {
  const { exit } = useApp();

  const [completedMessages, setCompletedMessages] = useState<ChatMessage[]>([]);

  // Live preview state — small, throttled, capped in height
  const [livePreview, setLivePreview] = useState<{
    text: string;
    activeTool: ToolCall | null;
    hideIcon?: boolean;
  }>({ text: "", activeTool: null });

  const [isLoading, setIsLoading] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<ProviderName>(
    config.defaultProvider
  );
  const [currentModel, setCurrentModel] = useState<string>(config.defaultModel);
  const [tokenCount, setTokenCount] = useState(0);
  const [pendingPermission, setPendingPermission] =
    useState<PendingPermission | null>(null);
  const [termWidth, setTermWidth] = useState(process.stdout.columns ?? 80);
    // ━━━ Error system state ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // agentStatus drives what the UI shows during/after the loop
  type AgentStatus =
    | "idle"
    | "running"
    | "retrying"
    | "rate_limited"
    | "network_dropped"
    | "fatal_error";

  const [agentStatus, setAgentStatus] = useState<AgentStatus>("idle");
  // Countdown remaining ms for rate limit display
  const [rateLimitMs, setRateLimitMs] = useState<number | null>(null);
  // Whether user can press R to retry (network drop state)
  const [networkDropped, setNetworkDropped] = useState(false);
  // Retry attempt counter shown in status
  const [retryAttempt, setRetryAttempt] = useState(0);

  // retrySignal — a shared mutable ref the agent polls
  // We use a ref (not state) so the polling loop sees the latest value
  // without causing re-renders on every poll tick.
  const retryPressedRef = useRef(false);
  const retrySignal = {
    shouldRetry: () => retryPressedRef.current,
    reset: () => { retryPressedRef.current = false; },
  };
  const conversationRef = useRef(new Conversation());
  const contextManagerRef = useRef(new ContextManager(config.defaultProvider));

  // Buffer of in-flight assistant text (committed text not yet flushed)
  const streamBufferRef = useRef<string>("");
  // The complete assistant response so far (for conversation history)
  const fullResponseRef = useRef<string>("");
  // Throttle timer + pending flag
  const lastUpdateRef = useRef<number>(0);
  const pendingUpdateRef = useRef<NodeJS.Timeout | null>(null);
  // Active tools by id
  const activeToolCallsRef = useRef(new Map<string, ToolCall>());
  // Currently-running tool (the one we render live)
  const currentToolIdRef = useRef<string | null>(null);
  const isFirstChunkRef = useRef<boolean>(true);

  useEffect(() => {
    const handleResize = () => setTermWidth(process.stdout.columns ?? 80);
    process.stdout.on("resize", handleResize);
    return () => {
      process.stdout.off("resize", handleResize);
    };
  }, []);

  const pushCompleted = useCallback((msg: ChatMessage) => {
    setCompletedMessages((prev) => [...prev, msg]);
  }, []);

  const pushNotice = useCallback(
    (content: string) => {
      pushCompleted({ id: nextId(), role: "system-notice", content });
    },
    [pushCompleted]
  );

  // ─── Live preview update (throttled) ────────────────────────────────────────

  const scheduleLiveUpdate = useCallback(() => {
    const now = Date.now();
    const since = now - lastUpdateRef.current;

    if (since >= LIVE_UPDATE_MS) {
      lastUpdateRef.current = now;
      const tool = currentToolIdRef.current
        ? activeToolCallsRef.current.get(currentToolIdRef.current) ?? null
        : null;
      setLivePreview({
        text: streamBufferRef.current,
        activeTool: tool,
        hideIcon: !isFirstChunkRef.current,
      });
      return;
    }

    if (pendingUpdateRef.current) return;

    pendingUpdateRef.current = setTimeout(() => {
      pendingUpdateRef.current = null;
      lastUpdateRef.current = Date.now();
      const tool = currentToolIdRef.current
        ? activeToolCallsRef.current.get(currentToolIdRef.current) ?? null
        : null;
      setLivePreview({
        text: streamBufferRef.current,
        activeTool: tool,
        hideIcon: !isFirstChunkRef.current,
      });
    }, LIVE_UPDATE_MS - since);
  }, []);

  // ─── Flush completed paragraphs out of the buffer into <Static> ─────────────

  const flushParagraphs = useCallback(() => {
    let buf = streamBufferRef.current;
    let didFlush = false;

    // Flush every complete paragraph (\n\n)
    let idx = buf.indexOf(PARAGRAPH_BREAK);
    while (idx !== -1) {
      const chunk = buf.slice(0, idx + PARAGRAPH_BREAK.length);
      buf = buf.slice(idx + PARAGRAPH_BREAK.length);
      if (chunk.trim()) {
        pushCompleted({
          id: nextId(),
          role: "assistant",
          content: chunk.replace(/\n+$/, ""),
          isStreaming: false,
          hideIcon: !isFirstChunkRef.current,
        });
        isFirstChunkRef.current = false;
        didFlush = true;
      }
      idx = buf.indexOf(PARAGRAPH_BREAK);
    }

    // Hard cap: if buffer is too long even without paragraph breaks,
    // flush at the last newline (or hard cut).
    if (buf.length > MAX_LIVE_CHARS) {
      const nl = buf.lastIndexOf("\n", MAX_LIVE_CHARS);
      const cut = nl !== -1 ? nl + 1 : MAX_LIVE_CHARS;
      const chunk = buf.slice(0, cut);
      buf = buf.slice(cut);
      if (chunk.trim()) {
        pushCompleted({
          id: nextId(),
          role: "assistant",
          content: chunk.replace(/\n+$/, ""),
          isStreaming: false,
          hideIcon: !isFirstChunkRef.current,
        });
        isFirstChunkRef.current = false;
        didFlush = true;
      }
    }

    streamBufferRef.current = buf;
    return didFlush;
  }, [pushCompleted]);

  // Force-flush everything left in the buffer (end of response)
  const flushAll = useCallback(() => {
    if (pendingUpdateRef.current) {
      clearTimeout(pendingUpdateRef.current);
      pendingUpdateRef.current = null;
    }
    const buf = streamBufferRef.current;
    if (buf.trim()) {
      pushCompleted({
        id: nextId(),
        role: "assistant",
        content: buf.replace(/\n+$/, ""),
        isStreaming: false,
        hideIcon: !isFirstChunkRef.current,
      });
      isFirstChunkRef.current = false;
    }
    streamBufferRef.current = "";
  }, [pushCompleted]);

  // ─── Permission Handler ─────────────────────────────────────────────────────

  const requestPermission = useCallback(
    (
      action: PendingPermission["action"],
      title: string,
      details: string[]
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        const args = process.argv.slice(2);
        if (
          args.includes("--yes") ||
          args.includes("-y") ||
          process.env.YES_TO_ALL === "true"
        ) {
          resolve(true);
          return;
        }
        setPendingPermission({
          id: nextId(),
          action,
          title,
          details,
          resolve: (approved) => {
            setPendingPermission(null);
            resolve(approved);
          },
        });
      });
    },
    []
  );

  // ─── Slash Commands ─────────────────────────────────────────────────────────

  const handleSlashCommand = useCallback(
    (input: string): boolean => {
      if (!input.startsWith("/")) return false;
      const parts = input.trim().split(" ");
      const command = parts[0];
      const args = parts.slice(1);

      pushCompleted({ id: nextId(), role: "user", content: input });

      switch (command) {
                case "/help":
          pushNotice(
            [
              "Commands:",
              "  /help              Show this list",
              "  /model [name]      Switch model or list all",
              "  /clear             Clear conversation",
              "  /tokens            Show token usage breakdown",
              "  /add [path]        Add file to context (no path = list files)",
              "  /remove <path>     Remove file from context",
              "  /context           Show context window summary",
              "  /exit              Quit",
              "",
              "Tips:",
              "  @filename          Mention a file — adds it to context automatically",
              "  Ctrl+C             Exit",
            ].join("\n")
          );
          return true;

        case "/clear":
          conversationRef.current.clear();
          contextManagerRef.current.clearFiles();
          setCompletedMessages([]);
          setTokenCount(0);
          pushNotice("Conversation and context cleared.");
          return true;

                case "/tokens": {
          const historyTokens = conversationRef.current.getHistoryTokens();
          const summary = contextManagerRef.current.getSummary(historyTokens);
          const lines = [
            `Context: ${formatTokenCount(summary.used)} / ${formatTokenCount(summary.total)} tokens (${summary.percent.toFixed(1)}%)`,
            `  History : ${formatTokenCount(summary.historyTokens)} tokens`,
            `  Files   : ${formatTokenCount(summary.fileTokens)} tokens (${summary.fileCount} file${summary.fileCount !== 1 ? "s" : ""})`,
          ];
          if (summary.files.length > 0) {
            lines.push("  In context:");
            summary.files.forEach((f) => lines.push(`    • ${f}`));
          }
          pushNotice(lines.join("\n"));
          return true;
        }

        case "/add": {
          const filePath = args[0];
          if (!filePath) {
            // Show currently loaded files
            const files = contextManagerRef.current.getFiles();
            if (files.length === 0) {
              pushNotice("No files in context. Use /add <path> to add one.");
            } else {
              const lines = ["Files in context:"];
              files.forEach((f) =>
                lines.push(
                  `  • ${f.filePath} (${formatTokenCount(f.tokens)} tokens, via ${f.source})`
                )
              );
              pushNotice(lines.join("\n"));
            }
            return true;
          }
          const result = contextManagerRef.current.addFile(filePath, "command");
          if (result.success) {
            pushNotice(
              `Added to context: ${filePath}\n` +
              `  ${formatTokenCount(result.tokens ?? 0)} tokens, ${result.lines} lines`
            );
          } else {
            pushCompleted({
              id: nextId(),
              role: "error",
              content: `Failed to add file: ${result.error}`,
            });
          }
          return true;
        }

        case "/remove": {
          const filePath = args[0];
          if (!filePath) {
            pushNotice("Usage: /remove <path>");
            return true;
          }
          const removed = contextManagerRef.current.removeFile(filePath);
          if (removed) {
            pushNotice(`Removed from context: ${filePath}`);
          } else {
            pushNotice(`File not in context: ${filePath}`);
          }
          return true;
        }

        case "/context": {
          // Alias for /add with no args — shows context summary
          const files = contextManagerRef.current.getFiles();
          const historyTokens = conversationRef.current.getHistoryTokens();
          const summary = contextManagerRef.current.getSummary(historyTokens);
          if (files.length === 0) {
            pushNotice(
              `Context window: ${formatTokenCount(summary.used)} / ${formatTokenCount(summary.total)} tokens\n` +
              `No files loaded. Use /add <path> or @filename to add files.`
            );
          } else {
            const lines = [
              `Context window: ${formatTokenCount(summary.used)} / ${formatTokenCount(summary.total)} tokens (${summary.percent.toFixed(1)}%)`,
              "Files:",
            ];
            files.forEach((f) =>
              lines.push(
                `  • ${f.filePath}  ${formatTokenCount(f.tokens)} tokens`
              )
            );
            pushNotice(lines.join("\n"));
          }
          return true;
        }

        case "/model": {
          const modelArg = args[0];
          if (!modelArg) {
            const lines = [`Current: ${currentProvider} / ${currentModel}`, ""];
            for (const [pName, models] of Object.entries(PROVIDER_MODELS)) {
              lines.push(`[${pName}]`);
              models.forEach((m) => {
                const cur = pName === currentProvider && m === currentModel;
                lines.push(`  ${cur ? "→ " : "  "}${m}`);
              });
              lines.push("");
            }
            pushNotice(lines.join("\n"));
            return true;
          }
          const allModels = Object.entries(PROVIDER_MODELS).flatMap(
            ([p, ms]) => ms.map((m) => ({ provider: p as ProviderName, model: m }))
          );
          const match = allModels.find((e) => e.model === modelArg);
          if (match) {
            setCurrentProvider(match.provider);
            setCurrentModel(match.model);
            // Update context manager so token limits reflect new provider
            contextManagerRef.current.setProvider(match.provider);
            pushNotice(`Switched to ${match.model} (${match.provider})`);
          } else {
            setCurrentModel(modelArg);
            pushNotice(`Switched to model: ${modelArg} on ${currentProvider}`);
          }
          return true;
        }

        case "/exit":
          pushNotice("Goodbye.");
          setTimeout(() => exit(), 200);
          return true;

        default:
          pushNotice(`Unknown command: ${command}. Type /help for list.`);
          return true;
      }
    },
    [pushCompleted, pushNotice, currentModel, currentProvider, exit]
  );

  // ─── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (userInput: string) => {
      const trimmed = userInput.trim();
      if (!trimmed || isLoading) return;
      if (handleSlashCommand(trimmed)) return;

      pushCompleted({ id: nextId(), role: "user", content: trimmed });

      // ── Auto-add @mentioned files to context ─────────────────
      // Extract all @mentions from user input and load them into
      // the ContextManager if not already loaded.
      const mentionRegex = /@([\w.\/\-]+)/g;
      let mentionMatch;
      const mentionNotices: string[] = [];

      while ((mentionMatch = mentionRegex.exec(trimmed)) !== null) {
        const mentionedPath = mentionMatch[1];
        if (!contextManagerRef.current.hasFile(mentionedPath)) {
          const result = contextManagerRef.current.addFile(
            mentionedPath,
            "mention"
          );
          if (result.success) {
            mentionNotices.push(
              `Added to context: ${mentionedPath} (${formatTokenCount(result.tokens ?? 0)} tokens)`
            );
          }
          // Silent fail on mention — don't block the message if file not found
        }
      }

      if (mentionNotices.length > 0) {
        pushNotice(mentionNotices.join("\n"));
      }

      conversationRef.current.addUserMessage(trimmed);

      setIsLoading(true);

      // ── Warn user if approaching context limit ────────────────
      const preRunHistory = conversationRef.current.getHistoryTokens();
      const preRunSummary = contextManagerRef.current.getSummary(preRunHistory);
      if (preRunSummary.percent >= 70 && preRunSummary.percent < 85) {
        pushNotice(
          `⚠ Context at ${preRunSummary.percent.toFixed(0)}% ` +
          `(${formatTokenCount(preRunSummary.used)} / ${formatTokenCount(preRunSummary.total)} tokens). ` +
          `Older messages will be trimmed soon.`
        );
      }

      streamBufferRef.current = "";
      fullResponseRef.current = "";
      isFirstChunkRef.current = true;
      activeToolCallsRef.current.clear();
      currentToolIdRef.current = null;
      setLivePreview({ text: "", activeTool: null });

            setAgentStatus("running");
      setRateLimitMs(null);
      setNetworkDropped(false);
      setRetryAttempt(0);

      try {
        await runAgent({
          provider: currentProvider,
          model: currentModel,
          conversation: conversationRef.current,
          contextManager: contextManagerRef.current,
          onToken: (token) => {
            fullResponseRef.current += token;
            streamBufferRef.current += token;
            flushParagraphs();
            scheduleLiveUpdate();
          },

          onToolCall: (toolName, input) => {
            flushAll();
            const toolId = nextToolId();
            const toolCall: ToolCall = {
              id: toolId,
              toolName,
              input: (input as Record<string, unknown>) ?? {},
              status: "running",
            };
            activeToolCallsRef.current.set(toolId, toolCall);
            currentToolIdRef.current = toolId;
            setLivePreview({
              text: "",
              activeTool: toolCall,
              hideIcon: !isFirstChunkRef.current,
            });
          },

          onToolResult: (toolName, result) => {
            let targetId: string | undefined;
            let original: ToolCall | undefined;
            for (const [id, tc] of activeToolCallsRef.current.entries()) {
              if (tc.toolName === toolName && tc.status === "running") {
                targetId = id;
                original = tc;
                break;
              }
            }
            if (!targetId || !original) return;

            const r = result as Record<string, unknown>;
            let status: ToolStatus = "success";
            let resultSummary = "";
            let stdout: string | undefined;
            let stderr: string | undefined;

            if ("success" in r && !r.success) {
              const errMsg = String(r.error ?? "Failed");
              if (errMsg.includes("User denied")) {
                status = "denied";
                resultSummary = "User denied";
              } else {
                status = "error";
                resultSummary = errMsg;
              }
            } else {
              switch (toolName) {
                case "read_file":
                  resultSummary = r.lines != null && r.size != null
                    ? `${r.lines} lines (${r.size} bytes)`
                    : "done";
                  break;
                case "write_file":
                  resultSummary = r.path != null
                    ? `${r.isNew ? "Created" : "Updated"} → ${r.bytesWritten} bytes`
                    : "done";
                  break;
                case "edit_file":
                  resultSummary = r.linesChanged != null
                    ? `${r.linesChanged} lines changed`
                    : "done";
                  break;
                case "list_files": {
                  const entries = r.entries as string[] | undefined;
                  const files = r.files as string[] | undefined;
                  const dirs = r.directories as string[] | undefined;
                  if (entries) {
                    resultSummary = `${entries.length} items`;
                  } else if (files && dirs) {
                    resultSummary = `${files.length} files, ${dirs.length} dirs`;
                  } else {
                    resultSummary = "done";
                  }
                  break;
                }
                case "run_command": {
                  const exitCode = r.exitCode as number | undefined;
                  const duration = r.duration as number | undefined;
                  resultSummary = exitCode != null && duration != null
                    ? `exit ${exitCode} (${duration}ms)`
                    : "done";
                  stdout = r.stdout as string | undefined;
                  stderr = r.stderr as string | undefined;
                  break;
                }
                default:
                  resultSummary = "done";
              }
            }

            const finishedTool: ToolCall = {
              ...original,
              status,
              resultSummary,
              stdout,
              stderr,
            };

            pushCompleted({
              id: nextId(),
              role: "assistant",
              content: "",
              isStreaming: false,
              toolCalls: [finishedTool],
              hideIcon: !isFirstChunkRef.current,
            });
            isFirstChunkRef.current = false;

            activeToolCallsRef.current.delete(targetId);
            if (currentToolIdRef.current === targetId) {
              currentToolIdRef.current = null;
            }
            setLivePreview({ text: "", activeTool: null });
          },

          onPermissionRequest: requestPermission,

          // ── Typed event callbacks ──────────────────────────────

          onAgentEvent: (event: AgentEvent) => {
            // Log every event as a system notice so the user can
            // see what the agent is doing (retrying, waiting, etc.)
            if (event.kind === "server_error" || event.kind === "network_error") {
              pushNotice(`⚠ ${event.message}`);
            }
          },

          onRateLimitWait: (event: RateLimitEvent, remainingMs: number) => {
            setAgentStatus("rate_limited");
            setRateLimitMs(remainingMs);
            if (remainingMs === 0) {
              setRateLimitMs(null);
              setAgentStatus("retrying");
              setRetryAttempt((n) => n + 1);
            }
          },

          onNetworkDrop: (event: NetworkEvent) => {
            setAgentStatus("network_dropped");
            setNetworkDropped(true);
            flushAll();
            pushCompleted({
              id: nextId(),
              role: "error",
              content: event.message,
            });
          },

          onFatalError: (event: AgentEvent) => {
            flushAll();
            setAgentStatus("fatal_error");
            pushCompleted({
              id: nextId(),
              role: "error",
              content: event.message,
            });
          },

          onError: (error: Error) => {
            // Legacy fallback — only fires if no typed handler caught it
            flushAll();
            pushCompleted({
              id: nextId(),
              role: "error",
              content: error.message,
            });
          },

          retrySignal,
        });

        flushAll();
        conversationRef.current.addAssistantMessage(fullResponseRef.current);
        // Token count now includes file context tokens for accurate display
        const histTokens = conversationRef.current.getHistoryTokens();
        const summary = contextManagerRef.current.getSummary(histTokens);
        setTokenCount(summary.used);
      } catch (error) {
        flushAll();
        conversationRef.current.removeLastMessage();
        pushCompleted({
          id: nextId(),
          role: "error",
          content:
            error instanceof Error ? error.message : "An unknown error occurred.",
        });
      } finally {
        setLivePreview({ text: "", activeTool: null });
        setAgentStatus("idle");
        setRateLimitMs(null);
        setNetworkDropped(false);
        setIsLoading(false);
      }
    },
    [
      isLoading,
      handleSlashCommand,
      pushCompleted,
      currentProvider,
      currentModel,
      requestPermission,
      flushParagraphs,
      flushAll,
      scheduleLiveUpdate,
    ]
  );

    useInput((input, key) => {
    if (key.ctrl && input === "c") exit();

    // R to retry after network drop — only active when dropped
    if ((input === "r" || input === "R") && networkDropped) {
      retryPressedRef.current = true;
      setNetworkDropped(false);
      setAgentStatus("retrying");
      pushNotice("Retrying connection...");
    }
  });
  const staticItems: Array<
    { kind: "welcome" } | { kind: "message"; msg: ChatMessage }
  > = [
    { kind: "welcome" },
    ...completedMessages.map((msg) => ({ kind: "message" as const, msg })),
  ];

  const showLive =
    isLoading && (livePreview.text.length > 0 || livePreview.activeTool);

  return (
    <Box flexDirection="column">
      {/* Scroll-safe history */}
      <Static items={staticItems}>
        {(item) => {
          if (item.kind === "welcome") {
            return (
              <WelcomeBanner
                key="welcome"
                provider={currentProvider}
                model={currentModel}
                width={termWidth}
              />
            );
          }
          return <MessageItem key={item.msg.id} message={item.msg} />;
        }}
      </Static>

      {/* DYNAMIC region — wrapped in a single container so Ink treats it as one unit */}
      <Box flexDirection="column">
        {pendingPermission && (
          <Box marginX={1}>
            <PermissionPrompt permission={pendingPermission} />
          </Box>
        )}

        {!pendingPermission && showLive && (
          <LivePreview
            text={livePreview.text}
            activeTool={livePreview.activeTool}
            hideIcon={livePreview.hideIcon}
          />
        )}

        {!pendingPermission && isLoading && !showLive && (
          <LivePreview text="" activeTool={null} thinkingOnly />
        )}

        {/* Input bar (includes menu below itself) */}
        <InputBar
          onSubmit={handleSubmit}
          isDisabled={isLoading || pendingPermission !== null}
          width={termWidth}
          placeholder={
            pendingPermission
              ? "Waiting for permission response (y/n)..."
              : 'Try "read package.json" or @src/index.ts'
          }
        />

        {/* Status line — stays at the very bottom */}
        <StatusLine
          provider={currentProvider}
          model={currentModel}
          tokenCount={tokenCount}
          tokenLimit={TOKEN_LIMITS[currentProvider]}
          contextFileCount={contextManagerRef.current.getFileCount()}
        />
      </Box>
    </Box>
  );
}