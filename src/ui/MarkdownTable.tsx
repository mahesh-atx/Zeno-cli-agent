import React from "react";
import wrapAnsi from "wrap-ansi";
import type { Token, Tokens } from "marked";
import { Text } from "ink";
import chalk from "chalk";
import {
  stripAnsi,
  stringWidth,
  formatToken,
  padAligned,
  PALETTE,
  type SyntaxHighlighter,
} from "../utils/markdown";

const SAFETY_MARGIN = 4;
const MIN_COLUMN_WIDTH = 3;

type Props = {
  token: Tokens.Table;
  highlight: SyntaxHighlighter | null;
  forceWidth?: number;
};

function wrapText(text: string, width: number, hard = false): string[] {
  if (width <= 0) return [text];
  const trimmedText = text.trimEnd();
  const wrapped = wrapAnsi(trimmedText, width, {
    hard,
    trim: false,
    wordWrap: true,
  });
  const lines = wrapped.split("\n").filter((line) => line.length > 0);
  return lines.length > 0 ? lines : [""];
}

export function MarkdownTable({
  token,
  highlight,
  forceWidth,
}: Props): React.ReactNode {
  // Use stdout columns or fallback to 80
  const actualTerminalWidth = process.stdout.columns || 80;
  const terminalWidth = forceWidth ?? actualTerminalWidth;

  function formatCell(tokens: Token[] | undefined): string {
    return tokens
      ?.map((_) => formatToken(_, 0, null, null, highlight))
      .join("") ?? "";
  }

  function getPlainText(tokens: Token[] | undefined): string {
    return stripAnsi(formatCell(tokens));
  }

  function getMinWidth(tokens: Token[] | undefined): number {
    const text = getPlainText(tokens);
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return MIN_COLUMN_WIDTH;
    return Math.max(...words.map((w) => stringWidth(w)), MIN_COLUMN_WIDTH);
  }

  function getIdealWidth(tokens: Token[] | undefined): number {
    return Math.max(stringWidth(getPlainText(tokens)), MIN_COLUMN_WIDTH);
  }

  const minWidths = token.header.map((header, colIndex) => {
    let maxMinWidth = getMinWidth(header.tokens);
    for (const row of token.rows) {
      maxMinWidth = Math.max(maxMinWidth, getMinWidth(row[colIndex]?.tokens));
    }
    return maxMinWidth;
  });

  const idealWidths = token.header.map((header, colIndex) => {
    let maxIdeal = getIdealWidth(header.tokens);
    for (const row of token.rows) {
      maxIdeal = Math.max(maxIdeal, getIdealWidth(row[colIndex]?.tokens));
    }
    return maxIdeal;
  });

  const numCols = token.header.length;
  const borderOverhead = 1 + numCols * 3; // │ + (2 padding + 1 border) per col
  const availableWidth = Math.max(
    terminalWidth - borderOverhead - SAFETY_MARGIN,
    numCols * MIN_COLUMN_WIDTH
  );

  const totalMin = minWidths.reduce((sum, w) => sum + w, 0);
  const totalIdeal = idealWidths.reduce((sum, w) => sum + w, 0);

  let needsHardWrap = false;
  let columnWidths: number[];

  if (totalIdeal <= availableWidth) {
    columnWidths = idealWidths;
  } else if (totalMin <= availableWidth) {
    const extraSpace = availableWidth - totalMin;
    const overflows = idealWidths.map((ideal, i) => ideal - minWidths[i]!);
    const totalOverflow = overflows.reduce((sum, o) => sum + o, 0);
    columnWidths = minWidths.map((min, i) => {
      if (totalOverflow === 0) return min;
      const extra = Math.floor((overflows[i]! / totalOverflow) * extraSpace);
      return min + extra;
    });
  } else {
    needsHardWrap = true;
    const equalShare = Math.floor(availableWidth / numCols);
    let remaining = availableWidth;
    columnWidths = Array(numCols).fill(0);
    const sortedIndices = idealWidths
      .map((w, i) => ({ w, i }))
      .sort((a, b) => a.w - b.w)
      .map((x) => x.i);

    let colsRemaining = numCols;
    for (const i of sortedIndices) {
      const fairShare = Math.floor(remaining / colsRemaining);
      const width = Math.min(idealWidths[i]!, Math.max(MIN_COLUMN_WIDTH, fairShare));
      columnWidths[i] = width;
      remaining -= width;
      colsRemaining--;
    }

    if (remaining > 0) {
      columnWidths[sortedIndices[sortedIndices.length - 1]!] += remaining;
    }
  }

  const border = chalk.hex(PALETTE.tableBorder);

  // Render to a single ANSI string, but within a React component so it re-renders on resize
  let out = "";
  
  // Top border
  out += border("┌");
  columnWidths.forEach((w, i) => {
    out += border("─".repeat(w + 2));
    out += i === columnWidths.length - 1 ? border("┐") : border("┬");
  });
  out += "\n";

  const tableAlign = token.align;

  function renderRow(cells: Token[][], isHeader: boolean) {
    const wrappedCells = cells.map((cell, i) => {
      const content = formatCell(cell);
      const styledContent = isHeader ? chalk.bold.hex(PALETTE.heading2)(content) : content;
      return wrapText(styledContent, columnWidths[i]!, needsHardWrap);
    });

    const maxLines = Math.max(...wrappedCells.map((lines) => lines.length));
    let rowOut = "";

    for (let lineIndex = 0; lineIndex < maxLines; lineIndex++) {
      rowOut += border("│");
      wrappedCells.forEach((lines, colIndex) => {
        const lineContent = lines[lineIndex] ?? "";
        const rawLine = stripAnsi(lineContent);
        rowOut +=
          " " +
          padAligned(
            lineContent,
            stringWidth(rawLine),
            columnWidths[colIndex]!,
            tableAlign?.[colIndex]
          ) +
          " " +
          border("│");
      });
      rowOut += "\n";
    }
    return rowOut;
  }

  out += renderRow(token.header.map((h) => h.tokens ?? []), true);

  // Middle border
  out += border("├");
  columnWidths.forEach((w, i) => {
    out += border("─".repeat(w + 2));
    out += i === columnWidths.length - 1 ? border("┤") : border("┼");
  });
  out += "\n";

  // Body rows
  token.rows.forEach((row) => {
    out += renderRow(row.map((c) => c.tokens ?? []), false);
  });

  // Bottom border
  out += border("└");
  columnWidths.forEach((w, i) => {
    out += border("─".repeat(w + 2));
    out += i === columnWidths.length - 1 ? border("┘") : border("┴");
  });

  return <Text>{out}</Text>;
}
