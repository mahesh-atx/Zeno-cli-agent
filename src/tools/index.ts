// src/tools/index.ts
import { z, ZodError, ZodObject, ZodRawShape } from "zod";

import { ReadFileSchema, readFile } from "./readFile";
import { WriteFileSchema, writeFile } from "./writeFile";
import { EditFileSchema, editFile } from "./editFile";
import { ListFilesSchema, listFiles } from "./listFiles";
import { RunCommandSchema, runCommand } from "./runCommand";
import { catchToolError } from "../errors/toolErrors";
import { WebSearchSchema, webSearch } from "./webSearch";
import { WebFetchSchema, webFetch } from "./webFetch";
import { SearchFilesSchema, searchFiles } from "./searchFiles";
import { GlobFilesSchema, globFiles } from "./globFiles";
import { DeleteFileSchema, deleteFile } from "./deleteFile";
import { TodoWriteSchema, todoWrite } from "./todoWrite";
import { AskQuestionSchema, askQuestion } from "./askQuestion";
import { SendMessageSchema, sendMessage } from "./sendMessage";
import { ApplyPatchSchema, applyPatch } from "./applyPatch";
import { ReadManyFilesSchema, readManyFiles } from "./readManyFiles";
import { GitStatusSchema, gitStatus } from "./gitStatus";
import { GitDiffSchema, gitDiff } from "./gitDiff";
import { GitLogSchema, gitLog } from "./gitLog";

// ─── Tool Definition ─────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  execute: (input: unknown) => Promise<unknown>;
}

// ─── Tool Wrapper ────────────────────────────────────────────────────────────

function wrapExecute<Schema extends ZodObject<ZodRawShape>, Output>(
  name: string,
  schema: Schema,
  fn: (input: z.infer<Schema>) => Promise<Output>
): (input: unknown) => Promise<unknown> {
  return async (rawInput: unknown) => {
    try {
      // 1. Parse once in wrapper (single source of validation)
      const parsed = schema.parse(rawInput) as z.infer<Schema>;
      const result = await fn(parsed);

      // Hint injection for LLM attention
      if (result && typeof result === "object" && "hints" in result) {
        const res = result as Record<string, unknown>;
        if (Array.isArray(res.hints) && (res.hints as string[]).length > 0) {
          (res as any)._agent_instructions = [
            "=== SYSTEM HINTS ===",
            ...(res.hints as string[]).map((h: string) => `* ${h}`),
            "====================",
            "Action Required: Read these hints and adjust your next tool call accordingly. Do not ask the user for help.",
          ].join("\n");
        }
      }

      return result;
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.issues.map((issue) => {
          const field = issue.path.length > 0 ? issue.path.join(".") : "root object";
          return `  - Field '${field}': ${issue.message}`;
        }).join("\n");

        return {
          success: false,
          error: `Invalid arguments for '${name}'.`,
          _agent_instructions: [
            `SCHEMA VIOLATION: Your JSON arguments for '${name}' were invalid.`,
            formattedErrors,
            "",
            "Please correct your tool call parameters and try again. Do not ask the user for help.",
          ].join("\n"),
        };
      }
      return catchToolError(name, error);
    }
  };
}

// ─── Tool Registry ───────────────────────────────────────────────────────────

