import React from "react";
import { Box, Text } from "ink";
import type { CommandMeta } from "../commands";

interface CommandMenuProps {
  items: Array<CommandMeta & { score?: number }>;
  selectedIndex: number;
  maxVisible?: number;
}

/**
 * Dropdown that appears above the input bar when the user types '/'.
 * Renders with bounded height and respects terminal width.
 * Highlights the currently-selected row.
 */
export function CommandMenu({
  items,
  selectedIndex,
  maxVisible = 8,
}: CommandMenuProps) {
  if (items.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
      >
        <Text color="gray" dimColor>
          No matching commands
        </Text>
      </Box>
    );
  }

  // Windowing: keep the selected item visible
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

  // Compute max name width for column alignment
  const maxNameLen = Math.max(
    ...visible.map((c) => c.name.length + (c.usage ? c.usage.length + 1 : 0))
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
    >
      {visible.map((cmd, i) => {
        const absoluteIdx = start + i;
        const isSelected = absoluteIdx === selectedIndex;
        const display = cmd.usage ? `${cmd.name} ${cmd.usage}` : cmd.name;
        const padded = display.padEnd(maxNameLen + 2);

        return (
          <Box key={cmd.name}>
            <Text
              color={isSelected ? "black" : "cyan"}
              backgroundColor={isSelected ? "cyan" : undefined}
              bold={isSelected}
            >
              {isSelected ? "❯ " : "  "}
              {padded}
            </Text>
            <Text
              color={isSelected ? "black" : "gray"}
              backgroundColor={isSelected ? "cyan" : undefined}
              dimColor={!isSelected}
            >
              {cmd.description}
            </Text>
          </Box>
        );
      })}

      {/* Footer with hints + scroll indicator */}
      <Box marginTop={0}>
        <Text color="gray" dimColor>
          {total > maxVisible
            ? `${selectedIndex + 1}/${total}  ·  `
            : ""}
          ↑↓ navigate · Tab/Enter accept · Esc close
        </Text>
      </Box>
    </Box>
  );
}