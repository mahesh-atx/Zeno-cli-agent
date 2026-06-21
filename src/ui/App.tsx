import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
import { runAgent, getToolResultSummary } from "../core/agent";
import { PROVIDER_MODELS } from "../providers";
import { formatTokenCount } from "../utils/tokens";
import { ContextManager } from "../core/context";
import { QuestionPrompt } from "./QuestionPrompt";
import type { AgentEvent, RateLimitEvent, NetworkEvent } from "../errors/base";
import { 
  isAuthEvent, 
  isNetworkEvent, 
  isRateLimitEvent,
  isAgentPausedEvent,
  isAgentTurnEndEvent 
} from "../errors/base";
import { useTerminalWidth } from "./hooks/useTerminalWidth";

const TOKEN_LIMITS: Record<ProviderName, number> = {
  openrouter: 128000,
  groq: 32768,
  nvidia: 128000,
  opencodezen: 128000,
};

let idCounter = 0;
const nextId = () => `msg-${++idCounter}`;
const nextToolId = () => `tool-${++idCounter}`;

// Flush a streamed paragraph to <Static> when we see this sequence.
const PARAGRAPH_BREAK = "\n\n";

// Hard cap so a never-ending paragraph doesn't grow the live region unbounded.
// When buffer exceeds this, we flush at the last newline (or hard cut).
const MAX_LIVE_CHARS = 1200;

// Throttle live state updates so we don't re-render every single token
// on fast streams. 60ms ≈ ~16fps, smooth and easy on the terminal.
const LIVE_UPDATE_MS = 60;

/**
 * Find the longest flushable prefix of `buf` that ends at a paragraph break
 * AND is outside any open code fence (``` ... ```). Flushing inside a code
 * block would split it mid-fence and break markdown rendering of the first
 * chunk (an unclosed fence leaks styling into the prose that follows).
 *
 * Returns the number of characters safe to flush (0 = keep buffering).
 */
