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
  if (primaryValue === undefined) primaryValue = Object.values(input)[0];
  const str = typeof primaryValue === "string" ? primaryValue : JSON.stringify(primaryValue);
  const truncated = str.length > 50 ? str.slice(0, 50) + "..." : str;
  return `(${truncated})`;
}

function StatusIcon({ status }: { status: ToolStatus }) {
  switch (status) {
    case "running":
      return <Text color={Colors.AccentYellow}><Spinner type="dots" /></Text>;
    case "success":
      return <Text color={Colors.AccentGreen}>●</Text>;
    case "denied":
      return <Text color={Colors.AccentYellow}>●</Text>;
    case "error":
      return <Text color={Colors.AccentRed}>●</Text>;
  }
}

// ─── Read Many Files — parallel UI ──────────────────────────────────────────
function ReadManyFilesOutput({ toolCall }: { toolCall: ToolCall }) {
  const input = toolCall.input as { paths?: string[] };
  const raw = toolCall.rawResult as any;
  const paths = input.paths || [];
  const results = raw?.results as Array<{ path: string; success: boolean; lines?: number; tokens?: number; error?: string }> | undefined;
  const totalFiles = paths.length;
  const successCount = results ? results.filter(r => r.success).length : 0;
  const isExpanded = toolCall.isExpanded || false;
  const displayFiles = results || paths.map(p => ({ path: p, success: true }));

  if (toolCall.status === "running") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box><StatusIcon status="running" /><Text color="white" bold> Read {totalFiles} files</Text></Box>
        <Box marginLeft={4}><Text dimColor>└  Reading {paths.slice(0, 3).join(", ")}{totalFiles > 3 ? ` +${totalFiles - 3} more` : ""}...</Text></Box>
      </Box>
    );
  }

  if (!isExpanded) {
    const firstThree = displayFiles.slice(0, 3).map(f => (f.path.split("/").pop() || f.path));
    const remaining = displayFiles.length - 3;
    const fileList = remaining > 0 ? `${firstThree.join(", ")} +${remaining} more` : firstThree.join(", ");
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Read {successCount || totalFiles} files</Text></Box>
        <Box marginLeft={4} flexDirection="column">
          <Box><Text dimColor>└  </Text><Text color="white">{fileList}</Text></Box>
          <Box marginLeft={2}><Text dimColor>   (ctrl+r to expand)</Text></Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Read {successCount || totalFiles} files</Text><Text dimColor> ({totalFiles} requested)</Text></Box>
      <Box marginLeft={4} flexDirection="column">
        {displayFiles.map((file, idx) => {
          const isLast = idx === displayFiles.length - 1;
          const icon = file.success ? "✓" : "✗";
          const color = file.success ? Colors.AccentGreen : Colors.AccentRed;
          return (
            <Box key={idx}><Text dimColor>{isLast ? "└  " : "├  "}</Text><Text color={color}>{icon} </Text><Text color="white">{file.path}</Text>{file.success && file.lines !== undefined && <Text dimColor> ({file.lines} lines{file.tokens ? `, ~${file.tokens}` : ""})</Text>}{!file.success && file.error && <Text color={Colors.AccentRed}> — {file.error.slice(0, 60)}</Text>}</Box>
          );
        })}
        <Box marginTop={0} marginLeft={2}><Text dimColor>   (ctrl+r to collapse)</Text></Box>
      </Box>
    </Box>
  );
}

