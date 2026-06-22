import React from "react";
import { Box, Text } from "ink";
import type { FileEntry } from "../utils/fileSearch";
import { Colors } from "../themes/colors";

interface FileMenuProps {
  items: FileEntry[];
  selectedIndex: number;
  maxVisible?: number;
  query: string;
}

export function FileMenu({
  items,
  selectedIndex,
  maxVisible = 8,
  query,
}: FileMenuProps) {

  if (items.length === 0) {
    return (
      <Box
        flexDirection="column"
        paddingX={1}
      >
        <Text color={Colors.Gray} dimColor>
          No files matching "{query}"
        </Text>
      </Box>
    );
  }

  // Windowing
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

  return (
    <Box
      flexDirection="column"
      paddingX={1}
    >
      <Box>
        <Text color={Colors.AccentCyan} bold>📎 Attach file</Text>
        {query && (
          <>
            <Text color={Colors.Gray}> · matching </Text>
            <Text color={Colors.AccentYellow}>"{query}"</Text>
          </>
        )}
      </Box>

      {visible.map((file, i) => {
        const absoluteIdx = start + i;
        const isSelected = absoluteIdx === selectedIndex;

        // Split path for nicer display: directory in dim, name highlighted
        const dirPart = file.dir && file.dir !== "." ? `${file.dir}/` : "";

        return (
          <Box
            key={file.path}
            width="100%"
            flexDirection="row"
            backgroundColor={isSelected ? (Colors.FocusBackground ?? Colors.AccentYellow) : undefined}
          >
            <Text
              color={isSelected ? (Colors.FocusColor ?? Colors.Background) : Colors.Gray}
              dimColor={!isSelected}
            >
              {isSelected ? "❯ " : "  "}
              {dirPart}
            </Text>
            <Text
              color={isSelected ? (Colors.FocusColor ?? Colors.Background) : Colors.Foreground}
              bold={isSelected}
            >
              {file.name}
            </Text>
          </Box>
        );
      })}

      <Box marginTop={0}>
        <Text color={Colors.Gray} dimColor>
          {total > maxVisible ? `${selectedIndex + 1}/${total}  ·  ` : ""}
          ↑↓ navigate · Tab/Enter accept · Esc close
        </Text>
      </Box>
    </Box>
  );
}