import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { diffWordsWithSpace, type StructuredPatchHunk } from 'diff';
import { Colors } from '../../themes/colors.js';

interface DiffLine {
  code: string;
  type: 'add' | 'remove' | 'nochange';
  i: number;
  originalCode: string;
  wordDiff?: boolean;
  matchedLine?: DiffLine;
}

export interface LineObject {
  code: string;
  i: number;
  type: 'add' | 'remove' | 'nochange';
  originalCode: string;
  wordDiff?: boolean;
  matchedLine?: LineObject;
}

interface DiffPart {
  added?: boolean;
  removed?: boolean;
  value: string;
}

type Props = {
  patch: StructuredPatchHunk;
  dim?: boolean;
  width?: number; // Optional, falling back to 80 if not provided
  truncatedCount?: number;
};

const CHANGE_THRESHOLD = 0.4;

function stringWidth(str: string): number {
  // A simplistic string width function. For a real terminal it should handle ansi and wide chars.
  // We use a basic length for now.
  return str.length;
}

function wrapText(text: string, width: number): string {
  if (width <= 0) return text;
  const lines: string[] = [];
  let currentLine = '';
  for (let i = 0; i < text.length; i++) {
    currentLine += text[i];
    if (stringWidth(currentLine) >= width) {
      lines.push(currentLine);
      currentLine = '';
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.join('\n');
}

export function transformLinesToObjects(lines: string[]): LineObject[] {
  return lines.map((code) => {
    if (code.startsWith('+')) {
      return {
        code: code.slice(1),
        i: 0,
        type: 'add',
        originalCode: code.slice(1),
      };
    }
    if (code.startsWith('-')) {
      return {
        code: code.slice(1),
        i: 0,
        type: 'remove',
        originalCode: code.slice(1),
      };
    }
    return {
      code: code.slice(1),
      i: 0,
      type: 'nochange',
      originalCode: code.slice(1),
    };
  });
}

export function processAdjacentLines(lineObjects: LineObject[]): LineObject[] {
  const processedLines: LineObject[] = [];
  let i = 0;
  while (i < lineObjects.length) {
    const current = lineObjects[i];
    if (!current) {
      i++;
      continue;
    }

    if (current.type === 'remove') {
      const removeLines: LineObject[] = [current];
      let j = i + 1;

      while (j < lineObjects.length && lineObjects[j]?.type === 'remove') {
        const line = lineObjects[j];
        if (line) {
          removeLines.push(line);
        }
        j++;
      }

      const addLines: LineObject[] = [];
      while (j < lineObjects.length && lineObjects[j]?.type === 'add') {
        const line = lineObjects[j];
        if (line) {
          addLines.push(line);
        }
        j++;
      }

      if (removeLines.length > 0 && addLines.length > 0) {
        const pairCount = Math.min(removeLines.length, addLines.length);

        for (let k = 0; k < pairCount; k++) {
          const removeLine = removeLines[k];
          const addLine = addLines[k];
          if (removeLine && addLine) {
            removeLine.wordDiff = true;
            addLine.wordDiff = true;
            removeLine.matchedLine = addLine;
            addLine.matchedLine = removeLine;
          }
        }

        processedLines.push(...removeLines.filter(Boolean));
        processedLines.push(...addLines.filter(Boolean));
        i = j;
      } else {
        processedLines.push(current);
        i++;
      }
    } else {
      processedLines.push(current);
      i++;
    }
  }
  return processedLines;
}

export function calculateWordDiffs(oldText: string, newText: string): DiffPart[] {
  return diffWordsWithSpace(oldText, newText, { ignoreCase: false });
}

function generateWordDiffElements(
  item: DiffLine,
  width: number,
  maxWidth: number,
  dim: boolean
): React.ReactNode[] | null {
  const { type, i, wordDiff, matchedLine, originalCode } = item;
  if (!wordDiff || !matchedLine) {
    return null;
  }
  const removedLineText = type === 'remove' ? originalCode : matchedLine.originalCode;
  const addedLineText = type === 'remove' ? matchedLine.originalCode : originalCode;
  const wordDiffs = calculateWordDiffs(removedLineText, addedLineText);

  const totalLength = removedLineText.length + addedLineText.length;
  const changedLength = wordDiffs
    .filter((part) => part.added || part.removed)
    .reduce((sum, part) => sum + part.value.length, 0);
  const changeRatio = totalLength > 0 ? changedLength / totalLength : 0;
  
  if (changeRatio > CHANGE_THRESHOLD || dim) {
    return null;
  }

  const diffPrefix = type === 'add' ? '+ ' : '- ';
  const diffPrefixWidth = 2;
  const availableContentWidth = Math.max(1, width - maxWidth - 1 - diffPrefixWidth);

  const wrappedLines: { content: React.ReactNode[]; contentWidth: number }[] = [];
  let currentLine: React.ReactNode[] = [];
  let currentLineWidth = 0;

  wordDiffs.forEach((part, partIndex) => {
    let shouldShow = false;
    let partBgColor: string | undefined;
    
    if (type === 'add') {
      if (part.added) {
        shouldShow = true;
        partBgColor = '#005f00'; // Darker green for the specific word
      } else if (!part.removed) {
        shouldShow = true;
      }
    } else if (type === 'remove') {
      if (part.removed) {
        shouldShow = true;
        partBgColor = '#5f0000'; // Darker red for the specific word
      } else if (!part.added) {
        shouldShow = true;
      }
    }
    
    if (!shouldShow) return;

    const partWrapped = wrapText(part.value, availableContentWidth);
    const partLines = partWrapped.split('\n');
    
    partLines.forEach((partLine, lineIdx) => {
      if (partLine === undefined) return;

      if (lineIdx > 0 || currentLineWidth + stringWidth(partLine) > availableContentWidth) {
        if (currentLine.length > 0) {
          wrappedLines.push({ content: [...currentLine], contentWidth: currentLineWidth });
          currentLine = [];
          currentLineWidth = 0;
        }
      }
      currentLine.push(
        <Text key={`part-${partIndex}-${lineIdx}`} backgroundColor={partBgColor}>
          {partLine}
        </Text>
      );
      currentLineWidth += stringWidth(partLine);
    });
  });
  
  if (currentLine.length > 0) {
    wrappedLines.push({ content: currentLine, contentWidth: currentLineWidth });
  }

  return wrappedLines.map(({ content, contentWidth }, lineIndex) => {
    const key = `${type}-${i}-${lineIndex}`;
    const lineBgColor = type === 'add' ? (dim ? '#003300' : '#002200') : (dim ? '#330000' : '#220000');
    const lineNum = lineIndex === 0 ? i : undefined;
    const lineNumStr = (lineNum !== undefined ? lineNum.toString().padStart(maxWidth) : ' '.repeat(maxWidth)) + ' ';
    const usedWidth = lineNumStr.length + diffPrefixWidth + contentWidth;
    const padding = Math.max(0, width - usedWidth);

    return (
      <Box key={key} flexDirection="row">
        <Text backgroundColor={lineBgColor} dimColor={dim}>
          {lineNumStr}
          {diffPrefix}
        </Text>
        <Text backgroundColor={lineBgColor} dimColor={dim}>
          {content}
          {' '.repeat(padding)}
        </Text>
      </Box>
    );
  });
}

function formatDiff(
  lines: string[],
  startingLineNumber: number,
  width: number,
  dim: boolean
): React.ReactNode[] {
  const safeWidth = Math.max(1, Math.floor(width));
  const lineObjects = transformLinesToObjects(lines);
  const processedLines = processAdjacentLines(lineObjects);
  const ls = numberDiffLines(processedLines, startingLineNumber);

  const maxLineNumber = Math.max(...ls.map(({ i }) => i), 0);
  const maxWidth = Math.max(maxLineNumber.toString().length + 1, 0);

  return ls.flatMap((item): React.ReactNode[] => {
    const { type, code, i, wordDiff, matchedLine } = item;

    if (wordDiff && matchedLine) {
      const wordDiffElements = generateWordDiffElements(item, safeWidth, maxWidth, dim);
      if (wordDiffElements !== null) {
        return wordDiffElements;
      }
    }

    const diffPrefixWidth = 2; // "  " for unchanged, "+ " or "- " for changes
    const availableContentWidth = Math.max(1, safeWidth - maxWidth - 1 - diffPrefixWidth);
    const wrappedText = wrapText(code, availableContentWidth);
    const wrappedLines = wrappedText.split('\n');

    return wrappedLines.map((line, lineIndex) => {
      const key = `${type}-${i}-${lineIndex}`;
      const lineNum = lineIndex === 0 ? i : undefined;
      const lineNumStr = (lineNum !== undefined ? lineNum.toString().padStart(maxWidth) : ' '.repeat(maxWidth)) + ' ';
      const sigil = type === 'add' ? '+ ' : type === 'remove' ? '- ' : '  ';
      
      const contentWidth = lineNumStr.length + 1 + stringWidth(line);
      const padding = Math.max(0, safeWidth - contentWidth);
      
      const bgColor = type === 'add' ? (dim ? '#003300' : '#002200') : type === 'remove' ? (dim ? '#330000' : '#220000') : undefined;

      return (
        <Box key={key} flexDirection="row">
          <Text backgroundColor={bgColor} dimColor={dim || type === 'nochange'}>
            {lineNumStr}
            {sigil}
          </Text>
          <Text backgroundColor={bgColor} dimColor={dim}>
            {line}
            {' '.repeat(padding)}
          </Text>
        </Box>
      );
    });
  });
}

export function numberDiffLines(diff: LineObject[], startLine: number): DiffLine[] {
  let i = startLine;
  const result: DiffLine[] = [];
  const queue = [...diff];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    const { code, type, originalCode, wordDiff, matchedLine } = current;
    const line = { code, type, i, originalCode, wordDiff, matchedLine };

    switch (type) {
      case 'nochange':
        i++;
        result.push(line);
        break;
      case 'add':
        i++;
        result.push(line);
        break;
      case 'remove': {
        result.push(line);
        let numRemoved = 0;
        while (queue[0]?.type === 'remove') {
          i++;
          const nxt = queue.shift()!;
          result.push({
            code: nxt.code,
            type: nxt.type,
            i,
            originalCode: nxt.originalCode,
            wordDiff: nxt.wordDiff,
            matchedLine: nxt.matchedLine,
          });
          numRemoved++;
        }
        i -= numRemoved;
        break;
      }
    }
  }
  return result;
}

export function StructuredDiff({ patch, dim = false, width = 80, truncatedCount }: Props) {
  const diffNodes = useMemo(() => {
    return formatDiff(patch.lines, patch.oldStart, width, dim);
  }, [patch.lines, patch.oldStart, width, dim]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {diffNodes.map((node, i) => (
        <Box key={i}>{node}</Box>
      ))}
      {truncatedCount && truncatedCount > 0 ? (
        <Box marginLeft={10}>
          <Text dimColor>... ({truncatedCount} more lines)</Text>
        </Box>
      ) : null}
    </Box>
  );
}
