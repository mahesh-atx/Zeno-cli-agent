import React from "react";
import { Box, Text } from "ink";
import { config } from "../core/config";
import type { ProviderName } from "../core/config";
import { Colors } from "../themes/colors";

export type ProviderMenuState = 'main' | 'activate' | 'edit' | 'delete';

interface ProviderMenuProps {
  selectedIndex: number;
  currentProviderId: ProviderName;
  menuState: ProviderMenuState;
}

export function getProviderList(menuState: ProviderMenuState) {
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

  if (menuState === 'main') {
    const actions = [
      { id: "action:activate", label: "Set active provider", defaultBaseUrl: "", hasKey: () => true },
      { id: "action:add", label: "Add custom provider", defaultBaseUrl: "", hasKey: () => true },
    ];
    if (custom.length > 0) {
      actions.push({ id: "action:edit", label: "Edit custom provider", defaultBaseUrl: "", hasKey: () => true });
      actions.push({ id: "action:delete", label: "Delete custom provider", defaultBaseUrl: "", hasKey: () => true });
    }
    return actions;
  }

  if (menuState === 'activate') {
    return [...builtin, ...custom];
  }

  if (menuState === 'edit') {
    return custom.map(p => ({
      ...p,
      id: `__edit_custom__:${p.id}`
    }));
  }

  if (menuState === 'delete') {
    return custom.map(p => ({
      ...p,
      id: `__delete_custom__:${p.id}`
    }));
  }

  return [];
}

export function ProviderMenu({ selectedIndex, currentProviderId, menuState }: ProviderMenuProps) {
  const providerList = getProviderList(menuState);
  const leftColWidth = Math.max(
    30,
    ...providerList.map((p, i) => p.label.length + String(i + 1).length + 8)
  );

  let title = "Provider Options";
  let subtitle = "Select an action";
  if (menuState === 'activate') {
    title = "Select provider";
    subtitle = "Switch between AI providers. Applies to this session.";
  } else if (menuState === 'edit') {
    title = "Edit custom provider";
    subtitle = "Select a provider to edit its settings.";
  } else if (menuState === 'delete') {
    title = "Delete custom provider";
    subtitle = "Select a provider to delete permanently.";
  }

  return (
    <Box flexDirection="column" width="100%">
      <Box paddingX={1} flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow} bold>{title}</Text>
        <Text dimColor>{subtitle}</Text>
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
                {isSelected ? "❯ " : "  "}{idx + 1}. {p.label}{isCurrent && menuState === 'activate' ? " ✔" : ""}
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
        <Text dimColor>Enter to confirm · Esc to {menuState === 'main' ? 'exit' : 'go back'}</Text>
      </Box>
    </Box>
  );
}