export const TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description:
      "Read file contents. Auto-corrects minor path typos. Guards: blocks binary, oversize (>5MB), outside project root, protected dirs (node_modules, .git). Returns directory listing if path is a directory. Use startLine/endLine to read slices of large files.",
    schema: ReadFileSchema,
    execute: wrapExecute("read_file", ReadFileSchema, readFile as any),
  },
  {
    name: "write_file",
    description:
      "Write or overwrite a file. Creates parent directories. Blocks protected paths and outside-project writes. Max 2MB. Atomic write (temp+rename). Never use to delete a file.",
    schema: WriteFileSchema,
    execute: wrapExecute("write_file", WriteFileSchema, writeFile as any),
  },
  {
    name: "edit_file",
    description:
      "Edit a file by replacing an exact string (must be unique). Whitespace-tolerant auto-correct, rejects trivial single-char matches and mass-replacements. Max resulting file 2MB. Always read_file first.",
    schema: EditFileSchema,
    execute: wrapExecute("edit_file", EditFileSchema, editFile as any),
  },
  {
    name: "list_files",
    description:
      "List files and directories (top-level by default, recursive optional). Respects .gitignore, ignores junk (node_modules, .git). Blocks outside root and protected. Use to orient in new project.",
    schema: ListFilesSchema,
    execute: wrapExecute("list_files", ListFilesSchema, listFiles as any),
  },
  {
    name: "run_command",
    description:
      "Run a shell command (default 60s timeout, max 120s). Blocks destructive commands (rm -rf /, fork bomba, curl|sh, mkfs). Truncates massive outputs to protect context. Provides hints on compilation/test failures.",
    schema: RunCommandSchema,
    execute: wrapExecute("run_command", RunCommandSchema, runCommand as any),
  },
  {
    name: "web_search",
    description:
      "Search the web using DuckDuckGo (html + lite fallback, 10s timeout, 1s rate limit). Returns top 5 results with titles, URLs, snippets. Use for docs, StackOverflow, package info.",
    schema: WebSearchSchema,
    execute: wrapExecute("web_search", WebSearchSchema, webSearch as any),
  },
  {
    name: "web_fetch",
    description:
      "Fetch a URL and extract content as Markdown. Blocks private IPs, file://, binary, oversize (>2MB). 15s timeout. Strips nav/ads. Truncates to 15k chars.",
    schema: WebFetchSchema,
    execute: wrapExecute("web_fetch", WebFetchSchema, webFetch as any),
  },
  {
    name: "search_files",
    description:
      "Search file contents across codebase (like grep). Respects .gitignore, skips binary and >1MB files, avoids symlink loops. Returns max 50 matches (configurable). Supports filePattern filtering (extension or substring).",
    schema: SearchFilesSchema,
    execute: wrapExecute("search_files", SearchFilesSchema, searchFiles as any),
  },
  {
    name: "glob_files",
    description:
      "Find files by glob pattern (e.g., '**/*.ts'). Respects .gitignore, ignores node_modules/.git, does not follow symlinks. Returns up to 100 sorted results.",
    schema: GlobFilesSchema,
    execute: wrapExecute("glob_files", GlobFilesSchema, globFiles as any),
  },
  {
    name: "delete_file",
    description:
      "Safely delete a file or directory. Requires recursive:true for dirs. Blocks protected paths and outside root. Symlink-safe (doesn't follow symlink dirs). Reports deleted paths, supports dryRun.",
    schema: DeleteFileSchema,
    execute: wrapExecute("delete_file", DeleteFileSchema, deleteFile as any),
  },
  {
    name: "todo_write",
    description:
      "Manage persistent task list to track multi-step refactors. Actions: list/add/update/delete. Uses atomic write and UUIDs, per-cwd path.",
    schema: TodoWriteSchema,
    execute: wrapExecute("todo_write", TodoWriteSchema, todoWrite as any),
  },
  {
    name: "ask_question",
    description:
      "Pause execution and ask user for clarification. Max question 1000 chars, max 8 options of 100 chars each. Loop pauses, waits for user's reply.",
    schema: AskQuestionSchema,
    execute: wrapExecute("ask_question", AskQuestionSchema, askQuestion as any),
  },
  {
    name: "send_message",
    description:
      "Send formatted progress update mid-execution. Max 5000 chars, title max 200 chars. Set ends_turn:true if task concludes.",
    schema: SendMessageSchema,
    execute: wrapExecute("send_message", SendMessageSchema, sendMessage as any),
  },
  {
    name: "apply_patch",
    description:
      "Apply unified diff patch to one or more files. Max 10 files, 100 hunks, 2MB patch. Supports fuzzy drift up to 15 lines with accurate offset fix. Validates all before writing, atomic writes, dryRun. Use after reading files.",
    schema: ApplyPatchSchema,
    execute: wrapExecute("apply_patch", ApplyPatchSchema, applyPatch as any),
  },
  {
    name: "read_many_files",
    description:
      "Read multiple files in parallel (max 10). Each file checked for binary, size (5MB), safe path. Returns combined tokens/bytes. Use to reduce roundtrips when you need several files at once.",
    schema: ReadManyFilesSchema,
    execute: wrapExecute("read_many_files", ReadManyFilesSchema, readManyFiles as any),
  },
  {
    name: "git_status",
    description:
      "Show git working tree status (like git status --porcelain). Reports branch, clean/dirty, changes. No permission needed (read-only).",
    schema: GitStatusSchema,
    execute: wrapExecute("git_status", GitStatusSchema, gitStatus as any),
  },
  {
    name: "git_diff",
    description:
      "Show git diff (unstaged by default, staged with staged:true). Supports path filter and stat summary. Truncates large diffs to 30k chars. Read-only.",
    schema: GitDiffSchema,
    execute: wrapExecute("git_diff", GitDiffSchema, gitDiff as any),
  },
  {
    name: "git_log",
    description:
      "Show git commit history (default 20, max 100). Supports oneline and path filter. Read-only, useful to understand recent changes.",
    schema: GitLogSchema,
    execute: wrapExecute("git_log", GitLogSchema, gitLog as any),
  },
];

// ─── Lookup ──────────────────────────────────────────────────────────────────

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

// ─── AI SDK Tool Format ──────────────────────────────────────────────────────

export function buildAISDKTools(): Record<
  string,
  { description: string; parameters: z.ZodObject<z.ZodRawShape> }
> {
  const result: Record<
    string,
    { description: string; parameters: z.ZodObject<z.ZodRawShape> }
  > = {};

  for (const tool of TOOLS) {
    result[tool.name] = {
      description: tool.description,
      parameters: tool.schema,
    };
  }

  return result;
}
