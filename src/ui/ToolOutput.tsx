import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
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
  rawResult?: unknown;
  isExpanded?: boolean;
}

interface ToolOutputProps {
  toolCall: ToolCall;
  onToggleExpand?: (id: string) => void;
}

function formatInput(input: Record<string, unknown>): string {
  if (Object.keys(input).length === 0) return "";
  
  const primaryKeys = ["path", "file", "url", "query", "CommandLine", "pattern", "message", "question"];
  let primaryValue;
  
  for (const key of primaryKeys) {
    if (input[key] !== undefined) {
      primaryValue = input[key];
      break;
    }
  }

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

// Specialized rendering for read_many_files parallel UI
function ReadManyFilesOutput({ toolCall }: { toolCall: ToolCall }) {
  const input = toolCall.input as { paths?: string[] };
  const raw = toolCall.rawResult as any;
  const paths = input.paths || [];
  const results = raw?.results as Array<{ path: string; success: boolean; lines?: number; tokens?: number; size?: number; error?: string }> | undefined;
  
  const totalFiles = paths.length;
  const successCount = results ? results.filter(r => r.success).length : 0;
  const isExpanded = toolCall.isExpanded || false;

  const displayFiles = results || paths.map(p => ({ path: p, success: true }));

  if (toolCall.status === "running") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <StatusIcon status="running" />
          <Text color="white" bold> Read {totalFiles} files</Text>
        </Box>
        <Box marginLeft={4}>
          <Text dimColor>└  Reading {paths.slice(0, 3).join(", ")}{totalFiles > 3 ? ` +${totalFiles - 3} more` : ""}...</Text>
        </Box>
      </Box>
    );
  }

  // Collapsed view
  if (!isExpanded) {
    const firstThree = displayFiles.slice(0, 3).map(f => f.path.split("/").pop() || f.path);
    const remaining = displayFiles.length - 3;
    const fileList = remaining > 0 
      ? `${firstThree.join(", ")} +${remaining} more`
      : firstThree.join(", ");

    return (
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <StatusIcon status={toolCall.status} />
          <Text color="white" bold> Read {successCount || totalFiles} files</Text>
        </Box>
        <Box marginLeft={4} flexDirection="column">
          <Box>
            <Text dimColor>└  </Text>
            <Text color="white">{fileList}</Text>
          </Box>
          <Box marginLeft={2}>
            <Text dimColor>   (ctrl+r to expand)</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // Expanded view
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <StatusIcon status={toolCall.status} />
        <Text color="white" bold> Read {successCount || totalFiles} files</Text>
        <Text dimColor> ({totalFiles} requested)</Text>
      </Box>
      <Box marginLeft={4} flexDirection="column">
        {displayFiles.map((file, idx) => {
          const isLast = idx === displayFiles.length - 1;
          const icon = file.success ? "✓" : "✗";
          const color = file.success ? Colors.AccentGreen : Colors.AccentRed;
          return (
            <Box key={idx}>
              <Text dimColor>{isLast ? "└  " : "├  "}</Text>
              <Text color={color}>{icon} </Text>
              <Text color="white">{file.path}</Text>
              {file.success && file.lines !== undefined && (
                <Text dimColor> ({file.lines} lines{file.tokens ? `, ~${file.tokens} tokens` : ""})</Text>
              )}
              {!file.success && file.error && (
                <Text color={Colors.AccentRed}> — {file.error.slice(0, 60)}</Text>
              )}
            </Box>
          );
        })}
        <Box marginTop={0} marginLeft={2}>
          <Text dimColor>   (ctrl+r to collapse)</Text>
        </Box>
      </Box>
    </Box>
  );
}

function GitStatusOutput({ toolCall }: { toolCall: ToolCall }) {
  const raw = toolCall.rawResult as any;
  const isClean = raw?.isClean;
  const branch = raw?.branch;
  
  if (toolCall.status === "running") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <StatusIcon status="running" />
          <Text color="white" bold> Git status</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <StatusIcon status={toolCall.status} />
        <Text color="white" bold> Git status{branch ? ` (${branch})` : ""}</Text>
        {isClean !== undefined && (
          <Text color={isClean ? Colors.AccentGreen : Colors.AccentYellow}> {isClean ? "clean" : "dirty"}</Text>
        )}
      </Box>
      {toolCall.status === "success" && (
        <Box marginLeft={4}>
          <Text dimColor>└  </Text>
          <Text color="white">{toolCall.resultSummary || raw?.output?.slice(0, 100) || "done"}</Text>
        </Box>
      )}
    </Box>
  );
}

export function ToolOutput({ toolCall, onToggleExpand }: ToolOutputProps) {
  const { toolName, input, status, resultSummary, stdout, stderr } = toolCall;

  // Special cases for P2 new tools
  if (toolName === "read_many_files") {
    return <ReadManyFilesOutput toolCall={toolCall} />;
  }

  if (toolName === "git_status") {
    return <GitStatusOutput toolCall={toolCall} />;
  }

  const inputSummary = formatInput(input);
  
  const formattedName = toolName.charAt(0).toUpperCase() + toolName.slice(1);
  let userFacingName = formattedName;
  if (toolName === "write_file") userFacingName = "Write";
  if (toolName === "edit_file" || toolName === "apply_patch" || toolName === "replace_file_content") userFacingName = "Update";
  if (toolName === "read_file") userFacingName = "Read";
  if (toolName === "read_many_files") userFacingName = "Read";
  if (toolName === "list_files" || toolName === "glob_files") userFacingName = "Search";
  if (toolName === "search_files") userFacingName = "Grep";
  if (toolName === "git_diff") userFacingName = "Git diff";
  if (toolName === "git_log") userFacingName = "Git log";

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

      {status !== "running" && (!toolCall.hunks || (!isWrite && !isUpdate)) && resultSummary && toolName !== "read_many_files" && (
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

      {!toolCall.hunks && stdout && stdout.trim() && toolName !== "read_many_files" && (
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
