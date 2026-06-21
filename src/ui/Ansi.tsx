import React from "react";
import { Text } from "ink";

/**
 * Bridge between ANSI-styled strings (produced by `marked` + `cli-highlight`
 * via `src/utils/markdown.ts`) and Ink's `<Text>` components.
 *
 * Why this exists: stock Ink v4 cannot interpret ANSI escape codes inside
 * `<Text>`. Passing a chalk/cli-highlight string directly to `<Text>` would
 * print the raw escape codes as garbage *and* throw off Ink's width math
 * (which is used for wrapping/alignment). So we parse the SGR sequences back
 * into styled spans and render each span as a nested `<Text>`.
 */

/** Parsed color, in a format Ink's <Text> accepts directly. */
export type InkColor = string | undefined;

interface SpanStyle {
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
  color?: InkColor;
  bg?: InkColor;
}

interface Span {
  text: string;
  style: SpanStyle;
}

// --- Color tables for the SGR parser ---------------------------------------

// Standard 16-color → CSS names Ink understands.
const NAMED: Record<number, string> = {
  30: "black",
  31: "red",
  32: "green",
  33: "yellow",
  34: "blue",
  35: "magenta",
  36: "cyan",
  37: "white",
  90: "gray",
  91: "redBright",
  92: "greenBright",
  93: "yellowBright",
  94: "blueBright",
  95: "magentaBright",
  96: "cyanBright",
  97: "whiteBright",
  40: "black",
  41: "red",
  42: "green",
  43: "yellow",
  44: "blue",
  45: "magenta",
  46: "cyan",
  47: "white",
  100: "gray",
  101: "redBright",
  102: "greenBright",
  103: "yellowBright",
  104: "blueBright",
  105: "magentaBright",
  106: "cyanBright",
  107: "whiteBright",
};

// xterm 256-color palette → hex. Indices 16-231 are a 6x6x6 cube, 232-255 a
// grayscale ramp. Precomputed so highlight.js / cli-highlight output looks
// right even in terminals/CI that don't speak truecolor.
const PALETTE256: readonly string[] = (() => {
  const out: string[] = [];
  const cube = [0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff];
  for (let i = 16; i < 232; i++) {
    const j = i - 16;
    out[i] = `#${cube[(j / 36) | 0].toString(16).padStart(2, "0")}${cube[((j / 6) | 0) % 6].toString(16).padStart(2, "0")}${cube[j % 6].toString(16).padStart(2, "0")}`;
  }
  for (let i = 232; i < 256; i++) {
    const v = 8 + (i - 232) * 10;
    out[i] = `#${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}`;
  }
  return out;
})();

function applySgr(style: SpanStyle, params: number[]): void {
  for (let i = 0; i < params.length; i++) {
    const p = params[i];
    switch (p) {
      case 0:
        // full reset
        delete style.bold;
        delete style.dim;
        delete style.italic;
        delete style.underline;
        delete style.strikethrough;
        delete style.inverse;
        delete style.color;
        delete style.bg;
        break;
      case 1: style.bold = true; break;
      case 2: style.dim = true; break;
      case 3: style.italic = true; break;
      case 4: style.underline = true; break;
      case 7: style.inverse = true; break;
      case 9: style.strikethrough = true; break;
      case 22: delete style.bold; delete style.dim; break;
      case 23: delete style.italic; break;
      case 24: delete style.underline; break;
      case 27: delete style.inverse; break;
      case 29: delete style.strikethrough; break;
      case 39: delete style.color; break;
      case 49: delete style.bg; break;
      case 38:
      case 48: {
        // extended color: truecolor (38;2;r;g;b) or 256 (38;5;n)
        const isBg = p === 48;
        const mode = params[i + 1];
        if (mode === 2) {
          const r = params[i + 2];
          const g = params[i + 3];
          const b = params[i + 4];
          if (r !== undefined && g !== undefined && b !== undefined) {
            if (isBg) style.bg = `rgb(${r},${g},${b})`;
            else style.color = `rgb(${r},${g},${b})`;
            i += 4;
          }
        } else if (mode === 5) {
          const idx = params[i + 2];
          if (idx !== undefined) {
            const hex = idx < 16 ? undefined : PALETTE256[idx];
            if (idx < 16) {
              // rely on the named map for 0-15 via the bg/fg range
              const named = NAMED[idx + 30] ?? NAMED[idx + 90];
              if (named) {
                if (isBg) style.bg = named;
                else style.color = named;
              }
            } else if (hex) {
              if (isBg) style.bg = hex;
              else style.color = hex;
            }
            i += 2;
          }
        }
        break;
      }
      default:
        if (NAMED[p]) {
          if (p >= 30 && p <= 97) style.color = NAMED[p];
          else style.bg = NAMED[p];
        }
        break;
    }
  }
}

/** Parse a string containing SGR escape codes into styled spans. */
export function parseAnsi(input: string): Span[] {
  const spans: Span[] = [];
  const style: SpanStyle = {};
  let buf = "";
  // Match SGR sequences: ESC [ ... m  (only the 'm' final byte matters here).
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    if (match.index > last) buf += input.slice(last, match.index);
    last = re.lastIndex;
    // Flush any pending text with the current style.
    if (buf) {
      pushSpan(spans, buf, style);
      buf = "";
    }
    const params = match[1].length === 0 ? [0] : match[1].split(";").map(Number);
    applySgr(style, params);
  }
  if (last < input.length) buf += input.slice(last);
  if (buf) pushSpan(spans, buf, style);
  return spans;
}

function pushSpan(spans: Span[], text: string, style: SpanStyle): void {
  if (!text) return;
  const last = spans[spans.length - 1];
  if (last && styleEqual(last.style, style)) {
    last.text += text;
  } else {
    spans.push({ text, style: { ...style } });
  }
}

function styleEqual(a: SpanStyle, b: SpanStyle): boolean {
  return (
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough &&
    a.inverse === b.inverse &&
    a.color === b.color &&
    a.bg === b.bg
  );
}

interface AnsiProps {
  /** ANSI-styled string to render. Accepts the usual JSX child forms. */
  children?: string | number | (string | number)[];
  wrap?: "wrap" | "truncate" | "end";
}

/**
 * Renders an ANSI-styled string as a single wrapping Ink `<Text>`, splitting
 * it into nested `<Text>` children per style span. Memoized so streaming
 * re-renders of unchanged prefix text stay cheap.
 */
export const Ansi = React.memo(function Ansi({ children, wrap = "wrap" }: AnsiProps) {
  // Flatten JSX fragment children (string | number | array) into one string.
  const text = Array.isArray(children)
    ? children.join("")
    : children == null
      ? ""
      : String(children);
  if (text === "") return null;
  const spans = parseAnsi(text);
  if (spans.length === 0) return null;

  return (
    <Text wrap={wrap}>
      {spans.map((span, i) => (
        <Text
          key={i}
          color={span.style.color}
          backgroundColor={span.style.bg}
          bold={span.style.bold}
          italic={span.style.italic}
          underline={span.style.underline}
          strikethrough={span.style.strikethrough}
          dimColor={span.style.dim}
          inverse={span.style.inverse}
        >
          {span.text}
        </Text>
      ))}
    </Text>
  );
});
