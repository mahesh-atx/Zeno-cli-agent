import React from "react";
import { Box, Text } from "ink";
import { config } from "../core/config";
import type { ProviderName } from "../core/config";
import { Colors } from "../themes/colors";

interface ProviderMenuProps {
  selectedIndex: number;
  currentProviderId: ProviderName;
}

export function getProviderList() {
  const builtin = [
    {
      id: "nvidia",
      label: "NVIDIA NIM",
      defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
      hasKey: () => config.nvidiaApiKey !== null,
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      defaultBaseUrl: "https://openrouter.ai/api/v1",
      hasKey: () => config.openrouterApiKey !== null,
    },
    {
      id: "groq",
      label: "Groq",
      defaultBaseUrl: "https://api.groq.com/openai/v1",
      hasKey: () => config.groqApiKey !== null,
    },
    {
      id: "opencodezen",
      label: "OpenCode Zen",
      defaultBaseUrl: "https://opencode.ai/zen/v1",
      hasKey: () => config.opencodezenApiKey !== null,
    },
  ];

  const custom = (config.customProviders || []).map((p) => ({
    id: p.id,
    label: p.name,
    defaultBaseUrl: p.baseUrl,
    hasKey: () => !!p.apiKey,
  }));

  const actions = [
    {
      id: "__add_custom__",
      label: "[+] Add Custom Provider",
      defaultBaseUrl: "",
      hasKey: () => true,
    }
  ];

  for (const p of (config.customProviders || [])) {
    actions.push({
      id: `__edit_custom__:${p.id}`,
      label: `[✎] Edit ${p.name}`,
      defaultBaseUrl: "",
      hasKey: () => true,
    });
    actions.push({
      id: `__delete_custom__:${p.id}`,
      label: `[✖] Delete ${p.name}`,
      defaultBaseUrl: "",
      hasKey: () => true,
    });
  }

  return [...builtin, ...custom, ...actions];
}

export function ProviderMenu({ selectedIndex, currentProviderId }: ProviderMenuProps) {
  const providerList = getProviderList();
  const leftColWidth = Math.max(
    30,
    ...providerList.map((p, i) => p.label.length + String(i + 1).length + 8)
  );

  return (
    <Box flexDirection="column" width="100%">
      <Box paddingX={1} flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow} bold>Select provider</Text>
        <Text dimColor>Switch between AI providers. Applies to this session.</Text>
      </Box>

      {providerList.map((p, idx) => {
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
              {p.defaultBaseUrl ? (
                <>
                  <Text color={isSelected ? "black" : statusColor} dimColor={!isSelected && !hasKey}>
                    {statusText}
                  </Text>
                  <Text color={isSelected ? (Colors.FocusColor ?? Colors.Background) : Colors.Gray} dimColor={!isSelected}>
                    {` · default base: ${p.defaultBaseUrl}`}
                  </Text>
                </>
              ) : null}
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
