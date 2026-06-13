import React from "react";
import { Box, Text } from "ink";
import { formatTokenCount } from "../utils/tokens";

interface StatusLineProps {
  provider: string;
  model: string;
  tokenCount: number;
  tokenLimit: number;
  contextFileCount?: number;
}

function getTokenColor(
  used: number,
  limit: number
): "green" | "yellow" | "red" {
  const pct = limit > 0 ? used / limit : 0;
  if (pct >= 0.8) return "red";
  if (pct >= 0.5) return "yellow";
  return "green";
}

export function StatusLine({
  provider,
  model,
  tokenCount,
  tokenLimit,
  contextFileCount = 0,
}: StatusLineProps) {
  const tokenColor = getTokenColor(tokenCount, tokenLimit);
  const pct =
    tokenLimit > 0 ? ((tokenCount / tokenLimit) * 100).toFixed(0) : "0";

  // Use a single line of text rather than flexbox with justifyContent.
  // This avoids re-layout when terminal width fluctuates.
  return (
    <Box paddingX={1}>
      <Text color="gray" dimColor>? for shortcuts </Text>
      <Text color="gray">· </Text>
      <Text color="cyan">{provider}</Text>
      <Text color="gray">/</Text>
      <Text color="green">{model}</Text>
      {contextFileCount > 0 && (
        <>
          <Text color="gray"> · </Text>
          <Text color="yellow">
            {contextFileCount} file{contextFileCount !== 1 ? "s" : ""}
          </Text>
        </>
      )}
      <Text color="gray"> · </Text>
      <Text color={tokenColor}>
        {formatTokenCount(tokenCount)}
      </Text>
      <Text color="gray">/{formatTokenCount(tokenLimit)} ({pct}%)</Text>
    </Box>
  );
}