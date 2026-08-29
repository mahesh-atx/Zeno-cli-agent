// src/ui/StatusLine.tsx
import React, { useMemo } from "react";
import { Box, Text } from "ink";
import * as fs from "fs";
import * as path from "path";
import { formatTokenCount } from "../utils/tokens";
import { Colors } from "../themes/colors";

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
  agentStatus?: AgentStatus;
  rateLimitMs?: number | null;
  retryAttempt?: number;
  networkDropped?: boolean;
}

function getTokenColor(used: number, limit: number): string {
  const pct = limit > 0 ? used / limit : 0;
  if (pct >= 0.9) return Colors.AccentRed;
  if (pct >= 0.7) return Colors.AccentYellow;
  return Colors.Foreground;
}

function getTokenBar(used: number, limit: number, width = 10): { bar: string; pct: number } {
  const pct = limit > 0 ? Math.min(1, used / limit) : 0;
  const filled = Math.round(width * pct);
  const empty = width - filled;
  const bar = `${"█".repeat(filled)}${"░".repeat(empty)}`;
  return { bar, pct };
}

function getCwdLabel(): string {
  try {
    const cwd = process.cwd();
    const home = process.env.HOME || "";
    let label = cwd;
    if (home && cwd.startsWith(home)) {
      label = "~" + cwd.slice(home.length);
    }
    // Show last 2 segments if deep, e.g., ~/a/b/c -> b/c, or just basename if shallow
    const parts = label.split("/").filter(Boolean);
    if (parts.length > 2) {
      // Keep ~/ + last 2
      if (label.startsWith("~")) {
        return `~/${parts.slice(-2).join("/")}`;
      }
      return parts.slice(-2).join("/");
    }
    return label || "/";
  } catch {
    return "";
  }
}

function getGitBranch(): string | null {
  try {
    const gitHeadPath = path.join(process.cwd(), ".git", "HEAD");
    if (!fs.existsSync(gitHeadPath)) return null;
    const content = fs.readFileSync(gitHeadPath, "utf-8").trim();
    if (content.startsWith("ref: refs/heads/")) {
      return content.replace("ref: refs/heads/", "");
    }
    if (content.length >= 7) {
      // Detached HEAD, show short hash
      return content.slice(0, 7);
    }
    return null;
  } catch {
    return null;
  }
}

export function StatusLine({
  provider,
  model,
  tokenCount,
  tokenLimit,
  contextFileCount,
}: StatusLineProps) {
  const tokenColor = getTokenColor(tokenCount, tokenLimit);
  const { bar, pct } = getTokenBar(tokenCount, tokenLimit, 10);
  const barColor = getTokenColor(tokenCount, tokenLimit);

  const cwdLabel = useMemo(() => getCwdLabel(), [tokenCount]); // recompute when tokens change (approx when cwd might change)
  const gitBranch = useMemo(() => getGitBranch(), [tokenCount]);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box paddingX={1} flexDirection="row" justifyContent="space-between">
        {/* Left: provider + model + agent status */}
        <Box gap={1} flexShrink={1}>
          <Text color={Colors.AccentCyan} wrap="truncate">{provider}</Text>
          <Text color={Colors.Gray}>│</Text>
          <Text color={Colors.AccentGreen} wrap="truncate">{model}</Text>
        </Box>

        {/* Right: cwd, branch, files, tokens with bar */}
        <Box gap={1} flexShrink={0}>
          {cwdLabel && (
            <>
              <Text color={Colors.Gray} wrap="truncate-middle">{cwdLabel}</Text>
              <Text color={Colors.Gray}>│</Text>
            </>
          )}
          {gitBranch && (
            <>
              <Text color={Colors.AccentPurple} wrap="truncate"> {gitBranch}</Text>
              <Text color={Colors.Gray}>│</Text>
            </>
          )}
          {contextFileCount > 0 && (
            <>
              <Text color={Colors.Gray}>{contextFileCount} files</Text>
              <Text color={Colors.Gray}>│</Text>
            </>
          )}
          <Text color={tokenColor} bold>{formatTokenCount(tokenCount)}</Text>
          {tokenLimit > 0 && (
            <>
              <Text color={Colors.Gray}>/</Text>
              <Text color={Colors.Gray}>{formatTokenCount(tokenLimit)}</Text>
              <Text color={Colors.Gray}>({(pct * 100).toFixed(0)}%)</Text>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
