import * as fs from "fs";
import * as path from "path";
import type { ProviderName } from "../core/config";
import type { Conversation } from "../core/conversation";
import type { ContextManager } from "../core/context";
import type { ChatMessage } from "../ui/MessageItem";
import { PROVIDER_MODELS } from "../providers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommandContext {
  currentProvider: ProviderName;
  currentModel: string;
  conversation: Conversation;
  contextManager: ContextManager;
  setProvider: (p: ProviderName) => void;
  setModel: (m: string) => void;
  setTokenCount: (n: number) => void;
  pushCompleted: (msg: ChatMessage) => void;
  pushNotice: (content: string) => void;
  pushError: (content: string) => void;
  clearConversation: () => void;
  getLastUserInput: () => string | null;
  triggerRetry: (input: string) => Promise<void>;
  exitApp: () => void;
}

export interface CommandResult {
  handled: true;
  retryInput?: string;
  notice?: string;
}

export type CommandHandler = (
  args: string[],
  ctx: CommandContext
) => Promise<CommandResult> | CommandResult;

// What the InputBar's menu shows
export interface CommandMeta {
  name: string;          // "/help"
  description: string;   // shown in menu
  usage?: string;        // optional argument hint
  aliases?: string[];    // e.g. ["/h"]
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

const handleHelp: CommandHandler = (_args, ctx) => {
  const lines = [
    "Commands:",
    ...COMMANDS.map((c) => {
      const label = c.usage ? `${c.name} ${c.usage}` : c.name;
      return `  ${label.padEnd(22)}  ${c.description}`;
    }),
    "",
    "Tips:",
    "  @filename       Auto-attach a file in your message",
    "  --yes / -y      Auto-approve all permissions (CLI flag)",
    "  ↑ / ↓           Navigate command menu while typing /",
    "  Tab / Enter     Accept selected command",
    "  Esc             Close command menu",
  ];
  ctx.pushNotice(lines.join("\n"));
  return { handled: true };
};

const handleModel: CommandHandler = (args, ctx) => {
  const modelArg = args[0];

  if (!modelArg) {
    const lines: string[] = [
      `Current: ${ctx.currentProvider} / ${ctx.currentModel}`,
      "",
    ];
    for (const [providerName, models] of Object.entries(PROVIDER_MODELS)) {
      lines.push(`  [${providerName}]`);
      models.forEach((m) => {
        const isCurrent =
          providerName === ctx.currentProvider && m === ctx.currentModel;
        lines.push(`    ${isCurrent ? "→ " : "  "}${m}`);
      });
      lines.push("");
    }
    ctx.pushNotice(lines.join("\n"));
    return { handled: true };
  }

  const allModels = Object.entries(PROVIDER_MODELS).flatMap(([p, ms]) =>
    ms.map((m) => ({ provider: p as ProviderName, model: m }))
  );
  const match = allModels.find((e) => e.model === modelArg);

  if (match) {
    ctx.setProvider(match.provider);
    ctx.setModel(match.model);
    ctx.contextManager.setProvider(match.provider);
    ctx.pushNotice(`Switched to ${match.model} (${match.provider})`);
  } else {
    ctx.setModel(modelArg);
    ctx.pushNotice(
      `Switched to model: ${modelArg} on ${ctx.currentProvider}\nNote: not in known model list — may or may not work.`
    );
  }
  return { handled: true };
};

const handleClear: CommandHandler = (_args, ctx) => {
  console.clear();
  ctx.clearConversation();
  ctx.contextManager.clearFiles();
  ctx.setTokenCount(0);
  ctx.pushNotice(
    "Conversation cleared. Context files removed. Token count reset to 0."
  );
  return { handled: true };
};

const handleAdd: CommandHandler = (args, ctx) => {
  if (args.length === 0) {
    ctx.pushNotice(
      [
        "Usage: /add <file>",
        "Example: /add src/index.ts",
        "",
        "Adds a file to the persistent context.",
        "The file content is sent with every message.",
      ].join("\n")
    );
    return { handled: true };
  }

  const filePath = args.join(" ");
  const result = ctx.contextManager.addFile(filePath);

  if (!result.success) {
    ctx.pushError(`/add failed: ${result.error}`);
    return { handled: true };
  }

  const newTotal = ctx.contextManager.getSummary(
    ctx.conversation.getTotalTokens()
  );
  ctx.setTokenCount(newTotal.used);

  ctx.pushNotice(
    [
      `Added ${filePath}`,
      `  ${result.lines?.toLocaleString()} lines · ~${result.tokens?.toLocaleString()} tokens`,
      `  Context: ${newTotal.used.toLocaleString()} / ${newTotal.total.toLocaleString()} tokens (${newTotal.percent.toFixed(1)}%)`,
    ].join("\n")
  );
  return { handled: true };
};

const handleRemove: CommandHandler = (args, ctx) => {
  if (args.length === 0) {
    const files = ctx.contextManager.getFiles();
    if (files.length === 0) {
      ctx.pushNotice("No context files to remove.");
      return { handled: true };
    }
    const lines = ["Context files:", ...files.map((f) => `  ${f.filePath}`)];
    lines.push("", "Usage: /remove <file>");
    ctx.pushNotice(lines.join("\n"));
    return { handled: true };
  }

  const filePath = args.join(" ");
  const removed = ctx.contextManager.removeFile(filePath);
  if (!removed) {
    ctx.pushError(`File not in context: ${filePath}`);
    return { handled: true };
  }

  const summary = ctx.contextManager.getSummary(
    ctx.conversation.getTotalTokens()
  );
  ctx.setTokenCount(summary.used);
  ctx.pushNotice(`Removed ${filePath} from context.`);
  return { handled: true };
};

const handleFiles: CommandHandler = (_args, ctx) => {
  const files = ctx.contextManager.getFiles();
  if (files.length === 0) {
    ctx.pushNotice("No files in context. Use /add <file> to add one.");
    return { handled: true };
  }

  const lines = [`Context files (${files.length}):`];
  for (const f of files) {
    lines.push(
      `  ${f.filePath}  ·  ~${f.tokens.toLocaleString()} tokens`
    );
  }
  ctx.pushNotice(lines.join("\n"));
  return { handled: true };
};

const handleTokens: CommandHandler = (_args, ctx) => {
  const summary = ctx.contextManager.getSummary(
    ctx.conversation.getTotalTokens()
  );
  const lines = [
    `Tokens used: ${summary.used.toLocaleString()} / ${summary.total.toLocaleString()} (${summary.percent.toFixed(1)}%)`,
  ];
  if (summary.fileCount > 0) {
    lines.push(`Context files (${summary.fileCount}):`);
    summary.files.forEach((f) => lines.push(`  ${f}`));
  }
  ctx.pushNotice(lines.join("\n"));
  return { handled: true };
};

const handleRetry: CommandHandler = async (_args, ctx) => {
  const lastInput = ctx.getLastUserInput();
  if (!lastInput) {
    ctx.pushNotice("Nothing to retry — no previous message found.");
    return { handled: true };
  }
  ctx.conversation.removeLastExchange();
  ctx.pushNotice(`Retrying: "${lastInput}"`);
  await ctx.triggerRetry(lastInput);
  return { handled: true };
};

const handleStatus: CommandHandler = (_args, ctx) => {
  const summary = ctx.contextManager.getSummary(
    ctx.conversation.getTotalTokens()
  );
  const lines = [
    "Status:",
    `  Provider:  ${ctx.currentProvider}`,
    `  Model:     ${ctx.currentModel}`,
    `  CWD:       ${process.cwd()}`,
    `  Tokens:    ${summary.used.toLocaleString()} / ${summary.total.toLocaleString()} (${summary.percent.toFixed(1)}%)`,
    `  Files:     ${summary.fileCount}`,
    `  Messages:  ${ctx.conversation.getMessages().length}`,
  ];
  ctx.pushNotice(lines.join("\n"));
  return { handled: true };
};

const handleSave: CommandHandler = (args, ctx) => {
  const filePath = args[0] || ".cli-agent/session.md";
  const resolved = path.resolve(process.cwd(), filePath);
  try {
    const messages = ctx.conversation.getHistory();
    const lines: string[] = [
      `# Zeno Session Export`,
      `Date: ${new Date().toISOString()}`,
      `Provider: ${ctx.currentProvider} / ${ctx.currentModel}`,
      `---`,
      "",
    ];
    for (const msg of messages) {
      const role = msg.role.toUpperCase();
      let content = "";
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "text") content += part.text + "\n";
          if (part.type === "tool-call") content += `\n[Tool Call: ${part.toolName} ${JSON.stringify(part.args)}]\n`;
          if (part.type === "tool-result") content += `\n[Tool Result: ${JSON.stringify(part.result).slice(0, 500)}]\n`;
        }
      }
      lines.push(`## ${role}`, content, "");
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, lines.join("\n"), "utf-8");
    ctx.pushNotice(`Session saved to ${filePath} (${messages.length} messages)`);
  } catch (e: any) {
    ctx.pushError(`Failed to save: ${e.message}`);
  }
  return { handled: true };
};

