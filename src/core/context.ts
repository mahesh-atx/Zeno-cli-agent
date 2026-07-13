// src/core/context.ts
import * as fs from "fs";
import * as path from "path";
import { countTokens, countMessageTokens } from "../utils/tokens";
import type { Message } from "./conversation";
import { TOKEN_LIMITS } from "../providers/registry";
import type { ProviderName } from "./config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContextFile {
  filePath: string;
  content: string;
  tokens: number;
  addedAt: Date;
  source: "mention" | "command";
}

export interface ContextSummary {
  used: number;
  total: number;
  percent: number;
  fileCount: number;
  files: string[];
  historyTokens: number;
  fileTokens: number;
}

export interface TruncationResult {
  truncated: Message[];
  removedCount: number;
  tokensSaved: number;
}

export { TOKEN_LIMITS } from "../providers/registry";

const TRUNCATION_THRESHOLD = 0.85;
const WARNING_THRESHOLD = 0.70;
const MAX_FILE_TOKENS = 50000;
const MIN_MESSAGES_TO_KEEP = 7;

function getTokenLimitForProvider(provider: string): number {
  return TOKEN_LIMITS[provider as ProviderName] ?? 128000;
}

function safeCountMessageTokens(msg: Message): number {
  try {
    return countMessageTokens(msg as any);
  } catch {
    // Fallback to simple string length if counting fails
    const content = typeof (msg as any).content === "string" ? (msg as any).content : JSON.stringify((msg as any).content);
    return countTokens(content) + 4;
  }
}

// ─── Context Manager ──────────────────────────────────────────────────────────

export class ContextManager {
  private files: Map<string, ContextFile> = new Map();
  private provider: string;

  constructor(provider: string) {
    this.provider = provider;
  }

