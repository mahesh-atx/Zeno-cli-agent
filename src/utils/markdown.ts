import chalk from "chalk";
import { marked, type Token, type Tokens } from "marked";

/**
 * Markdown → ANSI renderer.
 *
 * Architecture (ported from the openclaude reference project, adapted for
 * this codebase): `marked` is used *only* as a lexer. Each token is walked by
 * a hand-written recursive `formatToken` that returns a `chalk`-styled string.
 * Fenced code blocks are syntax-highlighted via `cli-highlight`. The caller
 * is responsible for turning the resulting ANSI string into styled output
 * (see `src/ui/Ansi.tsx`).
 *
 * `marked-terminal` is intentionally NOT used — it can't be re-parsed into
 * Ink <Text> spans, so wrapping/width measurement would break.
 */

// Use \n unconditionally — os.EOL is \r\n on Windows, and the extra \r breaks
// Ink's measurement of styled text, causing it to shift right.
const EOL = "\n";

// chalk auto-disables colors when stdout isn't a TTY (e.g. under Ink's custom
// stdout). Our whole pipeline depends on ANSI codes being present so the
// `<Ansi>` component has something to parse back into styled spans. Force at
// least basic color support; prefer truecolor (level 3) where the terminal
// advertises it.
type ChalkLevel = 0 | 1 | 2 | 3;
chalk.level = Math.max(chalk.level, supportsTruecolor() ? 3 : 1) as ChalkLevel;

function supportsTruecolor(): boolean {
  const c = process.env.COLORTERM;
  return c === "truecolor" || c === "24bit";
}

// Dim vertical bar drawn to the left of blockquote text.
const BLOCKQUOTE_BAR = "\u258e"; // ▎

/** Minimal surface of cli-highlight we depend on. */
export interface SyntaxHighlighter {
  highlight: (code: string, opts?: { language?: string }) => string;
  supportsLanguage: (lang: string) => boolean;
}

/**
 * Single tunable place for all the colors the renderer uses. Everything is a
 * hex string consumed by chalk (which supports truecolor). Tweak here to
 * re-theme without touching the renderer logic.
 */
import { Colors } from "../themes/colors";

export const PALETTE = {
  get heading1() { return Colors.AccentCyan; },
  get heading2() { return Colors.AccentYellow; },
  get heading3() { return Colors.AccentPurple; },
  strong: undefined,
  em: undefined,
  get inlineCodeFg() { return Colors.Background; },
  get inlineCodeBg() { return Colors.AccentBlue; },
  get blockquoteBar() { return Colors.Gray; },
  blockquoteText: undefined,
  get link() { return Colors.AccentBlue; },
  get hr() { return Colors.DarkGray; },
  get bullet() { return Colors.Comment; },
  get tableBorder() { return Colors.DarkGray; },
  get codeBorder() { return Colors.DarkGray; },
};

let markedConfigured = false;

export function configureMarked(): void {
  if (markedConfigured) return;
  markedConfigured = true;

  // Disable strikethrough parsing — the model often writes ~ for "approximate"
  // (e.g. ~100) and rarely intends actual strikethrough formatting.
  marked.use({
    tokenizer: {
      del(this: unknown) {
        return undefined;
      },
    },
  });
}

/**
 * Render a markdown string to an ANSI-styled string. `highlight` may be null
 * to disable code-block syntax coloring (plain text then).
 */
export function applyMarkdown(
  content: string,
  highlight: SyntaxHighlighter | null = null,
): string {
  configureMarked();
  return marked
    .lexer(content)
    .map((t) => formatToken(t, 0, null, null, highlight))
    .join("")
    .trim();
}

/** Strip ANSI escape sequences (SGR only — enough for width math). */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Approximate visible width (grapheme count on the stripped string). */
function stringWidth(str: string): number {
  return [...stripAnsi(str)].length;
}

function hexToAnsiCode(hex: string): string {
  if (!hex) return "";
  return chalk.hex(hex)("X").split("X")[0] || "";
}

