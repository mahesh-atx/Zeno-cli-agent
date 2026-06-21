import React from "react";
import { Box, Text } from "ink";
import type { ProviderName } from "../core/config";

interface ModelMenuProps {
  models: readonly string[];
  selectedIndex: number;
  currentModelId: string;
  providerLabel: string;
}

export function ModelMenu({ models, selectedIndex, currentModelId, providerLabel }: ModelMenuProps) {
  const maxItems = 8;
  const startIndex = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(maxItems / 2), Math.max(0, models.length - maxItems)),
  );
  const visibleModels = models.slice(startIndex, startIndex + maxItems);

  // Calculate dynamic width for the left column so descriptions align nicely
  const leftColWidth = Math.max(
    30,
    ...visibleModels.map((m, i) => m.length + String(startIndex + i + 1).length + 8)
  );

  return (
    <Box flexDirection="column" width="100%">
      <Box paddingX={1} flexDirection="column" marginBottom={1}>
        <Text color="#ffb000" bold>Select model</Text>
        <Text dimColor>Switch between {providerLabel} models. Applies to this session.</Text>
      </Box>

      {visibleModels.length === 0 && (
        <Box paddingX={1}>
          <Text dimColor>  No models available for this provider.</Text>
        </Box>
      )}

      {visibleModels.map((m, localIdx) => {
        const idx = startIndex + localIdx;
        const isSelected = idx === selectedIndex;
        const isCurrent = m === currentModelId;
        
        return (
          <Box
            key={m}
            width="100%"
            paddingX={1}
            flexDirection="row"
            backgroundColor={isSelected ? "#ffb000" : undefined}
          >
            <Box width={leftColWidth}>
              <Text color={isSelected ? "black" : "white"} bold={isSelected}>
                {isSelected ? "❯ " : "  "}{idx + 1}. {m}{isCurrent ? " ✔" : ""}
              </Text>
            </Box>
            <Box>
              <Text color={isSelected ? "black" : "gray"} dimColor={!isSelected}>
                Provider: {providerLabel}
              </Text>
            </Box>
          </Box>
        );
      })}

      <Box paddingX={1} marginTop={1}>
        <Text dimColor>Enter to confirm · Esc to exit</Text>
      </Box>
    </Box>
  );
}
