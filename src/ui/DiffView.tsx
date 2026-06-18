import React from "react";
import { Box, Text } from "ink";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiffViewProps {
  title: string;
  lines: string[];
}

// ─── Line Color ───────────────────────────────────────────────────────────────

function DiffLine({ line }: { line: string }) {
  if (line.startsWith("+")) {
    return (
      <Text color="green">
        {"  "}{line}
      </Text>
    );
  }
  if (line.startsWith("-")) {
    return (
      <Text color="red">
        {"  "}{line}
      </Text>
    );
  }
  if (line.startsWith("@@")) {
    return (
      <Text color="cyan">
        {"  "}{line}
      </Text>
    );
  }
  return (
    <Text color="dim">
      {"  "}{line}
    </Text>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiffView({ title, lines }: DiffViewProps) {
  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color="yellow" bold>
          {title}
        </Text>
      </Box>

      {lines.slice(0, 30).map((line, i) => (
        <Box key={i}>
          <Text color="yellow">│ </Text>
          <DiffLine line={line} />
        </Box>
      ))}

      {lines.length > 30 && (
        <Box>
          <Text color="yellow">│ </Text>
          <Text color="dim">
            {"  "}... ({lines.length - 30} more lines)
          </Text>
        </Box>
      )}
    </Box>
  );
}