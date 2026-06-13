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
  const termWidth = Math.min(process.stdout.columns ?? 80, 80);
  const borderLine = "─".repeat(termWidth - 2);

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="yellow">┌{borderLine}┐</Text>
      <Box>
        <Text color="yellow">│ </Text>
        <Text color="yellow" bold>
          {title.slice(0, termWidth - 4).padEnd(termWidth - 4)}
        </Text>
        <Text color="yellow">│</Text>
      </Box>
      <Text color="yellow">├{borderLine}┤</Text>

      {lines.slice(0, 30).map((line, i) => (
        <Box key={i}>
          <Text color="yellow">│</Text>
          <DiffLine line={line} />
        </Box>
      ))}

      {lines.length > 30 && (
        <Box>
          <Text color="yellow">│</Text>
          <Text color="dim">
            {"  "}... ({lines.length - 30} more lines)
          </Text>
        </Box>
      )}

      <Text color="yellow">└{borderLine}┘</Text>
    </Box>
  );
}