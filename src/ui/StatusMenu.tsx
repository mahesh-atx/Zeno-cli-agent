import React from "react";
import { Box, Text } from "ink";
import { Colors } from "../themes/colors";
import type { ProviderName } from "../core/config";
import type { ContextSummary } from "../core/context";

interface StatusMenuProps {
  currentProviderId: ProviderName;
  currentModelId: string;
  contextSummary: ContextSummary;
  selectedIndex: number;
}

export function StatusMenu({
  currentProviderId,
  currentModelId,
  contextSummary,
  selectedIndex,
}: StatusMenuProps) {
  const files = contextSummary.files;

  // Render the token progress bar
  const totalBarWidth = 40;
  const fillPercentage =
    contextSummary.total > 0
      ? Math.min(1, contextSummary.used / contextSummary.total)
      : 0;
  const fillChars = Math.round(totalBarWidth * fillPercentage);
  const emptyChars = totalBarWidth - fillChars;

  // Determine bar color based on usage
  let barColor = Colors.AccentGreen;
  if (fillPercentage > 0.9) barColor = Colors.AccentRed;
  else if (fillPercentage > 0.7) barColor = Colors.AccentYellow;

  const bar = `[${"█".repeat(fillChars)}${"░".repeat(emptyChars)}]`;

  // Windowing for files list
  const maxVisible = 5;
  const totalFiles = files.length;
  let start = 0;
  if (totalFiles > maxVisible) {
    if (selectedIndex < maxVisible - 1) {
      start = 0;
    } else if (selectedIndex >= totalFiles - 1) {
      start = totalFiles - maxVisible;
    } else {
      start = selectedIndex - Math.floor(maxVisible / 2);
    }
    start = Math.max(0, Math.min(start, totalFiles - maxVisible));
  }
  const visibleFiles = files.slice(start, start + maxVisible);

  return (
    <Box flexDirection="column" width="100%">
      <Box paddingX={1} flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentBlue} bold>
          Session Status
        </Text>
        <Text dimColor>
          Current AI provider and model context window usage.
        </Text>
      </Box>

      {/* Model Info */}
      <Box paddingX={1} flexDirection="row" marginBottom={1}>
        <Text color={Colors.Gray}>Provider: </Text>
        <Text color={Colors.Foreground}>{currentProviderId}</Text>
        <Text color={Colors.Gray}>  ·  Model: </Text>
        <Text color={Colors.Foreground}>{currentModelId}</Text>
      </Box>

      {/* Token Usage Bar */}
      <Box paddingX={1} flexDirection="column" marginBottom={1}>
        <Box flexDirection="row">
          <Text color={barColor}>{bar} </Text>
          <Text color={Colors.Foreground}>
            {(fillPercentage * 100).toFixed(1)}%
          </Text>
        </Box>
        <Box marginTop={0}>
          <Text dimColor>
            Tokens: {contextSummary.used.toLocaleString()} /{" "}
            {contextSummary.total.toLocaleString()} · History:{" "}
            {contextSummary.historyTokens.toLocaleString()} · Files:{" "}
            {contextSummary.fileTokens.toLocaleString()}
          </Text>
        </Box>
      </Box>

      {/* Context Files */}
      {totalFiles > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Box paddingX={1} marginBottom={0}>
            <Text color={Colors.AccentCyan} bold>
              Context Files ({totalFiles})
            </Text>
          </Box>
          {visibleFiles.map((file, i) => {
            const absoluteIdx = start + i;
            const isSelected = absoluteIdx === selectedIndex;

            return (
              <Box
                key={file}
                width="100%"
                paddingX={1}
                flexDirection="row"
                backgroundColor={
                  isSelected
                    ? Colors.FocusBackground ?? Colors.AccentYellow
                    : undefined
                }
              >
                <Text
                  color={
                    isSelected
                      ? Colors.FocusColor ?? Colors.Background
                      : Colors.Foreground
                  }
                  bold={isSelected}
                >
                  {isSelected ? "❯ " : "  "}
                  {file}
                </Text>
              </Box>
            );
          })}
        </Box>
      ) : (
        <Box paddingX={1} marginTop={1}>
          <Text color={Colors.Gray} dimColor>
            No files in context. Use /add &lt;path&gt; or @filename to add files.
          </Text>
        </Box>
      )}

      {/* Footer */}
      <Box paddingX={1} marginTop={1}>
        <Text dimColor>
          {totalFiles > maxVisible ? `${selectedIndex + 1}/${totalFiles}  ·  ` : ""}
          {totalFiles > 0
            ? "↑↓ navigate · Enter to remove file · Esc to close"
            : "Esc to close"}
        </Text>
      </Box>
    </Box>
  );
}