// ─── List Files — expandable ────────────────────────────────────────────────
function ListFilesOutput({ toolCall }: { toolCall: ToolCall }) {
  const raw = toolCall.rawResult as any;
  const entries = (raw?.entries || []) as string[];
  const isExpanded = toolCall.isExpanded || false;
  const pathArg = (toolCall.input as any).path || ".";

  if (toolCall.status === "running") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box><StatusIcon status="running" /><Text color="white" bold> Search ({pathArg})</Text></Box>
      </Box>
    );
  }

  const collapsed = entries.slice(0, 5);
  const remaining = entries.length - 5;

  if (!isExpanded) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Search</Text><Text color="white" bold>{` (${pathArg})`}</Text>{entries.length > 0 && <Text color="white"> — {entries.length} items</Text>}</Box>
        {entries.length > 0 && (
          <Box marginLeft={4} flexDirection="column">
            <Box><Text dimColor>└  </Text><Text color="white">{collapsed.map(e => e.replace(/^\[.*?\]\s+/, "").split(" ")[0]).join(", ")}{remaining > 0 ? ` +${remaining} more` : ""}</Text></Box>
            {entries.length > 5 && <Box marginLeft={2}><Text dimColor>   (ctrl+r to expand)</Text></Box>}
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Search ({pathArg})</Text><Text color="white"> — {entries.length} items</Text></Box>
      <Box marginLeft={4} flexDirection="column">
        {entries.map((e, idx) => {
          const isLast = idx === entries.length - 1;
          return <Box key={idx}><Text dimColor>{isLast ? "└  " : "├  "}</Text><Text color="white">{e}</Text></Box>;
        })}
        <Box marginLeft={2}><Text dimColor>   (ctrl+r to collapse)</Text></Box>
      </Box>
    </Box>
  );
}

// ─── Glob Files ─────────────────────────────────────────────────────────────
function GlobFilesOutput({ toolCall }: { toolCall: ToolCall }) {
  const raw = toolCall.rawResult as any;
  const files = (raw?.files || []) as string[];
  const total = raw?.total as number | undefined;
  const isExpanded = toolCall.isExpanded || false;
  const pattern = (toolCall.input as any).pattern || "**";

  if (toolCall.status === "running") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box><StatusIcon status="running" /><Text color="white" bold> Search ({pattern})</Text></Box>
      </Box>
    );
  }

  if (!isExpanded && files.length > 5) {
    const first = files.slice(0, 3).map(f => f.split("/").pop()).join(", ");
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Search</Text><Text color="white" bold>{` (${pattern})`}</Text><Text color="white"> — {total ?? files.length} matches</Text></Box>
        <Box marginLeft={4} flexDirection="column">
          <Box><Text dimColor>└  </Text><Text color="white">{first} +{files.length - 3} more</Text></Box>
          <Box marginLeft={2}><Text dimColor>   (ctrl+r to expand)</Text></Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Search ({pattern})</Text><Text color="white"> — {total ?? files.length} matches{(raw?.truncated ? " (truncated)" : "")}</Text></Box>
      {isExpanded && (
        <Box marginLeft={4} flexDirection="column">
          {files.map((f, idx) => {
            const isLast = idx === files.length - 1;
            return <Box key={idx}><Text dimColor>{isLast ? "└  " : "├  "}</Text><Text color="white">{f}</Text></Box>;
          })}
          <Box marginLeft={2}><Text dimColor>   (ctrl+r to collapse)</Text></Box>
        </Box>
      )}
      {!isExpanded && files.length <= 5 && files.length > 0 && (
        <Box marginLeft={4}><Text dimColor>└  </Text><Text color="white">{files.map(f => f.split("/").pop()).join(", ")}</Text></Box>
      )}
    </Box>
  );
}

// ─── Search Files (grep) ───────────────────────────────────────────────────
function SearchFilesOutput({ toolCall }: { toolCall: ToolCall }) {
  const raw = toolCall.rawResult as any;
  const matches = (raw?.matches || []) as Array<{ file: string; line: number; content: string }>;
  const total = raw?.total as number | undefined;
  const isExpanded = toolCall.isExpanded || false;
  const query = (toolCall.input as any).query || "";

  if (toolCall.status === "running") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box><StatusIcon status="running" /><Text color="white" bold> Grep "{query}"</Text></Box>
      </Box>
    );
  }

  if (!isExpanded && matches.length > 3) {
    const preview = matches.slice(0, 2).map(m => `${m.file.split("/").pop()}:${m.line}`).join(", ");
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Grep "{query}"</Text><Text color="white"> — {total ?? matches.length} matches</Text></Box>
        <Box marginLeft={4} flexDirection="column">
          <Box><Text dimColor>└  </Text><Text color="white">{preview} +{matches.length - 2} more</Text></Box>
          <Box marginLeft={2}><Text dimColor>   (ctrl+r to expand)</Text></Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Grep "{query}"</Text><Text color="white"> — {total ?? matches.length} matches</Text></Box>
      <Box marginLeft={4} flexDirection="column">
        {(isExpanded ? matches : matches.slice(0, 5)).map((m, idx, arr) => {
          const isLast = idx === arr.length - 1;
          return <Box key={idx}><Text dimColor>{isLast ? "└  " : "├  "}</Text><Text color="white">{m.file}:{m.line}</Text><Text dimColor> — {m.content.slice(0, 50)}</Text></Box>;
        })}
        {isExpanded ? <Box marginLeft={2}><Text dimColor>   (ctrl+r to collapse)</Text></Box> : matches.length > 5 && <Box marginLeft={2}><Text dimColor>   (ctrl+r to expand)</Text></Box>}
      </Box>
    </Box>
  );
}

