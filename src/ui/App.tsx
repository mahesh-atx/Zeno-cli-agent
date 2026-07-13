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
import { formatTokenCount } from "../utils/tokens";
import { ContextManager } from "../core/context";
import { QuestionPrompt } from "./QuestionPrompt";
import { themeManager } from "../themes/theme-manager";
import type { AgentEvent, RateLimitEvent, NetworkEvent } from "../errors/base";
import { 
  isAuthEvent, 
  isNetworkEvent, 
  isRateLimitEvent,
  isAgentPausedEvent,
  isAgentTurnEndEvent 
} from "../errors/base";
import { useTerminalWidth } from "./hooks/useTerminalWidth";
import {
  isSlashCommand,
  dispatchCommand,
  type CommandContext,
} from "../commands";
import { TOKEN_LIMITS } from "../providers/registry";
import { parseAtMentions } from "../utils/atMention";

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
 * AND is outside any open code fence. Optimized to avoid O(n^2) on large buffers.
 */
function findFlushBoundary(buf: string): number {
  // Quick exit: no paragraph break at all
  if (!buf.includes(PARAGRAPH_BREAK)) return 0;
  // Only look at last 4000 chars for break to avoid scanning huge buffer repeatedly
  // But we still need fence state from start up to break, so count fences efficiently
  const breakIdx = buf.lastIndexOf(PARAGRAPH_BREAK);
  if (breakIdx < 0) return 0;

  // Efficient fence count: count occurrences of ``` or ~~~ at line starts up to break
  const upto = buf.slice(0, breakIdx);
  const fenceMatches = upto.match(/^\s{0,3}(```|~~~)/gm);
  const fenceCount = fenceMatches ? fenceMatches.length : 0;
  if (fenceCount % 2 === 1) return 0; // inside unclosed fence

  return breakIdx + PARAGRAPH_BREAK.length;
}

// Hard-cap fallback: optimized to avoid full split every token
function findHardCapBoundary(buf: string): number {
  if (buf.length <= MAX_LIVE_CHARS) return -1;

  // Scan lines but track fence state; we want last safe newline outside fence
  // Use regex to iterate lines without splitting entire huge string twice
  let inFence = false;
  let lastSafePos = -1;
  let pos = 0;

  // Iterate via line boundaries using indexOf
  const lines = buf.split("\n");
  // But split is still O(n); we limit to first pass that is bounded
  // For very large buffers (>10k), we cap scan to last MAX_LIVE_CHARS*2 region for performance
  // and compute fence state for prefix separately

  // Fast path: if buffer is huge (>5000), compute fence state for prefix up to length - MAX_LIVE_CHARS
  // then scan only tail
  if (buf.length > 5000) {
    const prefix = buf.slice(0, buf.length - MAX_LIVE_CHARS * 2);
    const prefixFences = prefix.match(/^\s{0,3}(```|~~~)/gm);
    inFence = (prefixFences ? prefixFences.length : 0) % 2 === 1;
    // Scan only tail
    const tail = buf.slice(buf.length - MAX_LIVE_CHARS * 2);
    const tailLines = tail.split("\n");
    let tailPos = buf.length - tail.length;
    for (let i = 0; i < tailLines.length; i++) {
      const line = tailLines[i];
      const startsFence = /^\s{0,3}(```|~~~)/.test(line);
      if (!inFence) {
        lastSafePos = tailPos + line.length + (i < tailLines.length - 1 ? 1 : 0);
      }
      if (startsFence) inFence = !inFence;
      tailPos += line.length + 1;
    }
    // If no safe pos in tail but we are outside fence somewhere, allow hard cut at MAX_LIVE_CHARS
    if (lastSafePos === -1 && !inFence) {
      return MAX_LIVE_CHARS;
    }
    // If entirely inside fence in tail, still force cut to avoid unbounded growth (P1 fix)
    if (lastSafePos === -1 && inFence && buf.length > MAX_LIVE_CHARS * 3) {
      return MAX_LIVE_CHARS;
    }
    return lastSafePos > 0 ? lastSafePos : -1;
  }

  // Normal path for moderate buffers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const startsFence = /^\s{0,3}(```|~~~)/.test(line);
    if (!inFence) {
      lastSafePos = pos + line.length + (i < lines.length - 1 ? 1 : 0);
    }
    if (startsFence) inFence = !inFence;
    pos += line.length + 1;
  }

  // If entirely inside fence and buffer huge, force cut to avoid O(n^2) growth
  if (lastSafePos === -1 && buf.length > MAX_LIVE_CHARS * 2) {
    return MAX_LIVE_CHARS;
  }

  return lastSafePos;
}

