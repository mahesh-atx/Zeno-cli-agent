import * as fs from "fs";
import * as path from "path";
import { countTokens } from "./tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AtMentionResult {
  cleanedInput: string;
  attachments: AtAttachment[];
  errors: string[];
}

export interface AtAttachment {
  filePath: string;
  content: string;
  lines: number;
  tokens: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_TOKENS = 50000;
const AT_MENTION_REGEX = /@([\w./\-@]+)/g;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripTrailingPunctuation(p: string): string {
  return p.replace(/[.,;:!?]+$/, "");
}

function isLikelyBinary(buf: Buffer): boolean {
  const slice = buf.subarray(0, Math.min(1024, buf.length));
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] === 0) return true;
  }
  return false;
}

// ─── Parser ───────────────────────────────────────────────────────────────────
// Now uses shared guards for safe path, size, binary checks

export function parseAtMentions(input: string): AtMentionResult {
  const matches = [...input.matchAll(AT_MENTION_REGEX)];

  if (matches.length === 0) {
    return { cleanedInput: input, attachments: [], errors: [] };
  }

  const attachments: AtAttachment[] = [];
  const errors: string[] = [];
  const processedPaths = new Set<string>();

  // Dynamic import to avoid circular issues if any
  let guards: typeof import("../tools/guards") | null = null;
  try {
    guards = require("../tools/guards") as typeof import("../tools/guards");
  } catch {
    guards = null;
  }

  for (const match of matches) {
    const rawPath = stripTrailingPunctuation(match[1]);

    if (!rawPath) continue;
    if (processedPaths.has(rawPath)) continue;
    processedPaths.add(rawPath);

    // Safe path check via guards if available
    if (guards) {
      const safe = guards.assertSafePath(rawPath);
      if (safe.error) {
        errors.push(`@${rawPath}: ${safe.error}`);
        continue;
      }
    }

    const resolved = path.resolve(process.cwd(), rawPath);

    if (!fs.existsSync(resolved)) {
      errors.push(`@${rawPath}: file not found`);
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch {
      errors.push(`@${rawPath}: cannot stat file`);
      continue;
    }

    if (stat.isDirectory()) {
      errors.push(`@${rawPath}: is a directory, not a file`);
      continue;
    }

    if (guards) {
      const sizeCheck = guards.checkFileSize(stat.size, guards.LIMITS.MAX_READ_BYTES);
      if (!sizeCheck.ok) {
        errors.push(`@${rawPath}: ${sizeCheck.error}`);
        continue;
      }
    }

    let buf: Buffer;
    try {
      buf = fs.readFileSync(resolved);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      errors.push(`@${rawPath}: cannot read file (${msg})`);
      continue;
    }

    if (isLikelyBinary(buf) || (guards && guards.isBinaryBuffer(buf))) {
      errors.push(`@${rawPath}: appears to be a binary file (skipped)`);
      continue;
    }

    const content = buf.toString("utf-8");
    const lines = content.split("\n").length;
    const tokens = countTokens(content);

    if (tokens > MAX_FILE_TOKENS) {
      errors.push(
        `@${rawPath}: file too large (${tokens.toLocaleString()} tokens, max ${MAX_FILE_TOKENS.toLocaleString()}). ` +
          `Try a smaller file or attach a subset.`
      );
      continue;
    }

    attachments.push({ filePath: rawPath, content, lines, tokens });
  }

  const cleanedInput = input.replace(AT_MENTION_REGEX, (match, p1: string) => {
    const cleaned = stripTrailingPunctuation(p1);
    if (attachments.some((a) => a.filePath === cleaned)) {
      const trailing = p1.slice(cleaned.length);
      return `[file: ${cleaned}]${trailing}`;
    }
    return match;
  });

  return { cleanedInput, attachments, errors };
}

// ─── Build Context Block for Message ─────────────────────────────────────────

export function buildAttachmentContext(attachments: AtAttachment[]): string {
  if (attachments.length === 0) return "";

  const parts: string[] = [];

  for (const att of attachments) {
    const ext = path.extname(att.filePath).slice(1) || "text";
    parts.push(`File: ${att.filePath} (${att.lines} lines)\n\`\`\`${ext}`);
    parts.push(att.content);
    parts.push("```");
  }

  return parts.join("\n") + "\n\n";
}