  addFile(
    filePath: string,
    source: ContextFile["source"] = "command"
  ): {
    success: boolean;
    error?: string;
    tokens?: number;
    lines?: number;
  } {
    try {
      const guards = require("../tools/guards") as typeof import("../tools/guards");
      const safe = guards.assertSafePath(filePath);
      if (safe.error) {
        return { success: false, error: safe.error };
      }
      const resolved = safe.resolved;

      if (!fs.existsSync(resolved)) {
        return { success: false, error: `File not found: ${filePath}` };
      }

      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        return { success: false, error: `Path is a directory, not a file: ${filePath}` };
      }

      const sizeCheck = guards.checkFileSize(stat.size, guards.LIMITS.MAX_READ_BYTES);
      if (!sizeCheck.ok) {
        return { success: false, error: sizeCheck.error };
      }

      if (guards.isBinaryFileSync(resolved)) {
        return { success: false, error: `Binary file detected: ${filePath}` };
      }

      let content: string;
      try {
        content = fs.readFileSync(resolved, "utf-8");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { success: false, error: `Cannot read file: ${msg}` };
      }

      const tokens = countTokens(content);
      if (tokens > MAX_FILE_TOKENS) {
        return {
          success: false,
          error: `File too large (${tokens.toLocaleString()} tokens, max ${MAX_FILE_TOKENS.toLocaleString()})`,
        };
      }

      const currentFileTokens = this.getFileTokens();
      const limit = this.getTokenLimit();
      if (currentFileTokens + tokens > limit * 0.8) {
        return {
          success: false,
          error: `Adding ${filePath} would exceed context limit: ${currentFileTokens.toLocaleString()} + ${tokens.toLocaleString()} > ${(limit * 0.8).toLocaleString()} (80% of ${limit.toLocaleString()})`,
        };
      }

      const lines = content.split("\n").length;

      this.files.set(filePath, {
        filePath,
        content,
        tokens,
        addedAt: new Date(),
        source,
      });

      return { success: true, tokens, lines };
    } catch {
      const resolved = path.resolve(process.cwd(), filePath);
      if (!fs.existsSync(resolved)) {
        return { success: false, error: `File not found: ${filePath}` };
      }
      let content: string;
      try {
        content = fs.readFileSync(resolved, "utf-8");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { success: false, error: `Cannot read file: ${msg}` };
      }
      const tokens = countTokens(content);
      if (tokens > MAX_FILE_TOKENS) {
        return {
          success: false,
          error: `File too large (${tokens.toLocaleString()} tokens, max ${MAX_FILE_TOKENS.toLocaleString()})`,
        };
      }
      const totalNow = this.getFileTokens();
      if (totalNow + tokens > this.getTokenLimit() * 0.8) {
        return {
          success: false,
          error: `Would exceed context limit`,
        };
      }
      const lines = content.split("\n").length;
      this.files.set(filePath, {
        filePath,
        content,
        tokens,
        addedAt: new Date(),
        source,
      });
      return { success: true, tokens, lines };
    }
  }

  removeFile(filePath: string): boolean {
    return this.files.delete(filePath);
  }

  hasFile(filePath: string): boolean {
    return this.files.has(filePath);
  }

  getFiles(): ContextFile[] {
    return Array.from(this.files.values());
  }

  getFileCount(): number {
    return this.files.size;
  }

  clearFiles(): void {
    this.files.clear();
  }

  buildContextBlock(): string {
    if (this.files.size === 0) return "";

    const parts: string[] = [
      "The following files have been added to your context. " +
      "Use them as reference for all responses:\n",
    ];

    for (const file of this.files.values()) {
      const ext = path.extname(file.filePath).slice(1) || "text";
      parts.push(`### File: ${file.filePath}\n`);
      parts.push("```" + ext);
      parts.push(file.content);
      parts.push("```\n");
    }

    return parts.join("\n");
  }

  buildSystemPrompt(baseSystemPrompt: string): string {
    const contextBlock = this.buildContextBlock();
    if (!contextBlock) return baseSystemPrompt;
    return `${contextBlock}\n---\n${baseSystemPrompt}`;
  }

  getFileTokens(): number {
    let total = 0;
    for (const file of this.files.values()) {
      total += file.tokens;
    }
    return total;
  }

  getTokenLimit(): number {
    return getTokenLimitForProvider(this.provider);
  }

  getTotalTokensUsed(historyTokens: number): number {
    return this.getFileTokens() + historyTokens;
  }

  willExceedWarning(additionalTokens: number, historyTokens: number): boolean {
    const total = this.getTotalTokensUsed(historyTokens) + additionalTokens;
    return total > this.getTokenLimit() * WARNING_THRESHOLD;
  }

  willExceedLimit(additionalTokens: number, historyTokens: number): boolean {
    const total = this.getTotalTokensUsed(historyTokens) + additionalTokens;
    return total > this.getTokenLimit() * TRUNCATION_THRESHOLD;
  }

  getSummary(historyTokens: number): ContextSummary {
    const fileTokens = this.getFileTokens();
    const used = fileTokens + historyTokens;
    const total = this.getTokenLimit();
    const percent = total > 0 ? (used / total) * 100 : 0;

    return {
      used,
      total,
      percent,
      fileCount: this.files.size,
      files: Array.from(this.files.keys()),
      historyTokens,
      fileTokens,
    };
  }

  shouldTruncate(historyTokens: number): boolean {
    const used = this.getFileTokens() + historyTokens;
    const limit = this.getTokenLimit();
    return used / limit >= TRUNCATION_THRESHOLD;
  }

  truncateHistory(messages: Message[]): TruncationResult {
    if (messages.length <= MIN_MESSAGES_TO_KEEP) {
      return { truncated: messages, removedCount: 0, tokensSaved: 0 };
    }

    const system = messages[0];
    let working = messages.slice(1);
    let removedCount = 0;
    let tokensSaved = 0;

    while (working.length > MIN_MESSAGES_TO_KEEP - 1) {
      const fileTokens = this.getFileTokens();
      const histTokens = working.reduce((acc, m) => acc + safeCountMessageTokens(m), 0);
      const used = fileTokens + histTokens;
      const limit = this.getTokenLimit();

      if (used / limit < TRUNCATION_THRESHOLD) break;

      if (working.length >= 2) {
        const removed = working.slice(0, 2);
        tokensSaved += removed.reduce((acc, m) => acc + safeCountMessageTokens(m), 0);
        working = working.slice(2);
        removedCount += 2;
      } else {
        tokensSaved += safeCountMessageTokens(working[0]);
        working = [];
        removedCount += 1;
        break;
      }
    }

    return {
      truncated: [system, ...working],
      removedCount,
      tokensSaved,
    };
  }

  setProvider(provider: string): void {
    this.provider = provider;
  }

  getProvider(): string {
    return this.provider;
  }
}