const handleResume: CommandHandler = (args, ctx) => {
  const filePath = args[0] || ".cli-agent/session.json";
  const resolved = path.resolve(process.cwd(), filePath);
  try {
    if (!fs.existsSync(resolved)) {
      ctx.pushError(`No session file at ${filePath}. Use /save first.`);
      return { handled: true };
    }
    const raw = fs.readFileSync(resolved, "utf-8");
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      ctx.pushError(`Session file is not valid JSON: ${filePath}. Try markdown export?`);
      return { handled: true };
    }

    const messages = data.messages || data.history || [];
    if (!Array.isArray(messages) || messages.length === 0) {
      ctx.pushError(`Session file empty or invalid: ${filePath}`);
      return { handled: true };
    }

    ctx.conversation.clear();
    for (const msg of messages) {
      if (msg.role && msg.content) {
        ctx.conversation.addMessage(msg);
      }
    }

    const summary = ctx.contextManager.getSummary(ctx.conversation.getHistoryTokens());
    ctx.setTokenCount(summary.used);
    ctx.pushNotice(`Resumed session from ${filePath} (${messages.length} messages, ${summary.used.toLocaleString()} tokens)`);

    // Push a visual notice of resumed messages
    for (const msg of messages.slice(-6)) {
      if (msg.role === "user" && typeof msg.content === "string") {
        ctx.pushCompleted({ id: `resume-${Date.now()}-${Math.random()}`, role: "user", content: msg.content });
      } else if (msg.role === "assistant" && typeof msg.content === "string") {
        ctx.pushCompleted({ id: `resume-${Date.now()}-${Math.random()}`, role: "assistant", content: msg.content.slice(0, 500) });
      }
    }
  } catch (e: any) {
    ctx.pushError(`Failed to resume: ${e.message}`);
  }
  return { handled: true };
};