export function App() {
  const { exit } = useApp();

  const [completedMessages, setCompletedMessages] = useState<ChatMessage[]>([]);

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
  const [currentThemeName, setCurrentThemeName] = useState<string>(themeManager.getActiveTheme().name);
  const [tokenCount, setTokenCount] = useState(0);
  const [pendingPermission, setPendingPermission] =
    useState<PendingPermission | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<{ 
    question: string; 
    options?: string[] 
  } | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  type AgentStatus =
    | "idle"
    | "running"
    | "retrying"
    | "rate_limited"
    | "network_dropped"
    | "fatal_error";

  const [agentStatus, setAgentStatus] = useState<AgentStatus>("idle");
  const [rateLimitMs, setRateLimitMs] = useState<number | null>(null);
  const [networkDropped, setNetworkDropped] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const retryPressedRef = useRef(false);
  const retrySignal = {
    shouldRetry: () => retryPressedRef.current,
    reset: () => { retryPressedRef.current = false; },
  };
  const conversationRef = useRef(new Conversation());
  const contextManagerRef = useRef(new ContextManager(config.defaultProvider));
  const handleSubmitRef = useRef<(input: string) => Promise<void>>(async () => {});
  const lastUserInputRef = useRef<string | null>(null);
  const currentProviderRef = useRef(currentProvider);
  const currentModelRef = useRef(currentModel);
  currentProviderRef.current = currentProvider;
  currentModelRef.current = currentModel;

  const streamBufferRef = useRef<string>("");
  const fullResponseRef = useRef<string>("");
  const lastUpdateRef = useRef<number>(0);
  const pendingUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const activeToolCallsRef = useRef(new Map<string, ToolCall>());
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

  const pushError = useCallback(
    (content: string) => {
      pushCompleted({ id: nextId(), role: "error", content });
    },
    [pushCompleted]
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleThemeConfirm = useCallback(
    (themeName: string) => {
      themeManager.commitPreview();
      setCurrentThemeName(themeName);
      pushCompleted({ id: nextId(), role: "user", content: `/theme ${themeName}` });
      pushNotice(`└ Set theme to "${themeName}"`);
    },
    [pushCompleted, pushNotice]
  );

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

  const flushParagraphs = useCallback(() => {
    let buf = streamBufferRef.current;
    let didFlush = false;

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

  const handleSlashCommand = useCallback(
    async (input: string): Promise<boolean> => {
      if (!isSlashCommand(input)) return false;

      pushCompleted({ id: nextId(), role: "user", content: input });

      const ctx: CommandContext = {
        currentProvider: currentProviderRef.current,
        currentModel: currentModelRef.current,
        conversation: conversationRef.current,
        contextManager: contextManagerRef.current,
        setProvider: (p) => {
          setCurrentProvider(p);
          currentProviderRef.current = p;
        },
        setModel: (m) => {
          setCurrentModel(m);
          currentModelRef.current = m;
        },
        setTokenCount,
        pushCompleted,
        pushNotice,
        pushError,
        clearConversation: () => {
          conversationRef.current.clear();
          setCompletedMessages([]);
          lastUserInputRef.current = null;
        },
        getLastUserInput: () => {
          if (lastUserInputRef.current) return lastUserInputRef.current;
          const last = conversationRef.current.getLastUserMessage();
          if (!last) return null;
          return typeof last.content === "string" ? last.content : null;
        },
        triggerRetry: async (retryInput: string) => {
          const history = conversationRef.current.getHistory();
          if (history.length > 0 && history[history.length - 1].role === "user") {
            conversationRef.current.removeLastMessage();
          }
          await handleSubmitRef.current(retryInput);
        },
        exitApp: () => {
          setTimeout(() => exit(), 200);
        },
      };

      await dispatchCommand(input, ctx);
      return true;
    },
    [pushCompleted, pushNotice, pushError, exit]
  );

  const handleSubmit = useCallback(
    async (userInput: string) => {
      const trimmed = userInput.trim();
      if (!trimmed || isLoading) return;
      if (await handleSlashCommand(trimmed)) return;

      lastUserInputRef.current = trimmed;
      pushCompleted({ id: nextId(), role: "user", content: trimmed });

      // Auto-add @mentioned files to context — uses unified atMention parser (now active, not dead code)
      // parseAtMentions handles trailing punctuation stripping, binary detection, token limits
      const mentionResult = parseAtMentions(trimmed);
      const mentionNotices: string[] = [];

      if (mentionResult.errors.length > 0) {
        // Show errors as notices but don't block
        mentionNotices.push(...mentionResult.errors.map(e => `⚠ ${e}`));
      }

      for (const att of mentionResult.attachments) {
        if (!contextManagerRef.current.hasFile(att.filePath)) {
          const result = contextManagerRef.current.addFile(att.filePath, "mention");
          if (result.success) {
            mentionNotices.push(
              `Added to context: ${att.filePath} (${formatTokenCount(result.tokens ?? 0)} tokens)`
            );
          } else {
            mentionNotices.push(`⚠ ${att.filePath}: ${result.error}`);
          }
        }
      }

      if (mentionNotices.length > 0) {
        pushNotice(mentionNotices.join("\n"));
      }

      conversationRef.current.addUserMessage(trimmed);

      setIsLoading(true);

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
            // P1 optimization: only attempt paragraph flush when token contains newline or buffer is large
            // Avoids O(n^2) scanning on every single token for large code blocks
            if (token.includes("\n") || streamBufferRef.current.length > MAX_LIVE_CHARS) {
              flushParagraphs();
            }
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
              if (toolName === "run_command") {
                stdout = r.stdout as string | undefined;
                stderr = r.stderr as string | undefined;
              } else if (toolName === "edit_file" || toolName === "apply_patch" || toolName === "write_file") {
                stdout = r.preview as string | undefined;
              }
              resultSummary = getToolResultSummary(toolName, result);
            }

            const hunks = r.hunks as import("diff").StructuredPatchHunk[] | undefined;

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
              hunks,
              rawResult: result,
              isExpanded: expandedTools.has(targetId),
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

          onAgentEvent: (event: AgentEvent) => {
            if (event.kind === "server_error" || event.kind === "network_error") {
              pushNotice(`⚠ ${event.message}`);
            }

            if (isAgentPausedEvent(event)) {
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
      pushNotice,
      currentProvider,
      currentModel,
      requestPermission,
      flushParagraphs,
      flushAll,
      scheduleLiveUpdate,
    ]
  );

  handleSubmitRef.current = handleSubmit;

  const handleQuestionAnswer = useCallback((answer: string) => {
    setPendingQuestion(null);
    handleSubmit(answer);
  }, [handleSubmit]);

  const handleQuestionCancel = useCallback(() => {
    setPendingQuestion(null);
    setIsLoading(false);
    pushNotice("Question cancelled. Type a message to continue.");
  }, [pushNotice]);

  // Ctrl+C always active, R retry only when network dropped — separate concerns
  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") process.exit(0);
    },
    { isActive: true }
  );

  useInput(
    (input) => {
      if ((input === "r" || input === "R") && networkDropped) {
        retryPressedRef.current = true;
        setNetworkDropped(false);
        setAgentStatus("retrying");
        pushNotice("Retrying connection...");
      }
    },
    { isActive: networkDropped }
  );

  // Ctrl+R to expand/collapse last read_many_files
  useInput(
    (input, key) => {
      if (key.ctrl && input.toLowerCase() === "r") {
        // Find last read_many_files tool in history
        for (let i = completedMessages.length - 1; i >= 0; i--) {
          const msg = completedMessages[i];
          if (msg.toolCalls) {
            for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
              const tc = msg.toolCalls[j];
              if (tc.toolName === "read_many_files") {
                toggleExpand(tc.id);
                return;
              }
            }
          }
        }
        // Also check live preview active tool
        if (livePreview.activeTool && livePreview.activeTool.toolName === "read_many_files") {
          toggleExpand(livePreview.activeTool.id);
        }
      }
    },
    { isActive: true }
  );

  const initialProvider = useRef(currentProvider);
  const initialModel = useRef(currentModel);

  const staticItems = useMemo(
    () => {
      if (completedMessages.length === 0) return [];
      return [
        { kind: "welcome" as const },
        ...completedMessages.map((msg) => ({ kind: "message" as const, msg })),
      ];
    },
    [completedMessages, expandedTools]
  );

  const showLive =
    isLoading && (livePreview.text.length > 0 || livePreview.activeTool);

  const termWidth = useTerminalWidth(1000);

  return (
    <Box flexDirection="column">
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
          return <MessageItem key={item.msg.id} message={item.msg} expandedToolIds={expandedTools} onToggleExpand={toggleExpand} />;
        }}
      </Static>

      <Box flexDirection="column" width={Math.max(termWidth - 2, 20)}>
        {completedMessages.length === 0 && (
          <WelcomeBanner
            provider={currentProvider}
            model={currentModel}
          />
        )}

        {showLive && (
          <LivePreview
            text={livePreview.text}
            activeTool={livePreview.activeTool}
            hideIcon={livePreview.hideIcon}
          />
        )}

        {isLoading && !showLive && (
          <LivePreview text="" activeTool={null} thinkingOnly />
        )}

        <Box marginTop={1} flexDirection="column">
          <InputBar
            onSubmit={handleSubmit}
            isDisabled={isLoading || pendingPermission !== null || pendingQuestion !== null || agentStatus === "retrying" || agentStatus === "rate_limited"}
            placeholder={
              pendingQuestion 
                ? "Waiting for question response..." 
                : pendingPermission
                  ? "Waiting for permission response..."
                  : 'Try "read package.json" or @src/index.ts'
            }
              networkDropped={networkDropped}
              currentProviderId={currentProvider}
              currentModelId={currentModel}
              currentThemeName={themeManager.getActiveTheme().name}
              contextSummary={contextManagerRef.current.getSummary(conversationRef.current.getHistoryTokens())}
              onProviderConfirm={(provider) => {
                setCurrentProvider(provider);
                contextManagerRef.current.setProvider(provider);
                pushNotice(`Switched provider to ${provider}`);
              }}
              onModelConfirm={(model) => {
                setCurrentModel(model);
                pushNotice(`Switched model to ${model}`);
              }}
              onThemePreview={setCurrentThemeName}
              onThemeConfirm={handleThemeConfirm}
              onRemoveFile={(filePath) => {
                contextManagerRef.current.removeFile(filePath);
                setTokenCount((prev) => prev + 1 - 1); 
              }}
              onMenuStateChange={setIsMenuOpen}
            />

            {pendingPermission && (
              <Box marginX={0} marginTop={1}>
                <PermissionPrompt permission={pendingPermission} />
              </Box>
            )}

            {pendingQuestion && (
              <Box marginX={0} marginTop={1}>
                <QuestionPrompt
                  question={pendingQuestion.question}
                  options={pendingQuestion.options}
                  onSubmit={handleQuestionAnswer}
                  onCancel={handleQuestionCancel}
                />
              </Box>
            )}
          </Box>

        {!isMenuOpen && (
          <StatusLine
            provider={currentProvider}
            model={currentModel}
            tokenCount={tokenCount}
            tokenLimit={TOKEN_LIMITS[currentProvider]}
            contextFileCount={contextManagerRef.current.getFileCount()}
            agentStatus={agentStatus}
            rateLimitMs={rateLimitMs}
            retryAttempt={retryAttempt}
            networkDropped={networkDropped}
          />
        )}
      </Box>
    </Box>
  );
}
