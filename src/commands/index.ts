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
      const usage = c.usage ? ` ${c.usage}` : "";
      return `  ${c.name}${usage.padEnd(20 - c.name.length)}  ${c.description}`;
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

const handleExit: CommandHandler = (_args, ctx) => {
  ctx.pushNotice("Goodbye.");
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
    description: "Switch model or list available",
    usage: "[name]",
    handler: handleModel,
  },
  {
    name: "/add",
    description: "Add a file to persistent context",
    usage: "<file>",
    handler: handleAdd,
  },
  {
    name: "/remove",
    description: "Remove a file from context",
    usage: "<file>",
    handler: handleRemove,
  },
  {
    name: "/files",
    description: "List files currently in context",
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
    name: "/clear",
    description: "Clear conversation + context",
    handler: handleClear,
  },
  {
    name: "/exit",
    description: "Quit the agent",
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