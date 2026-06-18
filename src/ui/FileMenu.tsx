import React from "react";
import { Box, Text } from "ink";
import type { FileEntry } from "../utils/fileSearch";

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
        <Text color="gray" dimColor>
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
        <Text color="cyan" bold>📎 Attach file</Text>
        {query && (
          <>
            <Text color="gray"> · matching </Text>
            <Text color="yellow">"{query}"</Text>
          </>
        )}
      </Box>

      {visible.map((file, i) => {
        const absoluteIdx = start + i;
        const isSelected = absoluteIdx === selectedIndex;

        // Split path for nicer display: directory in dim, name highlighted
        const dirPart = file.dir && file.dir !== "." ? `${file.dir}/` : "";

        return (
          <Box key={file.path}>
            <Text
              color={isSelected ? "black" : "gray"}
              backgroundColor={isSelected ? "cyan" : undefined}
              dimColor={!isSelected}
            >
              {isSelected ? "❯ " : "  "}
              {dirPart}
            </Text>
            <Text
              color={isSelected ? "black" : "white"}
              backgroundColor={isSelected ? "cyan" : undefined}
              bold={isSelected}
            >
              {file.name}
            </Text>
          </Box>
        );
      })}

      <Box marginTop={0}>
        <Text color="gray" dimColor>
          {total > maxVisible ? `${selectedIndex + 1}/${total}  ·  ` : ""}
          ↑↓ navigate · Tab/Enter accept · Esc close
        </Text>
      </Box>
    </Box>
  );
}