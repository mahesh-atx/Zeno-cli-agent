import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export type ToolStatus = "running" | "success" | "denied" | "error";

export interface ToolCall {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  status: ToolStatus;
  resultSummary?: string;
  stdout?: string;
  stderr?: string;
}

interface ToolOutputProps {
  toolCall: ToolCall;
}

function formatInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return "";
  return entries
    .slice(0, 3)
    .map(([k, v]) => {
      const str = typeof v === "string" ? v : JSON.stringify(v);
      const val = str.length > 50 ? str.slice(0, 50) + "..." : str;
      return `${k}: ${val}`;
    })
    .join("  ");
}

function StatusIcon({ status }: { status: ToolStatus }) {
  switch (status) {
    case "running":
      return (
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
      );
    case "success":
      return <Text color="green">✓</Text>;
    case "denied":
      return <Text color="yellow">✗</Text>;
    case "error":
      return <Text color="red">!</Text>;
  }
}

export function ToolOutput({ toolCall }: ToolOutputProps) {
  const { toolName, input, status, resultSummary, stdout, stderr } = toolCall;
  const inputSummary = formatInput(input);

    return (
    <Box
      flexDirection="column"
      marginTop={1}
      // Red left border when tool failed — makes errors visually trackable
      borderStyle={status === "error" ? "single" : undefined}
      borderColor={status === "error" ? "red" : undefined}
      borderLeft={status === "error" ? true : undefined}
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      paddingLeft={status === "error" ? 1 : 0}
    >
      <Box>
        <StatusIcon status={status} />
        <Text color={status === "error" ? "red" : "cyan"} bold>
          {" "}{toolName}
        </Text>
        {inputSummary && (
          <Text color={status === "error" ? "red" : "gray"}>
            {"  "}({inputSummary})
          </Text>
        )}
      </Box>

      {resultSummary && status !== "running" && (
        <Box marginLeft={2}>
          <Text color="gray">→ </Text>
          <Text
            color={
              status === "success"
                ? "green"
                : status === "denied"
                ? "yellow"
                : "red"
            }
            bold={status === "error"}
          >
            {resultSummary}
          </Text>
        </Box>
      )}

      {stdout && stdout.trim() && (
        <Box flexDirection="column" marginLeft={2} marginTop={0}>
          {stdout
            .trim()
            .split("\n")
            .slice(0, 15)
            .map((line, i) => (
              <Text key={i} color="gray">
                {"  "}{line}
              </Text>
            ))}
          {stdout.trim().split("\n").length > 15 && (
            <Text color="gray" dimColor>
              {"  "}... ({stdout.trim().split("\n").length - 15} more lines)
            </Text>
          )}
        </Box>
      )}

      {stderr && stderr.trim() && (
        <Box flexDirection="column" marginLeft={2}>
          {stderr
            .trim()
            .split("\n")
            .slice(0, 10)
            .map((line, i) => (
              <Text key={i} color={status === "error" ? "red" : "yellow"}>
                {"  "}{line}
              </Text>
            ))}
        </Box>
      )}
    </Box>
  );
}