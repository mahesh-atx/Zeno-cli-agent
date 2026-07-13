import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { Colors } from "../themes/colors";
import { StructuredDiffList } from "./diff/StructuredDiffList";

export type ToolStatus = "running" | "success" | "denied" | "error";

export interface ToolCall {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  status: ToolStatus;
  resultSummary?: string;
  stdout?: string;
  stderr?: string;
  hunks?: import("diff").StructuredPatchHunk[];
}

interface ToolOutputProps {
  toolCall: ToolCall;
}

function formatInput(input: Record<string, unknown>): string {
  if (Object.keys(input).length === 0) return "";
  
  // Pick the primary parameter to display (like path, url, or query) to match Claude Code
  const primaryKeys = ["path", "file", "url", "query", "CommandLine", "pattern", "message", "question"];
  let primaryValue;
  
  for (const key of primaryKeys) {
    if (input[key] !== undefined) {
      primaryValue = input[key];
      break;
    }
  }

  // Fallback to the first property if no primary key matches
  if (primaryValue === undefined) {
    primaryValue = Object.values(input)[0];
  }

  const str = typeof primaryValue === "string" ? primaryValue : JSON.stringify(primaryValue);
  const truncated = str.length > 50 ? str.slice(0, 50) + "..." : str;
  return `(${truncated})`;
}

function StatusIcon({ status }: { status: ToolStatus }) {
  switch (status) {
    case "running":
      return (
        <Text color={Colors.AccentYellow}>
          <Spinner type="dots" />
        </Text>
      );
    case "success":
      return <Text color={Colors.AccentGreen}>●</Text>;
    case "denied":
      return <Text color={Colors.AccentYellow}>●</Text>;
    case "error":
      return <Text color={Colors.AccentRed}>●</Text>;
  }
}

export function ToolOutput({ toolCall }: ToolOutputProps) {
  const { toolName, input, status, resultSummary, stdout, stderr } = toolCall;
  const inputSummary = formatInput(input);
  
  // Format tool name: 'read_file' -> 'Read_file'
  const formattedName = toolName.charAt(0).toUpperCase() + toolName.slice(1);
  let userFacingName = formattedName;
  if (toolName === "write_file") userFacingName = "Write";
  if (toolName === "edit_file" || toolName === "apply_patch" || toolName === "replace_file_content") userFacingName = "Update";

  let addedLines = 0;
  let removedLines = 0;
  if (toolCall.hunks) {
    for (const h of toolCall.hunks) {
      for (const l of h.lines) {
        if (l.startsWith("+")) addedLines++;
        if (l.startsWith("-")) removedLines++;
      }
    }
  }

  const isWrite = toolName === "write_file";
  const isUpdate = toolName === "edit_file" || toolName === "apply_patch" || toolName === "replace_file_content";
  const targetPath = String(input.path || input.file || "file");

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginLeft={0}>
        <StatusIcon status={status} />
        <Text color="white" bold>
          {" "}{userFacingName}
        </Text>
        {inputSummary ? (
          <Text color="white" bold>
            {inputSummary}
          </Text>
        ) : null}
      </Box>

      {status !== "running" && toolCall.hunks && isWrite && (
        <Box flexDirection="column" marginLeft={4}>
          <Box>
            <Text dimColor>└  </Text>
            <Text color="white">Created {targetPath}</Text>
          </Box>
          <Box>
            <Text dimColor>└    </Text>
            <Text color="white">Added {addedLines} line{addedLines !== 1 ? "s" : ""}</Text>
          </Box>
        </Box>
      )}

      {status !== "running" && toolCall.hunks && isUpdate && (
        <Box flexDirection="column" marginLeft={4}>
          <Box>
            <Text dimColor>└  </Text>
            <Text color="white">Updated {targetPath} with {addedLines} addition{addedLines !== 1 ? "s" : ""} and {removedLines} removal{removedLines !== 1 ? "s" : ""}</Text>
          </Box>
          <Box>
            <Text dimColor>└    </Text>
            <Text color="white">Added {addedLines} line{addedLines !== 1 ? "s" : ""}, Removed {removedLines} line{removedLines !== 1 ? "s" : ""}</Text>
          </Box>
        </Box>
      )}

      {status !== "running" && (!toolCall.hunks || (!isWrite && !isUpdate)) && resultSummary && (
        <Box marginLeft={4}>
          <Text dimColor>└  </Text>
          <Text color="white">
            {resultSummary}
          </Text>
        </Box>
      )}

      {toolCall.hunks && toolCall.hunks.length > 0 && (
        <Box marginLeft={7} marginTop={1}>
          <StructuredDiffList hunks={toolCall.hunks} filePath={String(input.path || input.file || "file")} />
        </Box>
      )}

      {!toolCall.hunks && stdout && stdout.trim() && (
        <Box flexDirection="column" marginLeft={7} marginTop={0}>
          {stdout
            .trim()
            .split("\n")
            .slice(0, 15)
            .map((line, i) => {
              if (toolName === "edit_file" || toolName === "apply_patch" || toolName === "write_file") {
                if (line.startsWith("+")) {
                  return (
                    <Text key={i} backgroundColor={Colors.DiffAdded} color={Colors.Background}>
                      {line}
                    </Text>
                  );
                }
                if (line.startsWith("-")) {
                  return (
                    <Text key={i} backgroundColor={Colors.DiffRemoved} color={Colors.Background}>
                      {line}
                    </Text>
                  );
                }
              }
              return (
                <Text key={i} dimColor>
                  {line}
                </Text>
              );
            })}
          {stdout.trim().split("\n").length > 15 && (
            <Text dimColor>
              ... ({stdout.trim().split("\n").length - 15} more lines)
            </Text>
          )}
        </Box>
      )}

      {stderr && stderr.trim() && (
        <Box flexDirection="column" marginLeft={7}>
          {stderr
            .trim()
            .split("\n")
            .slice(0, 10)
            .map((line, i) => (
              <Text key={i} color={status === "error" ? "red" : "yellow"}>
                {line}
              </Text>
            ))}
        </Box>
      )}
    </Box>
  );
}