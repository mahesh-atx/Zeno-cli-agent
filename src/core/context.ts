import * as fs from "fs";
import * as path from "path";
import { countTokens } from "../utils/tokens";
import type { Message } from "./conversation";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContextFile {
  filePath: string;
  content: string;
  tokens: number;
  addedAt: Date;
}

export interface ContextSummary {
  used: number;
  total: number;
  percent: number;
  fileCount: number;
  files: string[];
}

// ─── Limits ───────────────────────────────────────────────────────────────────

export const TOKEN_LIMITS: Record<string, number> = {
  openrouter: 128000,
  groq: 32768,
  nvidia: 128000,
};

// Truncation fires at 85% of limit
const TRUNCATION_THRESHOLD = 0.85;

// Max file size for /add and @mention
const MAX_FILE_TOKENS = 50000;

// ─── Context Manager ──────────────────────────────────────────────────────────

export class ContextManager {
  private files: Map<string, ContextFile> = new Map();
  private provider: string;

  constructor(provider: string) {
    this.provider = provider;
  }

  // ─── File Management ────────────────────────────────────────────────────────

  addFile(filePath: string): {
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

  // ─── Build System Context Block ──────────────────────────────────────────────
  // Returns content to prepend to the system prompt

  buildContextBlock(): string {
    if (this.files.size === 0) return "";

    const parts: string[] = [
      "The following files have been added to your context:\n",
    ];

    for (const file of this.files.values()) {
      const ext = path.extname(file.filePath).slice(1) || "text";
      parts.push(`\`\`\`${ext} // ${file.filePath}`);
      parts.push(file.content);
      parts.push("```\n");
    }

    return parts.join("\n");
  }

  // ─── Token Tracking ─────────────────────────────────────────────────────────

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

  willExceedLimit(additionalTokens: number, currentHistoryTokens: number): boolean {
    const fileTokens = this.getFileTokens();
    const total = fileTokens + currentHistoryTokens + additionalTokens;
    return total > this.getTokenLimit() * TRUNCATION_THRESHOLD;
  }

  getSummary(currentHistoryTokens: number): ContextSummary {
    const fileTokens = this.getFileTokens();
    const used = fileTokens + currentHistoryTokens;
    const total = this.getTokenLimit();
    const percent = total > 0 ? (used / total) * 100 : 0;

    return {
      used,
      total,
      percent,
      fileCount: this.files.size,
      files: Array.from(this.files.keys()),
    };
  }

  // ─── Auto-Truncation ─────────────────────────────────────────────────────────

  shouldTruncate(currentHistoryTokens: number): boolean {
    const used = this.getFileTokens() + currentHistoryTokens;
    const limit = this.getTokenLimit();
    return used / limit >= TRUNCATION_THRESHOLD;
  }

  truncateHistory(messages: Message[]): {
    truncated: Message[];
    removedCount: number;
  } {
    // Always keep system prompt (index 0) and last 6 messages minimum
    if (messages.length <= 7) {
      return { truncated: messages, removedCount: 0 };
    }

    const system = messages[0];
    const rest = messages.slice(1);

    // Remove oldest pairs (user + assistant) from the front
    let removedCount = 0;
    let working = rest;

    while (working.length > 6) {
      const fileTokens = this.getFileTokens();
      const histTokens = working.reduce(
        (acc, m) => acc + countTokens(m.content),
        0
      );
      const used = fileTokens + histTokens;
      const limit = this.getTokenLimit();

      if (used / limit < TRUNCATION_THRESHOLD) break;

      // Remove oldest user+assistant pair
      working = working.slice(2);
      removedCount += 2;
    }

    return {
      truncated: [system, ...working],
      removedCount,
    };
  }

  // ─── Provider Switch ─────────────────────────────────────────────────────────

  setProvider(provider: string): void {
    this.provider = provider;
  }
}