const handleCompact: CommandHandler = (_args, ctx) => {
  const history = ctx.conversation.getHistory();
  if (history.length <= 7) {
    ctx.pushNotice("Nothing to compact — history is small.");
    return { handled: true };
  }

  // Save current session as backup before compacting
  try {
    const backupPath = path.resolve(process.cwd(), `.cli-agent/session-backup-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, JSON.stringify({ messages: history, timestamp: new Date().toISOString() }, null, 2), "utf-8");
    ctx.pushNotice(`Backup saved to ${path.relative(process.cwd(), backupPath)}`);
  } catch {
    // ignore backup failure
  }

  const summary = ctx.contextManager.getSummary(ctx.conversation.getHistoryTokens());
  if (summary.percent < 70) {
    ctx.pushNotice(`Context at ${summary.percent.toFixed(0)}% — no need to compact yet.`);
    return { handled: true };
  }

  // Use contextManager's truncateHistory but more aggressive: keep last 5 pairs
  const allMessages = ctx.conversation.getMessages();
  const truncated = ctx.contextManager.truncateHistory(allMessages);
  
  if (truncated.removedCount > 0) {
    ctx.conversation.applyTruncatedHistory(truncated.truncated);
    const newSummary = ctx.contextManager.getSummary(ctx.conversation.getHistoryTokens());
    ctx.setTokenCount(newSummary.used);
    ctx.pushNotice(
      `Compacted history: removed ${truncated.removedCount} messages, saved ~${truncated.tokensSaved.toLocaleString()} tokens. ` +
      `Now ${newSummary.used.toLocaleString()} / ${newSummary.total.toLocaleString()} (${newSummary.percent.toFixed(1)}%)`
    );
  } else {
    ctx.pushNotice("Could not compact further — at minimum retention.");
  }

  return { handled: true };
};

const handleExport: CommandHandler = (args, ctx) => {
  // Alias for /save but JSON format for resume
  const filePath = args[0] || ".cli-agent/session.json";
  const resolved = path.resolve(process.cwd(), filePath);
  try {
    const history = ctx.conversation.getHistory();
    const data = {
      version: 1,
      provider: ctx.currentProvider,
      model: ctx.currentModel,
      timestamp: new Date().toISOString(),
      cwd: process.cwd(),
      messages: history,
      contextFiles: ctx.contextManager.getFiles().map(f => f.filePath),
    };
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(data, null, 2), "utf-8");
    ctx.pushNotice(`Session exported to ${filePath} (${history.length} messages) — use /resume to restore`);
  } catch (e: any) {
    ctx.pushError(`Export failed: ${e.message}`);
  }
  return { handled: true };
};

const handleExit: CommandHandler = (_args, ctx) => {
  // Auto-save session on exit (P2)
  try {
    const sessionPath = path.resolve(process.cwd(), ".cli-agent/session.json");
    const history = ctx.conversation.getHistory();
    if (history.length > 0) {
      const data = {
        version: 1,
        provider: ctx.currentProvider,
        model: ctx.currentModel,
        timestamp: new Date().toISOString(),
        messages: history,
      };
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2), "utf-8");
    }
  } catch {
    // ignore auto-save failure
  }
  ctx.pushNotice("Goodbye. Session auto-saved to .cli-agent/session.json (use /resume to restore).");
  setTimeout(() => ctx.exitApp(), 200);
  return { handled: true };
};

// ─── Registry ─────────────────────────────────────────────────────────────────
// Single source of truth for both dispatcher AND menu

export const COMMANDS: Array<CommandMeta & { handler: CommandHandler }> = [
  {
    name: "/help",
    description: "Show all commands",
    aliases: ["/?"],
    handler: handleHelp,
  },
  {
    name: "/model",
    description: "Show or change current model",
    handler: handleModel,
  },
  {
    name: "/provider",
    description: "Switch AI provider (NIM, OpenRouter)",
    handler: () => ({ handled: true }), // Intercepted by InputBar UI
  },
  {
    name: "/theme",
    description: "Switch UI theme (live preview)",
    handler: () => ({ handled: true }), // Intercepted by InputBar UI
  },
  {
    name: "/add",
    description: "Add a file to context window",
    usage: "<path>",
    aliases: [],
    handler: handleAdd,
  },
  {
    name: "/remove",
    description: "Remove a file from context window",
    usage: "<path>",
    aliases: [],
    handler: handleRemove,
  },
  {
    name: "/context",
    description: "Show context window summary",
    aliases: ["/files"],
    handler: handleFiles,
  },
  {
    name: "/tokens",
    description: "Show token usage",
    handler: handleTokens,
  },
  {
    name: "/status",
    description: "Show full session status",
    handler: handleStatus,
  },
  {
    name: "/retry",
    description: "Regenerate the last response",
    handler: handleRetry,
  },
  {
    name: "/save",
    description: "Save conversation to markdown file",
    usage: "[file]",
    handler: handleSave,
  },
  {
    name: "/export",
    description: "Export session to JSON for /resume",
    usage: "[file]",
    handler: handleExport,
  },
  {
    name: "/resume",
    description: "Resume conversation from JSON file",
    usage: "[file]",
    handler: handleResume,
  },
  {
    name: "/compact",
    description: "Compact history to save tokens (keeps last pairs)",
    handler: handleCompact,
  },
  {
    name: "/clear",
    description: "Clear conversation + context",
    handler: handleClear,
  },
  {
    name: "/exit",
    description: "Quit the agent (auto-saves session)",
    aliases: ["/quit", "/q"],
    handler: handleExit,
  },
];

// Public metadata-only list for the menu
export const COMMAND_META: CommandMeta[] = COMMANDS.map(
  ({ name, description, usage, aliases }) => ({
    name,
    description,
    usage,
    aliases,
  })
);

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith("/");
}

export async function dispatchCommand(
  input: string,
  ctx: CommandContext
): Promise<CommandResult> {
  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);

  const cmd = COMMANDS.find(
    (c) =>
      c.name === commandName ||
      (c.aliases && c.aliases.includes(commandName))
  );

  if (!cmd) {
    ctx.pushNotice(
      `Unknown command: ${commandName}. Type /help for the list.`
    );
    return { handled: true };
  }

  return await cmd.handler(args, ctx);
}