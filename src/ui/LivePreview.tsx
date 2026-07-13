import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { ToolOutput } from "./ToolOutput";
import type { ToolCall } from "./ToolOutput";
import { Ansi } from "./Ansi";
import { renderStreaming } from "../utils/render";
import { Colors } from "../themes/colors";

interface LivePreviewProps {
  text: string;
  activeTool: ToolCall | null;
  thinkingOnly?: boolean;
  hideIcon?: boolean;
}

// Max lines shown in the live preview. Anything beyond this scrolls within
// the preview window itself (we tail the latest lines).
const MAX_PREVIEW_LINES = 12;

export function LivePreview({ text, activeTool, thinkingOnly, hideIcon }: LivePreviewProps) {
  if (thinkingOnly) {
    return (
      <Box marginTop={1} paddingX={0}>
        <Text color={Colors.AccentYellow}>
          <Spinner type="dots" />
        </Text>
        <Text color={Colors.AccentYellow} bold> Thinking...</Text>
      </Box>
    );
  }

  if (activeTool) {
    return (
      <Box marginTop={hideIcon ? 0 : 1} flexDirection="column">
        <ToolOutput toolCall={activeTool} />
      </Box>
    );
  }

  // Streaming text — show only the tail so the preview has bounded height.
  // Tail the *raw* text first so fenced code blocks / paragraphs aren't split
  // mid-span, then markdown-render the visible tail.
  const rawLines = text.split("\n");
  const tail = rawLines.slice(-MAX_PREVIEW_LINES);
  const hasOverflow = rawLines.length > MAX_PREVIEW_LINES;
  const rendered = renderStreaming(tail.join("\n"));

  return (
    <Box marginTop={hideIcon ? 0 : 1} paddingX={0} flexDirection="column">
      <Box>
        <Text color={Colors.AccentYellow}>
          <Spinner type="dots" />
        </Text>
        <Text color={Colors.AccentYellow} bold> Streaming...</Text>
        <Text color={Colors.Gray} dimColor>
          {hasOverflow
            ? ` (showing last ${MAX_PREVIEW_LINES} of ${rawLines.length} lines)`
            : ""}
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        <Ansi wrap="wrap">
          {rendered}
          {"\u258a"}
        </Ansi>
      </Box>
    </Box>
  );
}