// ─── Read File ──────────────────────────────────────────────────────────────
function ReadFileOutput({ toolCall }: { toolCall: ToolCall }) {
  const raw = toolCall.rawResult as any;
  const isExpanded = toolCall.isExpanded || false;
  const pathArg = (toolCall.input as any).path || "file";
  const content = raw?.content as string | undefined;
  const lines = raw?.lines as number | undefined;
  const totalLines = raw?.totalLines as number | undefined;
  const size = raw?.size as number | undefined;

  if (toolCall.status === "running") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box><StatusIcon status="running" /><Text color="white" bold> Read ({pathArg})</Text></Box>
      </Box>
    );
  }

  if (!isExpanded) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Read</Text><Text color="white" bold>{` (${pathArg})`}</Text></Box>
        <Box marginLeft={4} flexDirection="column">
          <Box><Text dimColor>└  </Text><Text color="white">{lines ?? totalLines ?? "?"} lines{size ? `, ${(size/1024).toFixed(1)} KB` : ""}</Text></Box>
          <Box marginLeft={2}><Text dimColor>   (ctrl+r to expand)</Text></Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Read ({pathArg})</Text><Text color="white"> — {lines ?? totalLines ?? "?"} lines{size ? `, ${(size/1024).toFixed(1)} KB` : ""}</Text></Box>
      {content && (
        <Box marginLeft={4} flexDirection="column">
          {content.split("\n").slice(0, 15).map((line, idx, arr) => (
            <Box key={idx}><Text dimColor>{idx === arr.length - 1 || idx === 14 ? "└  " : "├  "}</Text><Text color="white">{line.slice(0, 100)}</Text></Box>
          ))}
          {content.split("\n").length > 15 && <Box marginLeft={0}><Text dimColor>   ... {content.split("\n").length - 15} more lines</Text></Box>}
          <Box marginLeft={2}><Text dimColor>   (ctrl+r to collapse)</Text></Box>
        </Box>
      )}
    </Box>
  );
}

// ─── Git outputs ────────────────────────────────────────────────────────────
function GitStatusOutput({ toolCall }: { toolCall: ToolCall }) {
  const raw = toolCall.rawResult as any;
  const isClean = raw?.isClean;
  const branch = raw?.branch;
  const isExpanded = toolCall.isExpanded || false;
  const output = raw?.output as string | undefined;

  if (toolCall.status === "running") {
    return <Box flexDirection="column" marginTop={1}><Box><StatusIcon status="running" /><Text color="white" bold> Git status</Text></Box></Box>;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Git status{branch ? ` (${branch})` : ""}</Text>{isClean !== undefined && <Text color={isClean ? Colors.AccentGreen : Colors.AccentYellow}> {isClean ? "clean" : "dirty"}</Text>}</Box>
      {isClean === false && !isExpanded && output && (
        <Box marginLeft={4} flexDirection="column">
          <Box><Text dimColor>└  </Text><Text color="white">{output.split("\n").slice(0, 3).join(", ").slice(0, 80)}...</Text></Box>
          <Box marginLeft={2}><Text dimColor>   (ctrl+r to expand)</Text></Box>
        </Box>
      )}
      {isExpanded && output && (
        <Box marginLeft={4} flexDirection="column">
          {output.split("\n").slice(0, 20).map((line: string, idx: number) => (
            <Box key={idx}><Text dimColor>{idx === 19 ? "└  " : "├  "}</Text><Text color="white">{line}</Text></Box>
          ))}
          <Box marginLeft={2}><Text dimColor>   (ctrl+r to collapse)</Text></Box>
        </Box>
      )}
      {!isExpanded && isClean && <Box marginLeft={4}><Text dimColor>└  </Text><Text color="white">clean working tree</Text></Box>}
    </Box>
  );
}

