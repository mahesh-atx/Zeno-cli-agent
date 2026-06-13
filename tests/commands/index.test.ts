// src/commands/index.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isSlashCommand,
  dispatchCommand,
  COMMAND_META,
  COMMANDS,
  type CommandContext,
} from "../../src/commands/index";
import { Conversation } from "../../src/core/conversation";
import { ContextManager } from "../../src/core/context";

// ━━━ Mock Context Builder ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  const conversation = new Conversation();
  const contextManager = new ContextManager("groq");

  return {
    currentProvider: "groq",
    currentModel: "llama-3.3-70b-versatile",
    conversation,
    contextManager,
    setProvider: vi.fn(),
    setModel: vi.fn(),
    setTokenCount: vi.fn(),
    pushCompleted: vi.fn(),
    pushNotice: vi.fn(),
    pushError: vi.fn(),
    clearConversation: vi.fn(),
    getLastUserInput: vi.fn().mockReturnValue(null),
    triggerRetry: vi.fn().mockResolvedValue(undefined),
    exitApp: vi.fn(),
    ...overrides,
  };
}

// ━━━ isSlashCommand ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isSlashCommand", () => {
  it("returns true for /help", () => {
    expect(isSlashCommand("/help")).toBe(true);
  });

  it("returns true for /model groq", () => {
    expect(isSlashCommand("/model groq")).toBe(true);
  });

  it("returns false for regular text", () => {
    expect(isSlashCommand("hello world")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isSlashCommand("")).toBe(false);
  });

  it("returns true for leading whitespace then slash", () => {
    expect(isSlashCommand("  /help")).toBe(true);
  });

  it("returns false for text starting with letters", () => {
    expect(isSlashCommand("model")).toBe(false);
  });
});

// ━━━ COMMAND_META ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("COMMAND_META", () => {
  it("is a non-empty array", () => {
    expect(COMMAND_META.length).toBeGreaterThan(0);
  });

  it("every entry has name and description", () => {
    for (const cmd of COMMAND_META) {
      expect(typeof cmd.name).toBe("string");
      expect(cmd.name.startsWith("/")).toBe(true);
      expect(typeof cmd.description).toBe("string");
      expect(cmd.description.length).toBeGreaterThan(0);
    }
  });

  it("contains /help", () => {
    expect(COMMAND_META.some((c) => c.name === "/help")).toBe(true);
  });

  it("contains /model", () => {
    expect(COMMAND_META.some((c) => c.name === "/model")).toBe(true);
  });

  it("contains /add", () => {
    expect(COMMAND_META.some((c) => c.name === "/add")).toBe(true);
  });

  it("contains /remove", () => {
    expect(COMMAND_META.some((c) => c.name === "/remove")).toBe(true);
  });

  it("contains /clear", () => {
    expect(COMMAND_META.some((c) => c.name === "/clear")).toBe(true);
  });

  it("contains /tokens", () => {
    expect(COMMAND_META.some((c) => c.name === "/tokens")).toBe(true);
  });

  it("contains /exit", () => {
    expect(COMMAND_META.some((c) => c.name === "/exit")).toBe(true);
  });

  it("no duplicate names", () => {
    const names = COMMAND_META.map((c) => c.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

// ━━━ dispatchCommand — /help ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCommand /help", () => {
  it("returns handled: true", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/help", ctx);
    expect(result.handled).toBe(true);
  });

  it("calls pushNotice with content", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/help", ctx);
    expect(ctx.pushNotice).toHaveBeenCalledOnce();
  });

  it("notice contains command names", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/help", ctx);
    const notice = (ctx.pushNotice as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(notice).toContain("/help");
    expect(notice).toContain("/model");
    expect(notice).toContain("/add");
  });

  it("alias /? also works", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/?", ctx);
    expect(result.handled).toBe(true);
  });
});

// ━━━ dispatchCommand — /clear ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCommand /clear", () => {
  it("returns handled: true", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/clear", ctx);
    expect(result.handled).toBe(true);
  });

  it("calls clearConversation", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/clear", ctx);
    expect(ctx.clearConversation).toHaveBeenCalledOnce();
  });

  it("calls setTokenCount with 0", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/clear", ctx);
    expect(ctx.setTokenCount).toHaveBeenCalledWith(0);
  });

  it("calls pushNotice", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/clear", ctx);
    expect(ctx.pushNotice).toHaveBeenCalled();
  });
});

// ━━━ dispatchCommand — /tokens ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCommand /tokens", () => {
  it("returns handled: true", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/tokens", ctx);
    expect(result.handled).toBe(true);
  });

  it("calls pushNotice with token info", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/tokens", ctx);
    expect(ctx.pushNotice).toHaveBeenCalled();
    const notice = (ctx.pushNotice as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(notice.toLowerCase()).toContain("token");
  });
});

