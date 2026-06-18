// src/ui/StatusLine.tsx
import React from "react";
import { Box, Text } from "ink";
import { formatTokenCount } from "../utils/tokens";

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

function getTokenColor(used: number, limit: number): "green" | "yellow" | "red" {
  const pct = limit > 0 ? used / limit : 0;
  if (pct >= 0.8) return "red";
  if (pct >= 0.5) return "yellow";
  return "green";
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
      return <Text color="cyan">⬤ running</Text>;

    case "retrying":
      return (
        <Text color="yellow">
          ↻ retrying{retryAttempt > 0 ? ` (attempt ${retryAttempt + 1})` : ""}
        </Text>
      );

    case "rate_limited": {
      // Show countdown timer in seconds
      const secs =
        rateLimitMs !== null ? Math.ceil(rateLimitMs / 1000) : "...";
      return (
        <Text color="yellow">
          ⏳ rate limited — wait {secs}s
        </Text>
      );
    }

    case "network_dropped":
      return <Text color="red">✖ network dropped — press R to retry</Text>;

    case "fatal_error":
      return <Text color="red">✖ error — see above</Text>;

    case "idle":
    default:
      return <Text color="green">● ready</Text>;
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
        <Text color="cyan" bold>
          CLI Agent
        </Text>
        <Text color="dim">│</Text>
        <Text color="cyan">{provider}</Text>
        <Text color="dim">│</Text>
        <Text color="green">{model}</Text>
        <Text color="dim">│</Text>
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
            <Text color="dim">{contextFileCount} files</Text>
            <Text color="dim">│</Text>
          </>
        )}
        <Text color="dim">tokens:</Text>
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
    </Box>
  );
}