function findFlushBoundary(buf: string): number {
  const breakIdx = buf.lastIndexOf(PARAGRAPH_BREAK);
  if (breakIdx < 0) return 0;
  // Walk line-by-line up to the break; track open fence state.
  const upto = buf.slice(0, breakIdx);
  const lines = upto.split("\n");
  let inFence = false;
  for (const line of lines) {
    if (/^\s{0,3}(```|~~~)/.test(line)) inFence = !inFence;
  }
  if (inFence) return 0; // still inside an unclosed code block
  return breakIdx + PARAGRAPH_BREAK.length;
}

// Hard-cap fallback: flush at the last newline that is *outside* a code fence
// so we never split a fenced block mid-stream.
function findHardCapBoundary(buf: string): number {
  let inFence = false;
  let safe = -1;
  const lines = buf.split("\n");
  let consumed = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLen = line.length + (i < lines.length - 1 ? 1 : 0);
    const startsFence = /^\s{0,3}(```|~~~)/.test(line);
    // A position is safe to cut at the END of a line only when we are NOT
    // currently inside a fence (cutting right at the closing fence is fine
    // because inFence flips to false after processing it).
    if (!inFence) safe = consumed + lineLen;
    if (startsFence) inFence = !inFence;
    consumed += lineLen;
  }
  return safe; // -1 if nowhere safe (entirely inside a fence)
}

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
  const [pendingQuestion, setPendingQuestion] = useState<{ 
    question: string; 
    options?: string[] 
  } | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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

    // Flush every complete paragraph (\n\n) — but never inside a code fence.
    let cut = findFlushBoundary(buf);
    while (cut > 0) {
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
      cut = findFlushBoundary(buf);
    }

    // Hard cap: if buffer is too long even without a paragraph break, flush
    // at the last newline that is outside any code fence (or hold off if the
    // whole buffer is one big fenced block).
    if (buf.length > MAX_LIVE_CHARS) {
      const safe = findHardCapBoundary(buf);
      if (safe > 0) {
        const chunk = buf.slice(0, safe);
        buf = buf.slice(safe);
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
            // Communication tools return instantly — skip LivePreview to
            // avoid a flashing "Running ask_question" / "Running send_message"
            if (toolName === "ask_question" || toolName === "send_message") {
              return;
            }
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
              // run_command still needs stdout/stderr extracted for display
              if (toolName === "run_command") {
                stdout = r.stdout as string | undefined;
                stderr = r.stderr as string | undefined;
              }
              resultSummary = getToolResultSummary(toolName, result);
            }

            // send_message with a real message → render as a notice
            // instead of a raw tool call row, so the user sees the
            // actual message content styled properly
            if (toolName === "send_message" && "success" in r && r.success) {
              const uiMsg = r.ui_message as {
                title?: string;
                content: string;
                type: string;
              } | undefined;

              if (uiMsg?.content) {
                const icon =
                  uiMsg.type === "error"   ? "✖" :
                  uiMsg.type === "warning" ? "⚠" :
                  uiMsg.type === "success" ? "✔" : "ℹ";

                const lines: string[] = [];
                if (uiMsg.title) lines.push(`${icon} ${uiMsg.title}`);
                lines.push(uiMsg.title ? `  ${uiMsg.content}` : `${icon} ${uiMsg.content}`);

                pushCompleted({
                  id: nextId(),
                  role: "system-notice",
                  content: lines.join("\n"),
                });
                isFirstChunkRef.current = false;
                activeToolCallsRef.current.delete(targetId);
                if (currentToolIdRef.current === targetId) {
                  currentToolIdRef.current = null;
                }
                setLivePreview({ text: "", activeTool: null });
                return;
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

            if (isAgentPausedEvent(event)) {
              // Stop the loading spinner and show the question UI
              setIsLoading(false); 
              setPendingQuestion({
                question: event.question,
                options: event.options,
              });
              return;
            }

            if (isAgentTurnEndEvent(event)) {
              setIsLoading(false);
              return;
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

  // ─── Question Handlers ─────────────────────────────────────────────────────

  const handleQuestionAnswer = useCallback((answer: string) => {
    setPendingQuestion(null);
    handleSubmit(answer);
  }, [handleSubmit]);

  const handleQuestionCancel = useCallback(() => {
    setPendingQuestion(null);
    setIsLoading(false);
    pushNotice("Question cancelled. Type a message to continue.");
  }, [pushNotice]);

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
  const initialProvider = useRef(currentProvider);
  const initialModel = useRef(currentModel);

  const staticItems = useMemo(
    () => [
      { kind: "welcome" as const },
      ...completedMessages.map((msg) => ({ kind: "message" as const, msg })),
    ],
    [completedMessages]
  );

  const showLive =
    isLoading && (livePreview.text.length > 0 || livePreview.activeTool);

  // We use a high max width to always track the real terminal width.
  const termWidth = useTerminalWidth(1000);

  return (
    <Box flexDirection="column">
      {/* Scroll-safe history */}
      <Static items={staticItems}>
        {(item) => {
          if (item.kind === "welcome") {
            return (
              <WelcomeBanner
                key="welcome"
                provider={initialProvider.current}
                model={initialModel.current}
              />
            );
          }
          return <MessageItem key={item.msg.id} message={item.msg} />;
        }}
      </Static>

      {/* DYNAMIC region — wrapped in a single container so Ink treats it as one unit */}
      <Box flexDirection="column" width={Math.max(termWidth - 2, 20)}>
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

        {/* Render the Question Prompt if the agent paused */}
        {pendingQuestion && (
          <Box marginX={1}>
            <QuestionPrompt
              question={pendingQuestion.question}
              options={pendingQuestion.options}
              onSubmit={handleQuestionAnswer}
              onCancel={handleQuestionCancel}
            />
          </Box>
        )}

        {/* Only show the standard InputBar if the agent is NOT asking a question */}
        {!pendingQuestion && (
          <Box marginTop={1} flexDirection="column">
            <InputBar
              onSubmit={handleSubmit}
              isDisabled={isLoading || pendingPermission !== null || agentStatus === "retrying" || agentStatus === "rate_limited"}
              placeholder={
                pendingPermission
                  ? "Waiting for permission response (y/n)..."
                  : 'Try "read package.json" or @src/index.ts'
              }
              networkDropped={networkDropped}
              currentProviderId={currentProvider}
              currentModelId={currentModel}
              onProviderConfirm={(provider) => {
                setCurrentProvider(provider);
                contextManagerRef.current.setProvider(provider);
                pushNotice(`Switched provider to ${provider}`);
              }}
              onModelConfirm={(model) => {
                setCurrentModel(model);
                pushNotice(`Switched model to ${model}`);
              }}
              onMenuStateChange={setIsMenuOpen}
            />
          </Box>
        )}

        {/* Status line — stays at the very bottom */}
        {!isMenuOpen && (
          <StatusLine
            provider={currentProvider}
            model={currentModel}
            tokenCount={tokenCount}
            tokenLimit={TOKEN_LIMITS[currentProvider]}
            contextFileCount={contextManagerRef.current.getFileCount()}
          />
        )}
      </Box>
    </Box>
  );
}