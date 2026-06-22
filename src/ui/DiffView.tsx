import React from "react";
import { Box, Text } from "ink";
import { Colors } from "../themes/colors";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiffViewProps {
  title: string;
  lines: string[];
}

// ─── Line Color ───────────────────────────────────────────────────────────────

function DiffLine({ line }: { line: string }) {
  if (line.startsWith("+")) {
    return (
      <Text color={Colors.AccentGreen}>
        {"  "}{line}
      </Text>
    );
  }
  if (line.startsWith("-")) {
    return (
      <Text color={Colors.AccentRed}>
        {"  "}{line}
      </Text>
    );
  }
  if (line.startsWith("@@")) {
    return (
      <Text color={Colors.AccentCyan}>
        {"  "}{line}
      </Text>
    );
  }
  return (
    <Text color={Colors.Gray}>
      {"  "}{line}
    </Text>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiffView({ title, lines }: DiffViewProps) {
  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color={Colors.AccentYellow} bold>
          {title}
        </Text>
      </Box>

      {lines.slice(0, 30).map((line, i) => (
        <Box key={i}>
          <Text color={Colors.AccentYellow}>│ </Text>
          <DiffLine line={line} />
        </Box>
      ))}

      {lines.length > 30 && (
        <Box>
          <Text color={Colors.AccentYellow}>│ </Text>
          <Text color={Colors.Gray}>
            {"  "}... ({lines.length - 30} more lines)
          </Text>
        </Box>
      )}
    </Box>
  );
}