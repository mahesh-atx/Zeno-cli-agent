// src/ui/StatusLine.tsx
import React from "react";
import { Box, Text } from "ink";
import { formatTokenCount } from "../utils/tokens";
import { Colors } from "../themes/colors";

// ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type AgentStatus =
  | "idle"
  | "running"
  | "retrying"
  | "rate_limited"
  | "network_dropped"
  | "fatal_error";

interface StatusLineProps {
  provider: string;
  model: string;
  tokenCount: number;
  tokenLimit: number;
  contextFileCount: number;
  // New error system props — all optional so existing callers don't break
  agentStatus?: AgentStatus;
  rateLimitMs?: number | null;
  retryAttempt?: number;
  networkDropped?: boolean;
}

// ━━━ Token Color ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getTokenColor(used: number, limit: number): string {
  const pct = limit > 0 ? used / limit : 0;
  if (pct >= 0.9) return Colors.AccentRed;
  if (pct >= 0.7) return Colors.AccentYellow;
  return Colors.Foreground;
}

// ━━━ Agent Status Display ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AgentStatusIndicator({
  agentStatus,
  rateLimitMs,
  retryAttempt,
}: {
  agentStatus: AgentStatus;
  rateLimitMs: number | null;
  retryAttempt: number;
}) {
  switch (agentStatus) {
    case "running":
      return <Text color={Colors.AccentCyan}>⬤ running</Text>;

    case "retrying":
      return (
        <Text color={Colors.AccentYellow}>
          ↻ retrying{retryAttempt > 0 ? ` (attempt ${retryAttempt + 1})` : ""}
        </Text>
      );

    case "rate_limited": {
      // Show countdown timer in seconds
      const secs =
        rateLimitMs !== null ? Math.ceil(rateLimitMs / 1000) : "...";
      return (
        <Text color={Colors.AccentYellow}>
          ⏳ rate limited — wait {secs}s
        </Text>
      );
    }

    case "network_dropped":
      return <Text color={Colors.AccentRed}>✖ network dropped — press R to retry</Text>;

    case "fatal_error":
      return <Text color={Colors.AccentRed}>✖ error — see above</Text>;

    case "idle":
    default:
      return <Text color={Colors.AccentGreen}>● ready</Text>;
  }
}

// ━━━ Component ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function StatusLine({
  provider,
  model,
  tokenCount,
  tokenLimit,
  contextFileCount,
  agentStatus = "idle",
  rateLimitMs = null,
  retryAttempt = 0,
  networkDropped = false,
}: StatusLineProps) {
  const tokenColor = getTokenColor(tokenCount, tokenLimit);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box
        paddingX={1}
        flexDirection="row"
        justifyContent="space-between"
      >
      {/* Left: provider + model + agent status */}
      <Box gap={1}>
        <Text color={Colors.AccentCyan} bold>
          CLI Agent
        </Text>
        <Text color={Colors.Gray}>│</Text>
        <Text color={Colors.AccentCyan}>{provider}</Text>
        <Text color={Colors.Gray}>│</Text>
        <Text color={Colors.AccentGreen}>{model}</Text>
        <Text color={Colors.Gray}>│</Text>
        <AgentStatusIndicator
          agentStatus={agentStatus}
          rateLimitMs={rateLimitMs}
          retryAttempt={retryAttempt}
        />
      </Box>

      {/* Right: context files + tokens */}
      <Box gap={1}>
        {contextFileCount > 0 && (
          <>
            <Text color={Colors.Gray}>{contextFileCount} files</Text>
            <Text color={Colors.Gray}>│</Text>
          </>
        )}
        <Text color={tokenColor !== Colors.Foreground ? tokenColor : Colors.Gray}>tokens:</Text>
        <Text color={tokenColor} bold>
          {formatTokenCount(tokenCount)}
        </Text>
        {tokenLimit > 0 && (
          <>
            <Text color={tokenColor !== Colors.Foreground ? tokenColor : Colors.Gray}>/</Text>
            <Text color={tokenColor !== Colors.Foreground ? tokenColor : Colors.Gray}>{formatTokenCount(tokenLimit)}</Text>
          </>
        )}
      </Box>
      </Box>
    </Box>
  );
}