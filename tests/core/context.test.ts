// src/core/context.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ContextManager, TOKEN_LIMITS, WARNING_THRESHOLD } from "../../src/core/context";
import type { Message } from "../../src/core/conversation";

// ━━━ Helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let tmpDir: string;

function writeTmp(name: string, content: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, "utf-8");
  return p;
}

function makeMessages(count: number): Message[] {
  const msgs: Message[] = [
    { role: "system", content: "You are a helpful assistant." },
  ];
  for (let i = 0; i < count; i++) {
    msgs.push({ role: "user", content: `User message ${i}` });
    msgs.push({ role: "assistant", content: `Assistant reply ${i}` });
  }
  return msgs;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ━━━ Constructor ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ContextManager — constructor", () => {
  it("initialises with zero files", () => {
    const cm = new ContextManager("groq");
    expect(cm.getFileCount()).toBe(0);
  });

  it("stores provider", () => {
    const cm = new ContextManager("groq");
    expect(cm.getProvider()).toBe("groq");
  });

  it("uses correct token limit for groq", () => {
    const cm = new ContextManager("groq");
    expect(cm.getTokenLimit()).toBe(TOKEN_LIMITS["groq"]);
  });

  it("uses correct token limit for openrouter", () => {
    const cm = new ContextManager("openrouter");
    expect(cm.getTokenLimit()).toBe(TOKEN_LIMITS["openrouter"]);
  });

  it("falls back to 128000 for unknown provider", () => {
    const cm = new ContextManager("unknown-provider");
    expect(cm.getTokenLimit()).toBe(128000);
  });
});

// ━━━ addFile ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ContextManager.addFile", () => {
  it("adds a real file successfully", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("hello.ts", 'export const x = 1;\n');
    const rel = path.relative(process.cwd(), p);
    const result = cm.addFile(rel);
    expect(result.success).toBe(true);
    expect(result.tokens).toBeGreaterThan(0);
    expect(result.lines).toBeGreaterThan(0);
  });

  it("returns error for missing file", () => {
    const cm = new ContextManager("groq");
    const result = cm.addFile("nonexistent/file.ts");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("increments file count after add", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("a.ts", "const a = 1;");
    cm.addFile(path.relative(process.cwd(), p));
    expect(cm.getFileCount()).toBe(1);
  });

  it("adding same file twice does not duplicate it", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("dup.ts", "const x = 1;");
    const rel = path.relative(process.cwd(), p);
    cm.addFile(rel);
    cm.addFile(rel);
    expect(cm.getFileCount()).toBe(1);
  });

  it("sets source field to command by default", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("src.ts", "const x = 1;");
    const rel = path.relative(process.cwd(), p);
    cm.addFile(rel);
    const files = cm.getFiles();
    expect(files[0].source).toBe("command");
  });

  it("sets source field to mention when specified", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("mentioned.ts", "const x = 1;");
    const rel = path.relative(process.cwd(), p);
    cm.addFile(rel, "mention");
    const files = cm.getFiles();
    expect(files[0].source).toBe("mention");
  });

  it("stores addedAt as a Date", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("dated.ts", "const x = 1;");
    const rel = path.relative(process.cwd(), p);
    cm.addFile(rel);
    expect(cm.getFiles()[0].addedAt).toBeInstanceOf(Date);
  });
});

// ━━━ removeFile ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ContextManager.removeFile", () => {
  it("returns true when file existed", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("r.ts", "const x = 1;");
    const rel = path.relative(process.cwd(), p);
    cm.addFile(rel);
    expect(cm.removeFile(rel)).toBe(true);
  });

  it("returns false when file did not exist", () => {
    const cm = new ContextManager("groq");
    expect(cm.removeFile("never-added.ts")).toBe(false);
  });

  it("decrements file count", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("dec.ts", "const x = 1;");
    const rel = path.relative(process.cwd(), p);
    cm.addFile(rel);
    cm.removeFile(rel);
    expect(cm.getFileCount()).toBe(0);
  });
});

// ━━━ hasFile ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ContextManager.hasFile", () => {
  it("returns true after adding", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("has.ts", "x");
    const rel = path.relative(process.cwd(), p);
    cm.addFile(rel);
    expect(cm.hasFile(rel)).toBe(true);
  });

  it("returns false before adding", () => {
    const cm = new ContextManager("groq");
    expect(cm.hasFile("not-added.ts")).toBe(false);
  });

  it("returns false after removing", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("gone.ts", "x");
    const rel = path.relative(process.cwd(), p);
    cm.addFile(rel);
    cm.removeFile(rel);
    expect(cm.hasFile(rel)).toBe(false);
  });
});