// ━━━ dispatchCommand — /model ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCommand /model", () => {
  it("lists models when no arg given", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/model", ctx);
    expect(ctx.pushNotice).toHaveBeenCalled();
    const notice = (ctx.pushNotice as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(notice).toContain("groq");
  });

  it("switches to known model", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/model llama-3.3-70b-versatile", ctx);
    expect(ctx.setModel).toHaveBeenCalledWith("llama-3.3-70b-versatile");
  });

  it("switches provider when model belongs to different provider", async () => {
    const ctx = makeCtx({ currentProvider: "groq" });
    await dispatchCommand("/model openai/gpt-4o-mini", ctx);
    expect(ctx.setProvider).toHaveBeenCalledWith("openrouter");
  });

  it("sets unknown model without switching provider", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/model some-custom-model", ctx);
    expect(ctx.setModel).toHaveBeenCalledWith("some-custom-model");
    expect(ctx.setProvider).not.toHaveBeenCalled();
  });

  it("calls contextManager.setProvider on known model switch", async () => {
    const ctx = makeCtx();
    const spy = vi.spyOn(ctx.contextManager, "setProvider");
    await dispatchCommand("/model openai/gpt-4o-mini", ctx);
    expect(spy).toHaveBeenCalledWith("openrouter");
  });

  it("calls pushNotice after switching", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/model llama-3.3-70b-versatile", ctx);
    expect(ctx.pushNotice).toHaveBeenCalled();
  });
});

// ━━━ dispatchCommand — /add ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCommand /add", () => {
  it("shows usage when no arg given", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/add", ctx);
    expect(ctx.pushNotice).toHaveBeenCalled();
    const notice = (ctx.pushNotice as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(notice.toLowerCase()).toContain("usage");
  });

  it("calls pushError on missing file", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/add nonexistent/file.ts", ctx);
    expect(ctx.pushError).toHaveBeenCalled();
  });

  it("returns handled: true on missing file", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/add nonexistent/file.ts", ctx);
    expect(result.handled).toBe(true);
  });

  it("returns handled: true", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/add", ctx);
    expect(result.handled).toBe(true);
  });
});

// ━━━ dispatchCommand — /remove ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCommand /remove", () => {
  it("shows file list when no arg given and files exist", async () => {
    const ctx = makeCtx();
    // Spy on contextManager.getFiles to return a fake file
    vi.spyOn(ctx.contextManager, "getFiles").mockReturnValue([
      {
        filePath: "src/index.ts",
        content: "x",
        tokens: 1,
        addedAt: new Date(),
        source: "command",
      },
    ]);
    await dispatchCommand("/remove", ctx);
    expect(ctx.pushNotice).toHaveBeenCalled();
  });

  it("shows no files message when none loaded and no arg", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/remove", ctx);
    expect(ctx.pushNotice).toHaveBeenCalled();
  });

  it("calls pushError when file not in context", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/remove src/missing.ts", ctx);
    expect(ctx.pushError).toHaveBeenCalled();
  });

  it("returns handled: true", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/remove", ctx);
    expect(result.handled).toBe(true);
  });
});

// ━━━ dispatchCommand — /status ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCommand /status", () => {
  it("returns handled: true", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/status", ctx);
    expect(result.handled).toBe(true);
  });

  it("calls pushNotice with provider and model info", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/status", ctx);
    const notice = (ctx.pushNotice as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(notice).toContain("groq");
    expect(notice).toContain("llama-3.3-70b-versatile");
  });
});

// ━━━ dispatchCommand — /retry ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCommand /retry", () => {
  it("shows notice when no previous input", async () => {
    const ctx = makeCtx({
      getLastUserInput: vi.fn().mockReturnValue(null),
    });
    await dispatchCommand("/retry", ctx);
    expect(ctx.pushNotice).toHaveBeenCalled();
    const notice = (ctx.pushNotice as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(notice.toLowerCase()).toContain("nothing to retry");
  });

  it("calls triggerRetry when previous input exists", async () => {
    const ctx = makeCtx({
      getLastUserInput: vi.fn().mockReturnValue("fix the bug"),
    });
    await dispatchCommand("/retry", ctx);
    expect(ctx.triggerRetry).toHaveBeenCalledWith("fix the bug");
  });

  it("returns handled: true", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/retry", ctx);
    expect(result.handled).toBe(true);
  });
});

// ━━━ dispatchCommand — /exit ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCommand /exit", () => {
  it("returns handled: true", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/exit", ctx);
    expect(result.handled).toBe(true);
  });

  it("calls pushNotice with goodbye message", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/exit", ctx);
    expect(ctx.pushNotice).toHaveBeenCalled();
  });

  it("alias /quit also works", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/quit", ctx);
    expect(result.handled).toBe(true);
  });

  it("alias /q also works", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/q", ctx);
    expect(result.handled).toBe(true);
  });
});

// ━━━ dispatchCommand — unknown command ━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCommand — unknown command", () => {
  it("returns handled: true", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/notacommand", ctx);
    expect(result.handled).toBe(true);
  });

  it("calls pushNotice with unknown command message", async () => {
    const ctx = makeCtx();
    await dispatchCommand("/notacommand", ctx);
    const notice = (ctx.pushNotice as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(notice.toLowerCase()).toContain("unknown");
  });
});

// ━━━ dispatchCommand — case insensitivity ━━━━━━━━━━━━━━━━━━━━━

describe("dispatchCommand — case insensitivity", () => {
  it("/HELP is handled", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/HELP", ctx);
    expect(result.handled).toBe(true);
  });

  it("/Help is handled", async () => {
    const ctx = makeCtx();
    const result = await dispatchCommand("/Help", ctx);
    expect(result.handled).toBe(true);
  });
});