function GitDiffOutput({ toolCall }: { toolCall: ToolCall }) {
  const raw = toolCall.rawResult as any;
  const diff = raw?.diff as string | undefined;
  const isExpanded = toolCall.isExpanded || false;
  const isEmpty = raw?.isEmpty;

  if (toolCall.status === "running") {
    return <Box flexDirection="column" marginTop={1}><Box><StatusIcon status="running" /><Text color="white" bold> Git diff</Text></Box></Box>;
  }

  if (isEmpty) {
    return <Box flexDirection="column" marginTop={1}><Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Git diff</Text><Text color="white"> — no changes</Text></Box></Box>;
  }

  if (!isExpanded) {
    const preview = diff ? diff.split("\n").slice(0, 2).join(" ").slice(0, 80) : "diff";
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Git diff</Text></Box>
        <Box marginLeft={4} flexDirection="column">
          <Box><Text dimColor>└  </Text><Text color="white">{preview}...</Text></Box>
          <Box marginLeft={2}><Text dimColor>   (ctrl+r to expand)</Text></Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Git diff</Text></Box>
      <Box marginLeft={4} flexDirection="column">
        {(diff ? diff.split("\n").slice(0, 30) : []).map((line: string, idx: number) => (
          <Box key={idx}><Text dimColor>{idx === 29 ? "└  " : "├  "}</Text><Text color={line.startsWith("+") ? Colors.AccentGreen : line.startsWith("-") ? Colors.AccentRed : "white"}>{line.slice(0, 100)}</Text></Box>
        ))}
        <Box marginLeft={2}><Text dimColor>   (ctrl+r to collapse)</Text></Box>
      </Box>
    </Box>
  );
}

function GitLogOutput({ toolCall }: { toolCall: ToolCall }) {
  const raw = toolCall.rawResult as any;
  const log = raw?.log as string | undefined;
  const count = raw?.count as number | undefined;
  const isExpanded = toolCall.isExpanded || false;

  if (toolCall.status === "running") {
    return <Box flexDirection="column" marginTop={1}><Box><StatusIcon status="running" /><Text color="white" bold> Git log</Text></Box></Box>;
  }

  const lines = log ? log.split("\n") : [];

  if (!isExpanded && lines.length > 4) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Git log</Text><Text color="white"> — {count ?? lines.length} commits</Text></Box>
        <Box marginLeft={4} flexDirection="column">
          {lines.slice(0, 3).map((line: string, idx: number) => (
            <Box key={idx}><Text dimColor>├  </Text><Text color="white">{line.slice(0, 80)}</Text></Box>
          ))}
          <Box><Text dimColor>└  </Text><Text color="white">+{lines.length - 3} more</Text></Box>
          <Box marginLeft={2}><Text dimColor>   (ctrl+r to expand)</Text></Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box><StatusIcon status={toolCall.status} /><Text color="white" bold> Git log</Text><Text color="white"> — {count ?? lines.length} commits</Text></Box>
      <Box marginLeft={4} flexDirection="column">
        {(isExpanded ? lines : lines.slice(0, 5)).map((line: string, idx: number, arr: string[]) => (
          <Box key={idx}><Text dimColor>{idx === arr.length - 1 ? "└  " : "├  "}</Text><Text color="white">{line.slice(0, 100)}</Text></Box>
        ))}
        {isExpanded ? <Box marginLeft={2}><Text dimColor>   (ctrl+r to collapse)</Text></Box> : lines.length > 5 && <Box marginLeft={2}><Text dimColor>   (ctrl+r to expand)</Text></Box>}
      </Box>
    </Box>
  );
}