// ━━━ clearFiles ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ContextManager.clearFiles", () => {
  it("removes all files", () => {
    const cm = new ContextManager("groq");
    writeTmp("a.ts", "x");
    writeTmp("b.ts", "y");
    const a = path.relative(process.cwd(), path.join(tmpDir, "a.ts"));
    const b = path.relative(process.cwd(), path.join(tmpDir, "b.ts"));
    cm.addFile(a);
    cm.addFile(b);
    cm.clearFiles();
    expect(cm.getFileCount()).toBe(0);
  });

  it("getFileTokens returns 0 after clear", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("c.ts", "const x = 1;");
    cm.addFile(path.relative(process.cwd(), p));
    cm.clearFiles();
    expect(cm.getFileTokens()).toBe(0);
  });
});

// ━━━ buildContextBlock ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ContextManager.buildContextBlock", () => {
  it("returns empty string when no files", () => {
    const cm = new ContextManager("groq");
    expect(cm.buildContextBlock()).toBe("");
  });

  it("includes file path in output", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("myfile.ts", "const x = 1;");
    const rel = path.relative(process.cwd(), p);
    cm.addFile(rel);
    expect(cm.buildContextBlock()).toContain("myfile.ts");
  });

  it("includes file content in output", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("content.ts", "export const magic = 42;");
    const rel = path.relative(process.cwd(), p);
    cm.addFile(rel);
    expect(cm.buildContextBlock()).toContain("export const magic = 42;");
  });

  it("wraps content in code fences", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("fenced.ts", "const x = 1;");
    const rel = path.relative(process.cwd(), p);
    cm.addFile(rel);
    const block = cm.buildContextBlock();
    expect(block).toContain("```");
  });

  it("includes multiple files", () => {
    const cm = new ContextManager("groq");
    const p1 = writeTmp("first.ts", "const a = 1;");
    const p2 = writeTmp("second.ts", "const b = 2;");
    cm.addFile(path.relative(process.cwd(), p1));
    cm.addFile(path.relative(process.cwd(), p2));
    const block = cm.buildContextBlock();
    expect(block).toContain("first.ts");
    expect(block).toContain("second.ts");
  });
});

// ━━━ buildSystemPrompt ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ContextManager.buildSystemPrompt", () => {
  it("returns base prompt unchanged when no files", () => {
    const cm = new ContextManager("groq");
    const base = "You are a helpful assistant.";
    expect(cm.buildSystemPrompt(base)).toBe(base);
  });

  it("prepends context block before base prompt", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("file.ts", "const x = 1;");
    cm.addFile(path.relative(process.cwd(), p));
    const result = cm.buildSystemPrompt("BASE PROMPT");
    const contextIdx = result.indexOf("file.ts");
    const baseIdx = result.indexOf("BASE PROMPT");
    expect(contextIdx).toBeLessThan(baseIdx);
  });

  it("includes separator between context and base prompt", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("sep.ts", "x");
    cm.addFile(path.relative(process.cwd(), p));
    const result = cm.buildSystemPrompt("BASE");
    expect(result).toContain("---");
  });
});

// ━━━ Token Tracking ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ContextManager — token tracking", () => {
  it("getFileTokens returns 0 when no files", () => {
    const cm = new ContextManager("groq");
    expect(cm.getFileTokens()).toBe(0);
  });

  it("getFileTokens accumulates across multiple files", () => {
    const cm = new ContextManager("groq");
    const p1 = writeTmp("t1.ts", "const a = 1; // some content here");
    const p2 = writeTmp("t2.ts", "const b = 2; // more content here");
    cm.addFile(path.relative(process.cwd(), p1));
    cm.addFile(path.relative(process.cwd(), p2));
    expect(cm.getFileTokens()).toBeGreaterThan(0);
  });

  it("getTotalTokensUsed sums file and history tokens", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("sum.ts", "const x = 1;");
    cm.addFile(path.relative(process.cwd(), p));
    const fileTokens = cm.getFileTokens();
    const historyTokens = 100;
    expect(cm.getTotalTokensUsed(historyTokens)).toBe(
      fileTokens + historyTokens
    );
  });

  it("getSummary returns correct structure", () => {
    const cm = new ContextManager("groq");
    const p = writeTmp("s.ts", "const x = 1;");
    const rel = path.relative(process.cwd(), p);
    cm.addFile(rel);
    const summary = cm.getSummary(100);
    expect(summary).toHaveProperty("used");
    expect(summary).toHaveProperty("total");
    expect(summary).toHaveProperty("percent");
    expect(summary).toHaveProperty("fileCount", 1);
    expect(summary).toHaveProperty("files");
    expect(summary).toHaveProperty("historyTokens", 100);
    expect(summary).toHaveProperty("fileTokens");
  });

  it("getSummary percent is between 0 and 100 for normal usage", () => {
    const cm = new ContextManager("groq");
    const summary = cm.getSummary(100);
    expect(summary.percent).toBeGreaterThanOrEqual(0);
    expect(summary.percent).toBeLessThanOrEqual(100);
  });
});

