import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import { highlight } from "cli-highlight";

// ─── Simple ANSI Color Helper ─────────────────────────────────────────────────
// Replaces 'chalk' with zero dependencies by using standard ANSI escape codes.

const ansi = {
  bold: (t: string) => `\x1b[1m${t}\x1b[22m`,
  dim: (t: string) => `\x1b[2m${t}\x1b[22m`,
  italic: (t: string) => `\x1b[3m${t}\x1b[23m`,
  underline: (t: string) => `\x1b[4m${t}\x1b[24m`,
  red: (t: string) => `\x1b[31m${t}\x1b[39m`,
  green: (t: string) => `\x1b[32m${t}\x1b[39m`,
  yellow: (t: string) => `\x1b[33m${t}\x1b[39m`,
  blue: (t: string) => `\x1b[34m${t}\x1b[39m`,
  magenta: (t: string) => `\x1b[35m${t}\x1b[39m`,
  cyan: (t: string) => `\x1b[36m${t}\x1b[39m`,
  white: (t: string) => `\x1b[37m${t}\x1b[39m`,
  bgGrayWhite: (t: string) => `\x1b[100m\x1b[37m${t}\x1b[39m\x1b[49m`,
  cyanBold: (t: string) => `\x1b[36m\x1b[1m${t}\x1b[22m\x1b[39m`,
  blueBold: (t: string) => `\x1b[34m\x1b[1m${t}\x1b[22m\x1b[39m`,
  greenBold: (t: string) => `\x1b[32m\x1b[1m${t}\x1b[22m\x1b[39m`,
  yellowBold: (t: string) => `\x1b[33m\x1b[1m${t}\x1b[22m\x1b[39m`,
  magentaBold: (t: string) => `\x1b[35m\x1b[1m${t}\x1b[22m\x1b[39m`,
  cyanUnderline: (t: string) => `\x1b[36m\x1b[4m${t}\x1b[24m\x1b[39m`,
  dimItalic: (t: string) => `\x1b[2m\x1b[3m${t}\x1b[23m\x1b[22m`,
};

// ─── Setup Marked with Terminal Renderer ──────────────────────────────────────

const renderer = new TerminalRenderer({
  // Code blocks
  code: (code: string, lang: string | undefined) => {
    return renderCodeBlock(code, lang ?? "");
  },
  // Inline code
  codespan: (code: string) => {
    return ansi.bgGrayWhite(` ${code} `);
  },
  // Headers
  heading: (text: string, level: number) => {
    const colors = [
      ansi.cyanBold,
      ansi.blueBold,
      ansi.greenBold,
      ansi.yellowBold,
    ];
    const color = colors[Math.min(level - 1, colors.length - 1)];
    const prefix = "#".repeat(level);
    return `\n${color(`${prefix} ${text}`)}\n`;
  },
  // Bold
  strong: (text: string) => ansi.bold(text),
  // Italic
  em: (text: string) => ansi.italic(text),
  // Links
  link: (_href: string, _title: string | null, text: string) => {
    return ansi.cyanUnderline(text);
  },
  // List items
  listitem: (text: string) => {
    return `  ${ansi.cyan("•")} ${text}\n`;
  },
  // Blockquote
  blockquote: (text: string) => {
    return text
      .split("\n")
      .map((line) => ansi.dim(`│ ${line}`))
      .join("\n");
  },
  // Horizontal rule
  hr: () => ansi.dim("─".repeat(60)) + "\n",
  // Paragraph
  paragraph: (text: string) => `${text}\n`,
  // Table
  table: (header: string, body: string) => {
    return `\n${header}\n${body}\n`;
  },
} as any);

// Apply the renderer
(marked as unknown as { setOptions: (opts: object) => void }).setOptions({
  renderer,
});

// ─── Code Block Renderer ──────────────────────────────────────────────────────

export function renderCodeBlock(code: string, lang: string): string {
  const width = Math.min(process.stdout.columns ?? 80, 100);
  const border = ansi.dim("─".repeat(width));
  const langLabel = lang
    ? ansi.dimItalic(` ${lang}`)
    : "";

  let highlighted: string;

  try {
    if (lang && lang.trim()) {
      highlighted = highlight(code, {
        language: lang,
        ignoreIllegals: true,
        theme: {
          keyword: ansi.cyan,
          built_in: ansi.blue,
          string: ansi.green,
          number: ansi.yellow,
          comment: ansi.dim,
          function: ansi.magenta,
          title: ansi.magentaBold,
          params: ansi.white,
          type: ansi.blue,
          literal: ansi.yellow,
          variable: ansi.white,
          attr: ansi.cyan,
          meta: ansi.dim,
        },
      });
    } else {
      highlighted = ansi.white(code);
    }
  } catch {
    // Fall back to plain text if language is not supported
    highlighted = ansi.white(code);
  }

  // Add line numbers
  const lines = highlighted.split("\n");
  const lineNumberWidth = String(lines.length).length;

  const numberedLines = lines.map((line, idx) => {
    const lineNum = ansi.dim(
      String(idx + 1).padStart(lineNumberWidth, " ")
    );
    return `${lineNum}  ${line}`;
  });

  return (
    `\n${border}${langLabel}\n` +
    numberedLines.join("\n") +
    `\n${border}\n`
  );
}

// ─── Render Markdown ──────────────────────────────────────────────────────────

export function renderMarkdown(text: string): string {
  try {
    const result = marked(text);
    // marked can return string | Promise<string>
    // In sync mode with no async extensions it always returns string
    if (typeof result === "string") {
      return result;
    }
    return text;
  } catch {
    return text;
  }
}

// ─── Render Inline (no markdown parsing, just highlight codeblocks) ───────────

export function renderStreaming(text: string): string {
  // During streaming we do lightweight rendering
  // Replace inline code with highlighted version
  return text.replace(/`([^`]+)`/g, (_, code) => {
    return ansi.bgGrayWhite(` ${code} `);
  });
}

// ─── Render Diff Line ─────────────────────────────────────────────────────────

export function renderDiffLine(line: string): string {
  if (line.startsWith("+")) {
    return ansi.green(line);
  }
  if (line.startsWith("-")) {
    return ansi.red(line);
  }
  if (line.startsWith("@@")) {
    return ansi.cyan(line);
  }
  return ansi.dim(line);
}