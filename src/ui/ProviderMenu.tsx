import React from "react";
import { Box, Text } from "ink";
import { config } from "../core/config";
import type { ProviderName } from "../core/config";
import { Colors } from "../themes/colors";

interface ProviderMenuProps {
  selectedIndex: number;
  currentProviderId: ProviderName;
}

export const PROVIDER_LIST = [
  {
    id: "nvidia" as ProviderName,
    label: "NVIDIA NIM",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    hasKey: () => config.nvidiaApiKey !== null,
  },
  {
    id: "openrouter" as ProviderName,
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    hasKey: () => config.openrouterApiKey !== null,
  },
  {
    id: "groq" as ProviderName,
    label: "Groq",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    hasKey: () => config.groqApiKey !== null,
  },
  {
    id: "opencodezen" as ProviderName,
    label: "OpenCode Zen",
    defaultBaseUrl: "https://opencode.ai/zen/v1",
    hasKey: () => config.opencodezenApiKey !== null,
  },
];

export function ProviderMenu({ selectedIndex, currentProviderId }: ProviderMenuProps) {
  const leftColWidth = Math.max(
    30,
    ...PROVIDER_LIST.map((p, i) => p.label.length + String(i + 1).length + 8)
  );

  return (
    <Box flexDirection="column" width="100%">
      <Box paddingX={1} flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow} bold>Select provider</Text>
        <Text dimColor>Switch between AI providers. Applies to this session.</Text>
      </Box>

      {PROVIDER_LIST.map((p, idx) => {
        const isSelected = idx === selectedIndex;
        const isCurrent = p.id === currentProviderId;
        const hasKey = p.hasKey();
        const statusText = hasKey ? "key configured" : "no key";
        const statusColor = hasKey ? "green" : "red";
        
        return (
          <Box
            key={p.id}
            width="100%"
            paddingX={1}
            flexDirection="row"
            backgroundColor={isSelected ? (Colors.FocusBackground ?? Colors.AccentYellow) : undefined}
          >
            <Box width={leftColWidth}>
              <Text color={isSelected ? (Colors.FocusColor ?? Colors.Background) : Colors.Foreground} bold={isSelected}>
                {isSelected ? "❯ " : "  "}{idx + 1}. {p.label}{isCurrent ? " ✔" : ""}
              </Text>
            </Box>
            <Box>
              <Text color={isSelected ? "black" : statusColor} dimColor={!isSelected && !hasKey}>
                {statusText}
              </Text>
              <Text color={isSelected ? (Colors.FocusColor ?? Colors.Background) : Colors.Gray} dimColor={!isSelected}>
                {` · default base: ${p.defaultBaseUrl}`}
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
