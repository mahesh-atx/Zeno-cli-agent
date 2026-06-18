import React from "react";
import { Box, Text } from "ink";
import { formatTokenCount } from "../utils/tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatusBarProps {
  provider: string;
  model: string;
  tokenCount: number;
  tokenLimit: number;
}

// ─── Token Color ──────────────────────────────────────────────────────────────

function getTokenColor(used: number, limit: number): "green" | "yellow" | "red" {
  const pct = limit > 0 ? used / limit : 0;
  if (pct >= 0.8) return "red";
  if (pct >= 0.5) return "yellow";
  return "green";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StatusBar({
  provider,
  model,
  tokenCount,
  tokenLimit,
}: StatusBarProps) {
  const tokenColor = getTokenColor(tokenCount, tokenLimit);

  return (
    <Box
      paddingX={1}
      borderStyle="single"
      borderColor="dim"
      flexDirection="row"
      justifyContent="space-between"
    >
      {/* Left side */}
      <Box gap={1}>
        <Text color="cyan" bold>
          CLI Agent
        </Text>
        <Text color="dim">│</Text>
        <Text color="cyan">{provider}</Text>
        <Text color="dim">│</Text>
        <Text color="green">{model}</Text>
      </Box>

      {/* Right side — token count */}
      <Box gap={1}>
        <Text color="dim">Tokens:</Text>
        <Text color={tokenColor} bold>
          {formatTokenCount(tokenCount)}
        </Text>
        {tokenLimit > 0 && (
          <>
            <Text color="dim">/</Text>
            <Text color="dim">{formatTokenCount(tokenLimit)}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}