import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import { highlight } from "cli-highlight";
import chalk from "chalk";

// ─── Setup Marked with Terminal Renderer ──────────────────────────────────────

const renderer = new TerminalRenderer({
  // Code blocks
  code: (code: string, lang: string | undefined) => {
    return renderCodeBlock(code, lang ?? "");
  },
  // Inline code
  codespan: (code: string) => {
    return chalk.bgGray.white(` ${code} `);
  },
  // Headers
  heading: (text: string, level: number) => {
    const colors = [
      chalk.cyan.bold,
      chalk.blue.bold,
      chalk.green.bold,
      chalk.yellow.bold,
    ];
    const color = colors[Math.min(level - 1, colors.length - 1)];
    const prefix = "#".repeat(level);
    return `\n${color(`${prefix} ${text}`)}\n`;
  },
  // Bold
  strong: (text: string) => chalk.bold(text),
  // Italic
  em: (text: string) => chalk.italic(text),
  // Links
  link: (_href: string, _title: string | null, text: string) => {
    return chalk.cyan.underline(text);
  },
  // List items
  listitem: (text: string) => {
    return `  ${chalk.cyan("•")} ${text}\n`;
  },
  // Blockquote
  blockquote: (text: string) => {
    return text
      .split("\n")
      .map((line) => chalk.dim(`│ ${line}`))
      .join("\n");
  },
  // Horizontal rule
  hr: () => chalk.dim("─".repeat(60)) + "\n",
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
  const border = chalk.dim("─".repeat(width));
  const langLabel = lang
    ? chalk.dim.italic(` ${lang}`)
    : "";

  let highlighted: string;

  try {
    if (lang && lang.trim()) {
      highlighted = highlight(code, {
        language: lang,
        ignoreIllegals: true,
        theme: {
          keyword: chalk.cyan,
          built_in: chalk.blue,
          string: chalk.green,
          number: chalk.yellow,
          comment: chalk.dim,
          function: chalk.magenta,
          title: chalk.magenta.bold,
          params: chalk.white,
          type: chalk.blue,
          literal: chalk.yellow,
          variable: chalk.white,
          attr: chalk.cyan,
          meta: chalk.dim,
        },
      });
    } else {
      highlighted = chalk.white(code);
    }
  } catch {
    // Fall back to plain text if language is not supported
    highlighted = chalk.white(code);
  }

  // Add line numbers
  const lines = highlighted.split("\n");
  const lineNumberWidth = String(lines.length).length;

  const numberedLines = lines.map((line, idx) => {
    const lineNum = chalk.dim(
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
    return chalk.bgGray.white(` ${code} `);
  });
}

// ─── Render Diff Line ─────────────────────────────────────────────────────────

export function renderDiffLine(line: string): string {
  if (line.startsWith("+")) {
    return chalk.green(line);
  }
  if (line.startsWith("-")) {
    return chalk.red(line);
  }
  if (line.startsWith("@@")) {
    return chalk.cyan(line);
  }
  return chalk.dim(line);
}