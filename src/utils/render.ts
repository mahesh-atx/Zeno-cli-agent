import { highlight, supportsLanguage } from "cli-highlight";
import {
  applyMarkdown,
  type SyntaxHighlighter,
} from "./markdown";

/**
 * Rendering entry point used by the UI layer.
 *
 * This module is what `src/ui/MessageItem.tsx` and `src/ui/LivePreview.tsx`
 * import (`../utils/render`). It converts markdown text into ANSI-styled
 * strings; the UI then feeds those strings to `<Ansi>` (see `src/ui/Ansi.tsx`)
 * which parses the ANSI back into styled Ink `<Text>` spans.
 *
 * Two modes:
 *   - `renderMarkdown`   — final, complete markdown (used for committed text)
 *   - `renderStreaming`  — may be partial / mid-token; must never throw
 */

// cli-highlight is synchronous when called without a callback, so we can wrap
// it once and reuse it. Loaded lazily on first use to keep startup snappy and
// to degrade gracefully if the package is ever missing.
let cachedHighlighter: SyntaxHighlighter | null | undefined;

export function getHighlighter(): SyntaxHighlighter | null {
  if (cachedHighlighter !== undefined) return cachedHighlighter;
  try {
    cachedHighlighter = {
      highlight,
      supportsLanguage,
    };
  } catch {
    cachedHighlighter = null;
  }
  return cachedHighlighter;
}

/** Render complete markdown to an ANSI string (with syntax highlighting). */
export function renderMarkdown(content: string): string {
  if (!content) return "";
  try {
    return applyMarkdown(content, getHighlighter());
  } catch {
    // Never break rendering — fall back to raw text if the lexer chokes.
    return content;
  }
}

// Cheap test: does this text look like it has any markdown syntax at all?
// Lets us skip lexing + ANSI generation entirely for plain prose.
const HAS_MARKDOWN = /[#*>_`~\-]|\n|```|\[(.+)\]\(|^\s*\d+\.\s/m;

/**
 * Render a (possibly partial) streaming buffer to an ANSI string.
 *
 * Robust against incomplete input: `marked.lexer` treats an unclosed code
 * fence as a single code token, so a half-streamed block won't corrupt the
 * rest of the output. We still wrap in try/catch as a safety net.
 */
export function renderStreaming(content: string): string {
  if (!content) return "";
  // Fast path: plain text passes through untouched.
  if (!HAS_MARKDOWN.test(content)) return content;
  try {
    return applyMarkdown(content, getHighlighter());
  } catch {
    return content;
  }
}

export { applyMarkdown } from "./markdown";
