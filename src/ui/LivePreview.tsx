import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { ToolOutput } from "./ToolOutput";
import type { ToolCall } from "./ToolOutput";
import { renderStreaming } from "../utils/render";

interface LivePreviewProps {
  text: string;
  activeTool: ToolCall | null;
  thinkingOnly?: boolean;
}

// Max lines shown in the live preview. Anything beyond this scrolls within
// the preview window itself (we tail the latest lines).
const MAX_PREVIEW_LINES = 12;

export function LivePreview({ text, activeTool, thinkingOnly }: LivePreviewProps) {
  if (thinkingOnly) {
    return (
      <Box marginTop={1} paddingX={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text color="cyan" bold> Thinking</Text>
        <Text color="gray">…</Text>
      </Box>
    );
  }

  if (activeTool) {
    return (
      <Box marginTop={1} paddingX={1} flexDirection="column">
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="cyan" bold> Running {activeTool.toolName}</Text>
        </Box>
      </Box>
    );
  }

  // Streaming text — show only the tail so the preview has bounded height
  const rendered = renderStreaming(text);
  const lines = rendered.split("\n");
  const tail = lines.slice(-MAX_PREVIEW_LINES);
  const hasOverflow = lines.length > MAX_PREVIEW_LINES;

  return (
    <Box marginTop={1} paddingX={1} flexDirection="column">
      <Box>
        <Text color="cyan" bold>✻ </Text>
        <Text color="gray" dimColor>
          {hasOverflow
            ? `streaming (showing last ${MAX_PREVIEW_LINES} of ${lines.length} lines)…`
            : "streaming…"}
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        {tail.map((line, i) => (
          <Text key={i} wrap="wrap">
            {line}
            {i === tail.length - 1 && <Text color="cyan">▊</Text>}
          </Text>
        ))}
      </Box>
    </Box>
  );
}