export function ToolOutput({ toolCall }: ToolOutputProps) {
  const { toolName, input, status, resultSummary, stdout, stderr } = toolCall;

  if (toolName === "read_many_files") return <ReadManyFilesOutput toolCall={toolCall} />;
  if (toolName === "read_file") return <ReadFileOutput toolCall={toolCall} />;
  if (toolName === "list_files") return <ListFilesOutput toolCall={toolCall} />;
  if (toolName === "glob_files") return <GlobFilesOutput toolCall={toolCall} />;
  if (toolName === "search_files") return <SearchFilesOutput toolCall={toolCall} />;
  if (toolName === "git_status") return <GitStatusOutput toolCall={toolCall} />;
  if (toolName === "git_diff") return <GitDiffOutput toolCall={toolCall} />;
  if (toolName === "git_log") return <GitLogOutput toolCall={toolCall} />;

  const inputSummary = formatInput(input);
  const formattedName = toolName.charAt(0).toUpperCase() + toolName.slice(1);
  let userFacingName = formattedName;
  if (toolName === "write_file") userFacingName = "Write";
  if (toolName === "edit_file" || toolName === "apply_patch") userFacingName = "Update";
  if (toolName === "list_files" || toolName === "glob_files") userFacingName = "Search";
  if (toolName === "search_files") userFacingName = "Grep";

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
  const isUpdate = toolName === "edit_file" || toolName === "apply_patch";
  const targetPath = String(input.path || input.file || "file");

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginLeft={0}>
        <StatusIcon status={status} />
        <Text color="white" bold> {userFacingName}</Text>
        {inputSummary ? <Text color="white" bold>{inputSummary}</Text> : null}
      </Box>

      {status !== "running" && toolCall.hunks && isWrite && (
        <Box flexDirection="column" marginLeft={4}>
          <Box><Text dimColor>└  </Text><Text color="white">Created {targetPath}</Text></Box>
          <Box><Text dimColor>└    </Text><Text color="white">Added {addedLines} lines</Text></Box>
        </Box>
      )}

      {status !== "running" && toolCall.hunks && isUpdate && (
        <Box flexDirection="column" marginLeft={4}>
          <Box><Text dimColor>└  </Text><Text color="white">Updated {targetPath} with {addedLines} additions and {removedLines} removals</Text></Box>
          <Box><Text dimColor>└    </Text><Text color="white">Added {addedLines}, Removed {removedLines}</Text></Box>
        </Box>
      )}

      {status !== "running" && (!toolCall.hunks || (!isWrite && !isUpdate)) && resultSummary && (
        <Box marginLeft={4}><Text dimColor>└  </Text><Text color="white">{resultSummary}</Text></Box>
      )}

      {toolCall.hunks && toolCall.hunks.length > 0 && (
        <Box marginLeft={7} marginTop={1}>
          <StructuredDiffList hunks={toolCall.hunks} filePath={String(input.path || input.file || "file")} />
        </Box>
      )}

      {!toolCall.hunks && stdout && stdout.trim() && (
        <Box flexDirection="column" marginLeft={7} marginTop={0}>
          {stdout.trim().split("\n").slice(0, 15).map((line, i) => {
            if (line.startsWith("+")) return <Text key={i} backgroundColor={Colors.DiffAdded} color={Colors.Background}>{line}</Text>;
            if (line.startsWith("-")) return <Text key={i} backgroundColor={Colors.DiffRemoved} color={Colors.Background}>{line}</Text>;
            return <Text key={i} dimColor>{line}</Text>;
          })}
          {stdout.trim().split("\n").length > 15 && <Text dimColor>... ({stdout.trim().split("\n").length - 15} more)</Text>}
        </Box>
      )}

      {stderr && stderr.trim() && (
        <Box flexDirection="column" marginLeft={7}>
          {stderr.trim().split("\n").slice(0, 10).map((line, i) => (
            <Text key={i} color={status === "error" ? "red" : "yellow"}>{line}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
