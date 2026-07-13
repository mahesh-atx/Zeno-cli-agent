import React from 'react';
import { Box, Text } from 'ink';
import type { StructuredPatchHunk } from 'diff';
import { StructuredDiff } from './StructuredDiff.js';

type Props = {
  hunks: StructuredPatchHunk[];
  dim?: boolean;
  width?: number;
  filePath: string;
};

const MAX_LINES_TO_RENDER = 10;

/** Renders a list of diff hunks with ellipsis separators between them. */
export function StructuredDiffList({
  hunks,
  dim = false,
  width = 80,
  filePath,
}: Props): React.ReactNode {
  const processedHunks = hunks.map((hunk) => {
    if (hunk.lines.length > MAX_LINES_TO_RENDER) {
      return {
        ...hunk,
        lines: hunk.lines.slice(0, MAX_LINES_TO_RENDER),
        truncatedCount: hunk.lines.length - MAX_LINES_TO_RENDER
      };
    }
    return hunk;
  });

  return (
    <Box flexDirection="column">
      {processedHunks.map((hunk, index) => (
        <Box flexDirection="column" key={hunk.newStart}>
          <StructuredDiff patch={hunk} dim={dim} width={width} truncatedCount={(hunk as any).truncatedCount} />
          {index < processedHunks.length - 1 && (
            <Box marginLeft={7}>
              <Text dimColor>...</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