function remapSyntaxHighlightColors(str: string): string {
  return str.replace(/\x1b\[(\d+)m/g, (match, p1) => {
    const code = parseInt(p1, 10);
    switch (code) {
      case 31: return hexToAnsiCode(Colors.AccentRed);
      case 32: return hexToAnsiCode(Colors.AccentGreen);
      case 33: return hexToAnsiCode(Colors.AccentYellow);
      case 34: return hexToAnsiCode(Colors.AccentBlue);
      case 35: return hexToAnsiCode(Colors.AccentPurple);
      case 36: return hexToAnsiCode(Colors.AccentCyan);
      case 37: return hexToAnsiCode(Colors.Foreground);
      case 39: return hexToAnsiCode(Colors.Foreground);
      case 90: return hexToAnsiCode(Colors.Gray);
      default: return match;
    }
  });
}

export function formatToken(
  token: Token,
  listDepth = 0,
  orderedListNumber: number | null = null,
  parent: Token | null = null,
  highlight: SyntaxHighlighter | null = null,
): string {
  switch (token.type) {
    case "blockquote": {
      const inner = (token.tokens ?? [])
        .map((t) => formatToken(t, 0, null, null, highlight))
        .join("");
      const bar = chalk.hex(PALETTE.blockquoteBar)(BLOCKQUOTE_BAR);
      return inner
        .split(EOL)
        .map((line) =>
          stripAnsi(line).trim() ? `${bar} ${chalk.italic.dim(line)}` : line,
        )
        .join(EOL) + EOL;
    }
    case "code": {
      const codeToken = token as Tokens.Code;
      let language = "plaintext";
      let codeToRender = codeToken.text;
      if (highlight) {
        if (codeToken.lang && highlight.supportsLanguage(codeToken.lang)) {
          language = codeToken.lang;
        }
        codeToRender = remapSyntaxHighlightColors(highlight.highlight(codeToken.text, { language }));
      } else if (codeToken.lang) {
        language = codeToken.lang;
      }
      
      const codeLines = codeToRender.replace(/\n$/, "").split("\n");
      const border = chalk.hex(PALETTE.codeBorder);
      const topBarLen = 50;
      const langText = language ? ` ${language} ` : " ";
      const dashCount = Math.max(2, topBarLen - stripAnsi(langText).length - 2);
      const topBorder = border(`╭─${chalk.bold(langText)}${"─".repeat(dashCount)}`);
      const bottomBorder = border(`╰${"─".repeat(topBarLen)}`);
      
      let out = topBorder + EOL;
      for (const line of codeLines) {
        out += border("│ ") + line + EOL;
      }
      out += bottomBorder + EOL;
      return out;
    }
    case "codespan": {
      // Inline "code" pill — background + readable foreground.
      const fg = chalk.hex(PALETTE.inlineCodeFg);
      const bg = chalk.bgHex(PALETTE.inlineCodeBg);
      return bg(fg(` ${token.text} `));
    }
    case "em":
      return chalk.italic(
        (token.tokens ?? [])
          .map((t) => formatToken(t, 0, null, parent, highlight))
          .join(""),
      );
    case "strong":
      return chalk.bold(
        (token.tokens ?? [])
          .map((t) => formatToken(t, 0, null, parent, highlight))
          .join(""),
      );
    case "heading": {
      const h = token as Tokens.Heading;
      const inner = (h.tokens ?? [])
        .map((t) => formatToken(t, 0, null, null, highlight))
        .join("");
      const colorFor =
        h.depth === 1
          ? PALETTE.heading1
          : h.depth === 2
            ? PALETTE.heading2
            : PALETTE.heading3;
      const styled =
        h.depth === 1
          ? chalk.hex(colorFor).bold.underline(inner)
          : chalk.hex(colorFor).bold(inner);
      return styled + EOL + EOL;
    }
    case "hr":
      return chalk.hex(PALETTE.hr)("──────────────────────────────────────────────────") + EOL;
    case "image":
      return token.href;
    case "link": {
      const linkToken = token as Tokens.Link;
      if (linkToken.href.startsWith("mailto:")) {
        return linkToken.href.replace(/^mailto:/, "");
      }
      const text = (linkToken.tokens ?? [])
        .map((t) => formatToken(t, 0, null, linkToken, highlight))
        .join("");
      const plain = stripAnsi(text);
      // If display text differs from the URL, show "text (url)"; else just url.
      if (plain && plain !== linkToken.href) {
        return `${chalk.hex(PALETTE.link).underline(text)} ${chalk.hex(PALETTE.link).dim(`(${linkToken.href})`)}`;
      }
      return chalk.hex(PALETTE.link).underline(linkToken.href);
    }
    case "list": {
      const listToken = token as Tokens.List;
      // marked types `start` as `number | ''`; coerce ''/missing to 1.
      const startNum =
        listToken.ordered && typeof listToken.start === "number"
          ? listToken.start
          : 1;
      return listToken.items
        .map((item, index) =>
          formatToken(
            item,
            listDepth,
            listToken.ordered ? startNum + index : null,
            listToken,
            highlight,
          ),
        )
        .join("");
    }
    case "list_item": {
      const indent = "  ".repeat(listDepth);
      return (token.tokens ?? [])
        .map((t) => {
          const rendered = formatToken(t, listDepth + 1, orderedListNumber, token, highlight);
          return rendered
            .split(EOL)
            .map((line, idx, arr) => {
              // Don't indent the trailing empty string from the last EOL
              if (idx === arr.length - 1 && line === "") return line;
              return indent + line;
            })
            .join(EOL);
        })
        .join("");
    }
    case "paragraph": {
      return (
        (token.tokens ?? [])
          .map((t) => formatToken(t, 0, null, null, highlight))
          .join("") + EOL
      );
    }
    case "space":
      return EOL;
    case "br":
      return EOL;
    case "text": {
      if (parent?.type === "link") {
        // Already inside a markdown link — the link handler wraps it.
        return token.text;
      }
      if (parent?.type === "list_item") {
        let bulletStr = "-";
        if (orderedListNumber === null) {
          switch (listDepth) {
            case 1: bulletStr = "•"; break;
            case 2: bulletStr = "◦"; break;
            default: bulletStr = "▪"; break;
          }
        } else {
          bulletStr = `${getListNumber(listDepth, orderedListNumber)}.`;
        }
        const bullet = chalk.hex(PALETTE.bullet)(bulletStr);
        const inner = token.tokens
          ? token.tokens
              .map((t) => formatToken(t, listDepth, orderedListNumber, token, highlight))
              .join("")
          : token.text;
        return `${bullet} ${inner}${EOL}`;
      }
      return token.text;
    }
    case "table": {
      return renderTable(token as Tokens.Table, highlight) + EOL;
    }
    case "escape":
      return token.text;
    case "def":
    case "del":
    case "html":
      // These token types are not rendered.
      return "";
    default:
      return "";
  }
}

function renderTable(
  table: Tokens.Table,
  highlight: SyntaxHighlighter | null,
): string {
  const display = (tokens: Token[] | undefined): string =>
    stripAnsi(
      (tokens ?? [])
        .map((t) => formatToken(t, 0, null, null, highlight))
        .join(""),
    );

  const columnWidths = table.header.map((header, index) => {
    let max = stringWidth(display(header.tokens));
    for (const row of table.rows) {
      max = Math.max(max, stringWidth(display(row[index]?.tokens)));
    }
    return Math.max(max, 3);
  });

  const border = chalk.hex(PALETTE.tableBorder);

  // Top border
  let out = border("┌");
  columnWidths.forEach((w, i) => {
    out += border("─".repeat(w + 2));
    out += i === columnWidths.length - 1 ? border("┐") : border("┬");
  });
  out += EOL;

  // Header row
  out += border("│");
  table.header.forEach((header, index) => {
    const content =
      (header.tokens ?? [])
        .map((t) => formatToken(t, 0, null, null, highlight))
        .join("") ?? "";
    const styledContent = chalk.bold.hex(PALETTE.heading2)(content);
    const rawContent = stripAnsi(content);
    out += " " + padAligned(styledContent, stringWidth(rawContent), columnWidths[index]!, table.align?.[index]) + " " + border("│");
  });
  out += EOL;

  // Middle border
  out += border("├");
  columnWidths.forEach((w, i) => {
    out += border("─".repeat(w + 2));
    out += i === columnWidths.length - 1 ? border("┤") : border("┼");
  });
  out += EOL;

  // Body rows
  table.rows.forEach((row) => {
    out += border("│");
    row.forEach((cell, index) => {
      const content =
        (cell.tokens ?? [])
          .map((t) => formatToken(t, 0, null, null, highlight))
          .join("") ?? "";
      const rawContent = stripAnsi(content);
      out += " " + padAligned(content, stringWidth(rawContent), columnWidths[index]!, table.align?.[index]) + " " + border("│");
    });
    out += EOL;
  });

  // Bottom border
  out += border("└");
  columnWidths.forEach((w, i) => {
    out += border("─".repeat(w + 2));
    out += i === columnWidths.length - 1 ? border("┘") : border("┴");
  });

  return out;
}

/**
 * Pad `content` to `targetWidth` according to alignment. `displayWidth` is the
 * visible width of `content` (caller computes it on ANSI-stripped text so the
 * escape codes don't affect padding).
 */
export function padAligned(
  content: string,
  displayWidth: number,
  targetWidth: number,
  align: "left" | "center" | "right" | null | undefined,
): string {
  const padding = Math.max(0, targetWidth - displayWidth);
  if (align === "center") {
    const left = Math.floor(padding / 2);
    return " ".repeat(left) + content + " ".repeat(padding - left);
  }
  if (align === "right") {
    return " ".repeat(padding) + content;
  }
  return content + " ".repeat(padding);
}

function numberToLetter(n: number): string {
  let result = "";
  while (n > 0) {
    n--;
    result = String.fromCharCode(97 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

const ROMAN_VALUES: ReadonlyArray<[number, string]> = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

function numberToRoman(n: number): string {
  let result = "";
  for (const [value, numeral] of ROMAN_VALUES) {
    while (n >= value) {
      result += numeral;
      n -= value;
    }
  }
  return result;
}

function getListNumber(listDepth: number, n: number): string {
  switch (listDepth) {
    case 0:
    case 1:
      return n.toString();
    case 2:
      return numberToLetter(n);
    case 3:
      return numberToRoman(n);
    default:
      return n.toString();
  }
}