// ━━━ shouldTruncate ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ContextManager.shouldTruncate", () => {
  it("returns false when well below threshold", () => {
    const cm = new ContextManager("groq");
    expect(cm.shouldTruncate(100)).toBe(false);
  });

  it("returns true when above 85% of limit", () => {
    const cm = new ContextManager("groq");
    const limit = cm.getTokenLimit();
    // Pass history tokens that exceed 85% of limit
    expect(cm.shouldTruncate(Math.ceil(limit * 0.86))).toBe(true);
  });

  it("returns false at exactly 84%", () => {
    const cm = new ContextManager("groq");
    const limit = cm.getTokenLimit();
    expect(cm.shouldTruncate(Math.floor(limit * 0.84))).toBe(false);
  });
});

// ━━━ truncateHistory ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ContextManager.truncateHistory", () => {
  it("returns unchanged when messages <= 7", () => {
    const cm = new ContextManager("groq");
    const msgs = makeMessages(2); // system + 2 pairs = 5 messages
    const { truncated, removedCount } = cm.truncateHistory(msgs);
    expect(removedCount).toBe(0);
    expect(truncated).toHaveLength(msgs.length);
  });

  it("always preserves system prompt at index 0", () => {
    const cm = new ContextManager("groq");
    const limit = cm.getTokenLimit();
    // Build messages large enough to trigger truncation
    const longContent = ("hello world this is a longer test content to ensure token count exceeds limit " as string).repeat(Math.ceil(limit / 2));
    const msgs: Message[] = [
      { role: "system", content: "SYSTEM PROMPT" },
      { role: "user", content: longContent },
      { role: "assistant", content: "ok" },
      { role: "user", content: "msg3" },
      { role: "assistant", content: "msg4" },
      { role: "user", content: "msg5" },
      { role: "assistant", content: "msg6" },
      { role: "user", content: "msg7" },
      { role: "assistant", content: "msg8" },
    ];
    const { truncated } = cm.truncateHistory(msgs);
    expect(truncated[0].role).toBe("system");
    expect(truncated[0].content).toBe("SYSTEM PROMPT");
  });

  it("removes oldest messages first", () => {
    const cm = new ContextManager("groq");
    const limit = cm.getTokenLimit();
    const longContent = ("hello world this is a longer test content to ensure token count exceeds limit " as string).repeat(Math.ceil(limit / 2));
    const msgs: Message[] = [
      { role: "system", content: "SYSTEM" },
      { role: "user", content: "OLDEST USER " + longContent },
      { role: "assistant", content: "OLDEST ASSISTANT" },
      { role: "user", content: "newer user" },
      { role: "assistant", content: "newer assistant" },
      { role: "user", content: "newest user" },
      { role: "assistant", content: "newest assistant" },
      { role: "user", content: "last user" },
      { role: "assistant", content: "last assistant" },
    ];
    const { truncated } = cm.truncateHistory(msgs);
    const contents = truncated.map((m) => m.content);
    expect(contents.some((c) => c.includes("OLDEST USER"))).toBe(false);
  });

  it("tokensSaved is greater than 0 when truncation occurs", () => {
    const cm = new ContextManager("groq");
    const limit = cm.getTokenLimit();
    const longContent = ("hello world this is a longer test content to ensure token count exceeds limit " as string).repeat(Math.ceil(limit / 2));
    const msgs: Message[] = [
      { role: "system", content: "SYSTEM" },
      { role: "user", content: longContent },
      { role: "assistant", content: "ok" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
      { role: "assistant", content: "a3" },
      { role: "user", content: "u4" },
      { role: "assistant", content: "a4" },
    ];
    const { tokensSaved, removedCount } = cm.truncateHistory(msgs);
    if (removedCount > 0) {
      expect(tokensSaved).toBeGreaterThan(0);
    }
  });

  it("removedCount is always even (pairs)", () => {
    const cm = new ContextManager("groq");
    const limit = cm.getTokenLimit();
    const longContent = ("hello world this is a longer test content to ensure token count exceeds limit " as string).repeat(Math.ceil(limit / 2));
    const msgs: Message[] = [
      { role: "system", content: "SYSTEM" },
      { role: "user", content: longContent },
      { role: "assistant", content: "a" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
      { role: "assistant", content: "a3" },
      { role: "user", content: "u4" },
      { role: "assistant", content: "a4" },
    ];
    const { removedCount } = cm.truncateHistory(msgs);
    // removedCount should be 0 or even
    expect(removedCount % 2).toBe(0);
  });
});

// ━━━ setProvider / getProvider ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ContextManager.setProvider", () => {
  it("updates token limit when provider changes", () => {
    const cm = new ContextManager("groq");
    expect(cm.getTokenLimit()).toBe(TOKEN_LIMITS["groq"]);
    cm.setProvider("openrouter");
    expect(cm.getTokenLimit()).toBe(TOKEN_LIMITS["openrouter"]);
  });

  it("getProvider returns updated provider", () => {
    const cm = new ContextManager("groq");
    cm.setProvider("nvidia");
    expect(cm.getProvider()).toBe("nvidia");
  });
});