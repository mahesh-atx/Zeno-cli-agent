// src/core/context.ts
import * as fs from "fs";
import * as path from "path";
import { countTokens } from "../utils/tokens";
import type { Message } from "./conversation";

// ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ContextFile {
  filePath: string;
  content: string;
  tokens: number;
  addedAt: Date;
  /** How the file entered context — @mention or /add command */
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

// ━━━ Limits ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const TOKEN_LIMITS: Record<string, number> = {
  openrouter: 128000,
  groq:        32768,
  nvidia:     128000,
  opencodezen: 128000,
};

// Truncation fires at 85% of limit
const TRUNCATION_THRESHOLD = 0.85;

// Warning shown in UI at 70%
export const WARNING_THRESHOLD = 0.70;

// Max file size for /add and @mention
const MAX_FILE_TOKENS = 50000;

// Minimum messages to always keep (system + last 3 pairs)
const MIN_MESSAGES_TO_KEEP = 7;

// ━━━ Context Manager ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class ContextManager {
  private files: Map<string, ContextFile> = new Map();
  private provider: string;

  constructor(provider: string) {
    this.provider = provider;
  }

  // ─── File Management ─────────────────────────────────────────

  addFile(
    filePath: string,
    source: ContextFile["source"] = "command"
  ): {
    success: boolean;
    error?: string;
    tokens?: number;
    lines?: number;
  } {
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

  // ─── System Prompt Injection ──────────────────────────────────
  // Builds the file context block that gets PREPENDED to the
  // system prompt on every request. This is the core of context
  // management — the LLM always sees the files.

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

  /**
   * Builds the full system prompt with context files injected.
   * Call this to get the prompt that should be sent to the provider.
   */
  buildSystemPrompt(baseSystemPrompt: string): string {
    const contextBlock = this.buildContextBlock();
    if (!contextBlock) return baseSystemPrompt;
    return `${contextBlock}\n---\n${baseSystemPrompt}`;
  }

  // ─── Token Tracking ───────────────────────────────────────────

  getFileTokens(): number {
    let total = 0;
    for (const file of this.files.values()) {
      total += file.tokens;
    }
    return total;
  }

  getTokenLimit(): number {
    return TOKEN_LIMITS[this.provider] ?? 128000;
  }

  /**
   * Returns total tokens used including files + conversation history.
   */
  getTotalTokensUsed(historyTokens: number): number {
    return this.getFileTokens() + historyTokens;
  }

  /**
   * Whether adding N more tokens would exceed the warning threshold.
   */
  willExceedWarning(additionalTokens: number, historyTokens: number): boolean {
    const total = this.getTotalTokensUsed(historyTokens) + additionalTokens;
    return total > this.getTokenLimit() * WARNING_THRESHOLD;
  }

  /**
   * Whether adding N more tokens would exceed the hard truncation limit.
   */
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

  // ─── Auto-Truncation ──────────────────────────────────────────

  shouldTruncate(historyTokens: number): boolean {
    const used = this.getFileTokens() + historyTokens;
    const limit = this.getTokenLimit();
    return used / limit >= TRUNCATION_THRESHOLD;
  }

  /**
   * Removes oldest user+assistant pairs from conversation history
   * until we are back below the truncation threshold.
   *
   * Rules:
   * - System prompt (index 0) is NEVER removed
   * - Always keeps at least the last 3 user+assistant pairs
   * - Removes oldest pairs first (from index 1 forward)
   * - Returns how many messages and tokens were removed
   */
  truncateHistory(messages: Message[]): TruncationResult {
    // Not enough to truncate
    if (messages.length <= MIN_MESSAGES_TO_KEEP) {
      return { truncated: messages, removedCount: 0, tokensSaved: 0 };
    }

    const system = messages[0];  // Always keep system prompt
    let working = messages.slice(1);
    let removedCount = 0;
    let tokensSaved = 0;

    while (working.length > MIN_MESSAGES_TO_KEEP - 1) {
      const fileTokens = this.getFileTokens();
      const histTokens = working.reduce(
        (acc, m) => acc + countTokens(m.content) + 4,
        0
      );
      const used = fileTokens + histTokens;
      const limit = this.getTokenLimit();

      // Below threshold — stop truncating
      if (used / limit < TRUNCATION_THRESHOLD) break;

      // Remove the oldest pair (user message at index 0,
      // assistant reply at index 1)
      if (working.length >= 2) {
        const removed = working.slice(0, 2);
        tokensSaved += removed.reduce(
          (acc, m) => acc + countTokens(m.content) + 4,
          0
        );
        working = working.slice(2);
        removedCount += 2;
      } else {
        // Only one message left — remove it
        tokensSaved += countTokens(working[0].content) + 4;
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

  // ─── Provider Switch ──────────────────────────────────────────

  setProvider(provider: string): void {
    this.provider = provider;
  }

  getProvider(): string {
    return this.provider;
  }
}