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
  isLast?: boolean;
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

function useExpandable(isLast: boolean | undefined, initial = false) {
  const [isExpanded, setIsExpanded] = useState(initial);
  
  useInput(
    (input, key) => {
      if (key.ctrl && (input.toLowerCase() === "r" || input.toLowerCase() === "e")) {
        setIsExpanded(prev => !prev);
      }
    },
    { isActive: !!isLast }
  );

  return [isExpanded, setIsExpanded] as const;
}

// ─── Read Many Files ──────────────────────────────────────────────────────────
function ReadManyFilesOutput({ toolCall, isLast }: { toolCall: ToolCall; isLast?: boolean }) {
  const [isExpanded, setIsExpanded] = useExpandable(isLast, toolCall.isExpanded || false);
  const input = toolCall.input as { paths?: string[] };
  const raw = toolCall.rawResult as any;
  const paths = input.paths || [];
  const results = raw?.results as Array<{ path: string; success: boolean; lines?: number; tokens?: number; error?: string }> | undefined;
  const totalFiles = paths.length;
  const successCount = results ? results.filter(r => r.success).length : 0;
  const displayFiles = (results || paths.map(p => ({ path: p, success: true }))) as Array<{ path: string; success: boolean; lines?: number; tokens?: number; error?: string }>;

  // Also allow internal toggle via ctrl+r global, but we handle via useExpandable
  // isExpanded state is local, not dependent on parent Static re-render

  if (toolCall.status === "running") {
    return (
      <Box flexDirection="column">
        <Text><StatusIcon status="running" /><Text color="white" bold> Read {totalFiles} files</Text></Text>
        <Text dimColor>   └  Reading {paths.slice(0, 3).join(", ")}{totalFiles > 3 ? ` +${totalFiles - 3} more` : ""}...</Text>
      </Box>
    );
  }

  if (!isExpanded) {
    const firstThree = displayFiles.slice(0, 3).map(f => f.path.split("/").pop() || f.path);
    const remaining = displayFiles.length - 3;
    const fileList = remaining > 0 ? `${firstThree.join(", ")} +${remaining} more` : firstThree.join(", ");
    return (
      <Box flexDirection="column">
        <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Read {successCount || totalFiles} files</Text></Text>
        <Text><Text dimColor>   └  </Text><Text color="white">{fileList}</Text></Text>
        <Text dimColor>      (ctrl+r to expand)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Read {successCount || totalFiles} files</Text><Text dimColor> ({totalFiles} requested)</Text></Text>
      {displayFiles.map((file, idx) => {
        const isLastFile = idx === displayFiles.length - 1;
        const icon = file.success ? "✓" : "✗";
        const color = file.success ? Colors.AccentGreen : Colors.AccentRed;
        return <Text key={idx}><Text dimColor>   {isLastFile ? "└  " : "├  "}</Text><Text color={color}>{icon} </Text><Text color="white">{file.path}</Text>{file.success && file.lines !== undefined && <Text dimColor> ({file.lines} lines{file.tokens ? `, ~${file.tokens}` : ""})</Text>}{!file.success && file.error && <Text color={Colors.AccentRed}> — {file.error.slice(0, 60)}</Text>}</Text>;
      })}
      <Text dimColor>      (ctrl+r to collapse)</Text>
    </Box>
  );
}

// ─── List Files ───────────────────────────────────────────────────────────────
function ListFilesOutput({ toolCall, isLast }: { toolCall: ToolCall; isLast?: boolean }) {
  const [isExpanded] = useExpandable(isLast, toolCall.isExpanded || false);
  // Actually use same hook but we need setter from useExpandable, so redo
  return <ListFilesInner toolCall={toolCall} isLast={isLast} />;
}

function ListFilesInner({ toolCall, isLast }: { toolCall: ToolCall; isLast?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(toolCall.isExpanded || false);
  useInput(
    (input, key) => {
      if (key.ctrl && (input.toLowerCase() === "r" || input.toLowerCase() === "e")) {
        if (isLast) setIsExpanded(p => !p);
      }
    },
    { isActive: !!isLast }
  );

  const raw = toolCall.rawResult as any;
  const entries = (raw?.entries || []) as string[];
  const pathArg = (toolCall.input as any).path || ".";

  if (toolCall.status === "running") {
    return <Box flexDirection="column"><Text><StatusIcon status="running" /><Text color="white" bold> Search ({pathArg})</Text></Text></Box>;
  }

  if (!isExpanded) {
    const collapsed = entries.slice(0, 5).map(e => e.replace(/^\[.*?\]\s+/, "").split(" ")[0]);
    const remaining = entries.length - 5;
    return (
      <Box flexDirection="column">
        <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Search ({pathArg})</Text>{entries.length > 0 && <Text color="white"> — {entries.length} items</Text>}</Text>
        {entries.length > 0 && <Text><Text dimColor>   └  </Text><Text color="white">{collapsed.join(", ")}{remaining > 0 ? ` +${remaining} more` : ""}</Text></Text>}
        {entries.length > 5 && <Text dimColor>      (ctrl+r to expand)</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Search ({pathArg})</Text><Text color="white"> — {entries.length} items</Text></Text>
      {entries.map((e, idx) => {
        const isLastFile = idx === entries.length - 1;
        return <Text key={idx}><Text dimColor>   {isLastFile ? "└  " : "├  "}</Text><Text color="white">{e}</Text></Text>;
      })}
      <Text dimColor>      (ctrl+r to collapse)</Text>
    </Box>
  );
}

// ─── Glob Files ─────────────────────────────────────────────────────────────
function GlobFilesOutput({ toolCall, isLast }: { toolCall: ToolCall; isLast?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(toolCall.isExpanded || false);
  useInput(
    (input, key) => {
      if (key.ctrl && (input.toLowerCase() === "r" || input.toLowerCase() === "e") && isLast) {
        setIsExpanded(p => !p);
      }
    },
    { isActive: !!isLast }
  );

  const raw = toolCall.rawResult as any;
  const files = (raw?.files || []) as string[];
  const total = raw?.total as number | undefined;
  const pattern = (toolCall.input as any).pattern || "**";

  if (toolCall.status === "running") {
    return <Box flexDirection="column"><Text><StatusIcon status="running" /><Text color="white" bold> Search ({pattern})</Text></Text></Box>;
  }

  if (!isExpanded && files.length > 5) {
    const first = files.slice(0, 3).map(f => f.split("/").pop()).join(", ");
    return (
      <Box flexDirection="column">
        <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Search ({pattern})</Text><Text color="white"> — {total ?? files.length} matches</Text></Text>
        <Text><Text dimColor>   └  </Text><Text color="white">{first} +{files.length - 3} more</Text></Text>
        <Text dimColor>      (ctrl+r to expand)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Search ({pattern})</Text><Text color="white"> — {total ?? files.length} matches{(raw?.truncated ? " (truncated)" : "")}</Text></Text>
      {isExpanded ? files.map((f, idx) => {
        const isLastFile = idx === files.length - 1;
        return <Text key={idx}><Text dimColor>   {isLastFile ? "└  " : "├  "}</Text><Text color="white">{f}</Text></Text>;
      }) : files.length > 0 && files.length <= 5 && <Text><Text dimColor>   └  </Text><Text color="white">{files.map(f => f.split("/").pop()).join(", ")}</Text></Text>}
      {isExpanded && <Text dimColor>      (ctrl+r to collapse)</Text>}
    </Box>
  );
}

// ─── Search Files ───────────────────────────────────────────────────────────
function SearchFilesOutput({ toolCall, isLast }: { toolCall: ToolCall; isLast?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(toolCall.isExpanded || false);
  useInput(
    (input, key) => {
      if (key.ctrl && (input.toLowerCase() === "r" || input.toLowerCase() === "e") && isLast) {
        setIsExpanded(p => !p);
      }
    },
    { isActive: !!isLast }
  );

  const raw = toolCall.rawResult as any;
  const matches = (raw?.matches || []) as Array<{ file: string; line: number; content: string }>;
  const total = raw?.total as number | undefined;
  const query = (toolCall.input as any).query || "";

  if (toolCall.status === "running") {
    return <Box flexDirection="column"><Text><StatusIcon status="running" /><Text color="white" bold> Grep "{query}"</Text></Text></Box>;
  }

  if (!isExpanded && matches.length > 3) {
    const preview = matches.slice(0, 2).map(m => `${m.file.split("/").pop()}:${m.line}`).join(", ");
    return (
      <Box flexDirection="column">
        <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Grep "{query}"</Text><Text color="white"> — {total ?? matches.length} matches</Text></Text>
        <Text><Text dimColor>   └  </Text><Text color="white">{preview} +{matches.length - 2} more</Text></Text>
        <Text dimColor>      (ctrl+r to expand)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Grep "{query}"</Text><Text color="white"> — {total ?? matches.length} matches</Text></Text>
      {(isExpanded ? matches : matches.slice(0, 5)).map((m, idx, arr) => {
        const isLastFile = idx === arr.length - 1;
        return <Text key={idx}><Text dimColor>   {isLastFile ? "└  " : "├  "}</Text><Text color="white">{m.file}:{m.line}</Text><Text dimColor> — {m.content.slice(0, 50)}</Text></Text>;
      })}
      {isExpanded ? <Text dimColor>      (ctrl+r to collapse)</Text> : matches.length > 5 && <Text dimColor>      (ctrl+r to expand)</Text>}
    </Box>
  );
}

// ─── Read File ──────────────────────────────────────────────────────────────
function ReadFileOutput({ toolCall, isLast }: { toolCall: ToolCall; isLast?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(toolCall.isExpanded || false);
  useInput(
    (input, key) => {
      if (key.ctrl && (input.toLowerCase() === "r" || input.toLowerCase() === "e") && isLast) {
        setIsExpanded(p => !p);
      }
    },
    { isActive: !!isLast }
  );

  const raw = toolCall.rawResult as any;
  const pathArg = (toolCall.input as any).path || "file";
  const content = raw?.content as string | undefined;
  const lines = raw?.lines as number | undefined;
  const totalLines = raw?.totalLines as number | undefined;
  const size = raw?.size as number | undefined;

  if (toolCall.status === "running") {
    return <Box flexDirection="column"><Text><StatusIcon status="running" /><Text color="white" bold> Read ({pathArg})</Text></Text></Box>;
  }

  if (!isExpanded) {
    return (
      <Box flexDirection="column">
        <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Read ({pathArg})</Text></Text>
        <Text><Text dimColor>   └  </Text><Text color="white">{lines ?? totalLines ?? "?"} lines{size ? `, ${(size/1024).toFixed(1)} KB` : ""}</Text></Text>
        <Text dimColor>      (ctrl+r to expand)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Read ({pathArg})</Text><Text color="white"> — {lines ?? totalLines ?? "?"} lines{size ? `, ${(size/1024).toFixed(1)} KB` : ""}</Text></Text>
      {content && content.split("\n").slice(0, 15).map((line, idx, arr) => (
        <Text key={idx}><Text dimColor>   {idx === arr.length - 1 || idx === 14 ? "└  " : "├  "}</Text><Text color="white">{line.slice(0, 100)}</Text></Text>
      ))}
      {content && content.split("\n").length > 15 && <Text dimColor>      ... {content.split("\n").length - 15} more lines</Text>}
      <Text dimColor>      (ctrl+r to collapse)</Text>
    </Box>
  );
}

// ─── Git Status ─────────────────────────────────────────────────────────────
function GitStatusOutput({ toolCall, isLast }: { toolCall: ToolCall; isLast?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(toolCall.isExpanded || false);
  useInput((input, key) => { if (key.ctrl && (input?.toLowerCase() === "r" || input?.toLowerCase() === "e") && isLast) setIsExpanded(p => !p); }, { isActive: !!isLast });

  const raw = toolCall.rawResult as any;
  const isClean = raw?.isClean;
  const branch = raw?.branch;
  const output = raw?.output as string | undefined;

  if (toolCall.status === "running") {
    return <Box flexDirection="column"><Text><StatusIcon status="running" /><Text color="white" bold> Git status</Text></Text></Box>;
  }

  return (
    <Box flexDirection="column">
      <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Git status{branch ? ` (${branch})` : ""}</Text>{isClean !== undefined && <Text color={isClean ? Colors.AccentGreen : Colors.AccentYellow}> {isClean ? "clean" : "dirty"}</Text>}</Text>
      {isClean === false && !isExpanded && output && <><Text><Text dimColor>   └  </Text><Text color="white">{output.split("\n").slice(0, 3).join(", ").slice(0, 80)}...</Text></Text><Text dimColor>      (ctrl+r to expand)</Text></>}
      {isExpanded && output && <><Text><Text dimColor>   └  </Text><Text color="white">{output.split("\n").slice(0, 20).join("\n   ")}</Text></Text><Text dimColor>      (ctrl+r to collapse)</Text></>}
      {!isExpanded && isClean && <Text><Text dimColor>   └  </Text><Text color="white">clean working tree</Text></Text>}
    </Box>
  );
}

function GitDiffOutput({ toolCall, isLast }: { toolCall: ToolCall; isLast?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(toolCall.isExpanded || false);
  useInput((input, key) => { if (key.ctrl && (input?.toLowerCase() === "r" || input?.toLowerCase() === "e") && isLast) setIsExpanded(p => !p); }, { isActive: !!isLast });

  const raw = toolCall.rawResult as any;
  const diff = raw?.diff as string | undefined;
  const isEmpty = raw?.isEmpty;

  if (toolCall.status === "running") return <Box flexDirection="column"><Text><StatusIcon status="running" /><Text color="white" bold> Git diff</Text></Text></Box>;
  if (isEmpty) return <Box flexDirection="column"><Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Git diff</Text><Text color="white"> — no changes</Text></Text></Box>;

  if (!isExpanded) {
    const preview = diff ? diff.split("\n").slice(0, 2).join(" ").slice(0, 80) : "diff";
    return (
      <Box flexDirection="column">
        <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Git diff</Text></Text>
        <Text><Text dimColor>   └  </Text><Text color="white">{preview}...</Text></Text>
        <Text dimColor>      (ctrl+r to expand)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Git diff</Text></Text>
      {(diff ? diff.split("\n").slice(0, 30) : []).map((line: string, idx: number) => (
        <Text key={idx}><Text dimColor>   {idx === 29 ? "└  " : "├  "}</Text><Text color={line.startsWith("+") ? Colors.AccentGreen : line.startsWith("-") ? Colors.AccentRed : "white"}>{line.slice(0, 100)}</Text></Text>
      ))}
      <Text dimColor>      (ctrl+r to collapse)</Text>
    </Box>
  );
}

function GitLogOutput({ toolCall, isLast }: { toolCall: ToolCall; isLast?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(toolCall.isExpanded || false);
  useInput((input, key) => { if (key.ctrl && (input?.toLowerCase() === "r" || input?.toLowerCase() === "e") && isLast) setIsExpanded(p => !p); }, { isActive: !!isLast });

  const raw = toolCall.rawResult as any;
  const log = raw?.log as string | undefined;
  const count = raw?.count as number | undefined;
  const lines = log ? log.split("\n") : [];

  if (toolCall.status === "running") return <Box flexDirection="column"><Text><StatusIcon status="running" /><Text color="white" bold> Git log</Text></Text></Box>;

  if (!isExpanded && lines.length > 4) {
    return (
      <Box flexDirection="column">
        <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Git log</Text><Text color="white"> — {count ?? lines.length} commits</Text></Text>
        {lines.slice(0, 3).map((line: string, idx: number) => (
          <Text key={idx}><Text dimColor>   ├  </Text><Text color="white">{line.slice(0, 80)}</Text></Text>
        ))}
        <Text><Text dimColor>   └  </Text><Text color="white">+{lines.length - 3} more</Text></Text>
        <Text dimColor>      (ctrl+r to expand)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Git log</Text><Text color="white"> — {count ?? lines.length} commits</Text></Text>
      {(isExpanded ? lines : lines.slice(0, 5)).map((line: string, idx: number, arr: string[]) => (
        <Text key={idx}><Text dimColor>   {idx === arr.length - 1 ? "└  " : "├  "}</Text><Text color="white">{line.slice(0, 100)}</Text></Text>
      ))}
      {isExpanded ? <Text dimColor>      (ctrl+r to collapse)</Text> : lines.length > 5 && <Text dimColor>      (ctrl+r to expand)</Text>}
    </Box>
  );
}


function RunCommandOutput({ toolCall, isLast }: { toolCall: ToolCall; isLast?: boolean }) {
  const [isExpanded, setIsExpanded] = React.useState(toolCall.isExpanded || false);
  const { useInput } = require("ink");
  useInput(
    (input: string, key: any) => {
      if (key.ctrl && (input?.toLowerCase() === "r" || input?.toLowerCase() === "e") && isLast) {
        setIsExpanded((p: boolean) => !p);
      }
    },
    { isActive: !!isLast }
  );

  const command = (toolCall.input as any).command || "command";
  const exitCode = (toolCall.rawResult as any)?.exitCode;
  const stdout = toolCall.stdout || (toolCall.rawResult as any)?.stdout || "";
  const stderr = toolCall.stderr || (toolCall.rawResult as any)?.stderr || "";
  const combined = (stdout + "\n" + stderr).trim();
  const lines = combined ? combined.split("\n").filter((l: string) => l.trim().length > 0) : [];

  if (toolCall.status === "running") {
    return (
      <Box flexDirection="column">
        <Text><StatusIcon status="running" /><Text color="white" bold> Run ({String(command).slice(0, 40)})</Text></Text>
      </Box>
    );
  }

  const summary = toolCall.resultSummary || (exitCode !== undefined ? `exit ${exitCode}` : "done");

  if (!isExpanded && lines.length > 8) {
    return (
      <Box flexDirection="column">
        <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Run ({String(command).slice(0, 30)}...)</Text><Text color="white"> — {summary}</Text></Text>
        {lines.slice(0, 4).map((line: string, i: number) => (
          <Text key={i}><Text dimColor>   ├  </Text><Text color="white">{line.slice(0, 80)}</Text></Text>
        ))}
        <Text><Text dimColor>   └  </Text><Text dimColor>... {lines.length - 4} more lines</Text></Text>
        <Text dimColor>      (ctrl+r to expand)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text><StatusIcon status={toolCall.status} /><Text color="white" bold> Run ({String(command).slice(0, 50)})</Text><Text color="white"> — {summary}</Text></Text>
      {(isExpanded ? lines : lines.slice(0, 12)).map((line: string, idx: number, arr: string[]) => {
        const isLastLine = idx === arr.length - 1;
        const isError = line.toLowerCase().includes("error") || line.toLowerCase().includes("fail");
        return <Text key={idx}><Text dimColor>   {isLastLine ? "└  " : "├  "}</Text><Text color={isError ? Colors.AccentRed : "white"}>{line.slice(0, 120)}</Text></Text>;
      })}
      {isExpanded ? <Text dimColor>      (ctrl+r to collapse)</Text> : lines.length > 12 && <Text dimColor>      (ctrl+r to expand, {lines.length} lines total)</Text>}
    </Box>
  );
}


export function ToolOutput({ toolCall, isLast }: ToolOutputProps) {
  const { toolName, input, status, resultSummary, stdout, stderr } = toolCall;

  if (toolName === "read_many_files") return <ReadManyFilesOutput toolCall={toolCall} isLast={isLast} />;
  if (toolName === "read_file") return <ReadFileOutput toolCall={toolCall} isLast={isLast} />;
  if (toolName === "list_files") return <ListFilesOutput toolCall={toolCall} isLast={isLast} />;
  if (toolName === "glob_files") return <GlobFilesOutput toolCall={toolCall} isLast={isLast} />;
  if (toolName === "search_files") return <SearchFilesOutput toolCall={toolCall} isLast={isLast} />;
  if (toolName === "git_status") return <GitStatusOutput toolCall={toolCall} isLast={isLast} />;
  if (toolName === "git_diff") return <GitDiffOutput toolCall={toolCall} isLast={isLast} />;
  if (toolName === "git_log") return <GitLogOutput toolCall={toolCall} isLast={isLast} />;
  if (toolName === "run_command") return <RunCommandOutput toolCall={toolCall} isLast={isLast} />;

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
    <Box flexDirection="column">
      <Text><StatusIcon status={status} /><Text color="white" bold> {userFacingName}</Text>{inputSummary ? <Text color="white" bold>{inputSummary}</Text> : null}</Text>
      {status !== "running" && toolCall.hunks && isWrite && (
        <>
          <Text><Text dimColor>   └  </Text><Text color="white">Created {targetPath}</Text></Text>
          <Text><Text dimColor>      └  </Text><Text color="white">Added {addedLines} lines</Text></Text>
        </>
      )}
      {status !== "running" && toolCall.hunks && isUpdate && (
        <>
          <Text><Text dimColor>   └  </Text><Text color="white">Updated {targetPath} with {addedLines} additions and {removedLines} removals</Text></Text>
          <Text><Text dimColor>      └  </Text><Text color="white">Added {addedLines}, Removed {removedLines}</Text></Text>
        </>
      )}
      {status !== "running" && (!toolCall.hunks || (!isWrite && !isUpdate)) && resultSummary && (
        <Text><Text dimColor>   └  </Text><Text color="white">{resultSummary}</Text></Text>
      )}
      {toolCall.hunks && toolCall.hunks.length > 0 && (
        <Box marginTop={1} marginLeft={3}>
          <StructuredDiffList hunks={toolCall.hunks} filePath={String(input.path || input.file || "file")} />
        </Box>
      )}
      {!toolCall.hunks && stdout && stdout.trim() && (
        <>
          {stdout.trim().split("\n").slice(0, 15).map((line, i) => {
            if (line.startsWith("+")) return <Text key={i} backgroundColor={Colors.DiffAdded} color={Colors.Background}>      {line}</Text>;
            if (line.startsWith("-")) return <Text key={i} backgroundColor={Colors.DiffRemoved} color={Colors.Background}>      {line}</Text>;
            return <Text key={i} dimColor>      {line}</Text>;
          })}
          {stdout.trim().split("\n").length > 15 && <Text dimColor>      ... ({stdout.trim().split("\n").length - 15} more)</Text>}
        </>
      )}
      {stderr && stderr.trim() && (
        <>
          {stderr.trim().split("\n").slice(0, 10).map((line, i) => (
            <Text key={i} color={status === "error" ? "red" : "yellow"}>      {line}</Text>
          ))}
        </>
      )}
    </Box>
  );
}