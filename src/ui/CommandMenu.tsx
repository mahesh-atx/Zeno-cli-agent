import React from "react";
import { Box, Text } from "ink";
import type { CommandMeta } from "../commands";
import { Colors } from "../themes/colors";

interface CommandMenuProps {
  items: Array<CommandMeta & { score?: number }>;
  selectedIndex: number;
  maxVisible?: number;
}

export function CommandMenu({
  items,
  selectedIndex,
  maxVisible = 8,
}: CommandMenuProps) {
  if (items.length === 0) {
    return (
      <Box
        flexDirection="column"
        paddingX={1}
      >
        <Text color={Colors.Gray} dimColor>
          No matching commands
        </Text>
      </Box>
    );
  }

  const total = items.length;
  let start = 0;
  if (total > maxVisible) {
    if (selectedIndex < maxVisible - 1) {
      start = 0;
    } else if (selectedIndex >= total - 1) {
      start = total - maxVisible;
    } else {
      start = selectedIndex - Math.floor(maxVisible / 2);
    }
    start = Math.max(0, Math.min(start, total - maxVisible));
  }
  const visible = items.slice(start, start + maxVisible);

  const leftColWidth = Math.max(
    20,
    ...visible.map((c) => c.name.length + (c.usage ? c.usage.length + 1 : 0) + 6)
  );

  return (
    <Box flexDirection="column" width="100%">
      <Box paddingX={1} flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow} bold>Available commands</Text>
      </Box>

      {visible.map((cmd, i) => {
        const absoluteIdx = start + i;
        const isSelected = absoluteIdx === selectedIndex;
        const display = cmd.usage ? `${cmd.name} ${cmd.usage}` : cmd.name;

        return (
          <Box
            key={cmd.name}
            width="100%"
            paddingX={1}
            flexDirection="row"
            backgroundColor={isSelected ? (Colors.FocusBackground ?? Colors.AccentYellow) : undefined}
          >
            <Box width={leftColWidth}>
              <Text color={isSelected ? (Colors.FocusColor ?? Colors.Background) : Colors.Foreground} bold={isSelected}>
                {isSelected ? "❯ " : "  "}{display}
              </Text>
            </Box>
            <Box>
              <Text color={isSelected ? (Colors.FocusColor ?? Colors.Background) : Colors.Gray} dimColor={!isSelected}>
                {cmd.description}
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