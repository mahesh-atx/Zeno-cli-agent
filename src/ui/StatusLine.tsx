import React from "react";
import { Box, Text } from "ink";
import { formatTokenCount } from "../utils/tokens";

interface StatusLineProps {
  provider: string;
  model: string;
  tokenCount: number;
  tokenLimit: number;
}

function getTokenColor(used: number, limit: number): "green" | "yellow" | "red" {
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
}: StatusLineProps) {
  const tokenColor = getTokenColor(tokenCount, tokenLimit);

  return (
    <Box paddingX={2} marginTop={0}>
      <Text color="gray">? for shortcuts </Text>
      <Text color="gray">· </Text>
      <Text color="cyan">{provider}</Text>
      <Text color="gray">/</Text>
      <Text color="green">{model}</Text>
      <Text color="gray"> · </Text>
      <Text color={tokenColor}>
        {formatTokenCount(tokenCount)}
        {tokenLimit > 0 && (
          <Text color="gray">/{formatTokenCount(tokenLimit)}</Text>
        )}
      </Text>
      <Text color="gray"> tokens</Text>
    </Box>
  );
}