// src/tools/index.ts
import { z, ZodError } from "zod";

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

// ━━━ Tool Definition ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  execute: (input: unknown) => Promise<unknown>;
}

// ━━━ Tool Wrapper ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function wrapExecute(
  name: string,
  fn: (input: unknown) => Promise<unknown>
): (input: unknown) => Promise<unknown> {
  return async (input: unknown) => {
    try {
      const result = await fn(input);

      // MODERN UPGRADE 1: AI SDK Hint Injection
      // The Vercel AI SDK will JSON.stringify this result. 
      // We inject a highly visible text block so the LLM's attention 
      // mechanism prioritizes the hints over raw JSON keys.
      if (result && typeof result === "object" && "hints" in result) {
        const res = result as any;
        if (Array.isArray(res.hints) && res.hints.length > 0) {
          res._agent_instructions = [
            "=== SYSTEM HINTS ===",
            ...res.hints.map((h: string) => `* ${h}`),
            "====================",
            "Action Required: Read these hints and adjust your next tool call accordingly. Do not ask the user for help."
          ].join("\n");
        }
      }

      return result;
    } catch (error) {
      
      // MODERN UPGRADE 2: Zod Schema Enforcement
      // If the LLM provides invalid JSON arguments, catch the ZodError 
      // and translate it into a self-correcting instruction.
      if (error instanceof ZodError) {
        const formattedErrors = error.issues.map((issue) => {
          const field = issue.path.length > 0 ? issue.path.join(".") : "root object";
          return `  - Field '${field}': ${issue.message}`;
        }).join("\n");

        return {
          success: false,
          error: `Invalid arguments provided to '${name}'.`,
          _agent_instructions: [
            `SCHEMA VIOLATION: Your JSON arguments for '${name}' were invalid.`,
            formattedErrors,
            "",
            "Please correct your tool call parameters and try again. Do not ask the user for help."
          ].join("\n")
        };
      }

      // OS-level or unexpected exception → clean result for LLM
      return catchToolError(name, error);
    }
  };
}

// ━━━ Tool Registry ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    // MODERN UPGRADE 3: Synced Description
    description:
      "Read file contents. Auto-corrects minor path typos. If file is missing, returns directory contents so you can find the correct path without calling list_files.",
    schema: ReadFileSchema,
    execute: wrapExecute("read_file", async (input) => {
      const parsed = ReadFileSchema.parse(input);
      return readFile(parsed);
    }),
  },
  {
    name: "write_file",
    description:
      "Write or overwrite a file. Creates parent directories. Blocks protected paths (node_modules, .git). Never use this to delete a file.",
    schema: WriteFileSchema,
    execute: wrapExecute("write_file", async (input) => {
      const parsed = WriteFileSchema.parse(input);
      return writeFile(parsed);
    }),
  },
  {
    name: "edit_file",
    description:
      "Edit a file by replacing an exact string. Auto-corrects whitespace/indentation mismatches. Refuses mass-replacements to protect file integrity.",
    schema: EditFileSchema,
    execute: wrapExecute("edit_file", async (input) => {
      const parsed = EditFileSchema.parse(input);
      return editFile(parsed);
    }),
  },
  {
    name: "list_files",
    description:
      "List top-level files and directories. Automatically ignores junk (node_modules, .git) to save context. Use this to orient yourself in a new project.",
    schema: ListFilesSchema,
    execute: wrapExecute("list_files", async (input) => {
      const parsed = ListFilesSchema.parse(input);
      return listFiles(parsed);
    }),
  },
  {
    name: "run_command",
    description:
      "Run a shell command (60s timeout). Truncates massive outputs to protect context window. Provides smart hints on compilation or test failures.",
    schema: RunCommandSchema,
    execute: wrapExecute("run_command", async (input) => {
      const parsed = RunCommandSchema.parse(input);
      return runCommand(parsed);
    }),
  },
  {
    name: "web_search",
    description: "Search the web using DuckDuckGo. Returns top 5 results with titles, URLs, and snippets. Use this to find documentation, StackOverflow answers, or package information.",
    schema: WebSearchSchema,
    execute: wrapExecute("web_search", async (input) => {
      const parsed = WebSearchSchema.parse(input);
      return webSearch(parsed);
    }),
  },
  {
    name: "web_fetch",
    description: "Fetch a specific URL and extract its content as Markdown. Use this after web_search to read official docs, articles, or tutorials. Blocks binary downloads.",
    schema: WebFetchSchema,
    execute: wrapExecute("web_fetch", async (input) => {
      const parsed = WebFetchSchema.parse(input);
      return webFetch(parsed);
    }),
  },
  {
    name: "search_files",
    description: "Search file contents across the codebase (like grep). Returns matching lines. Use 'isRegex: true' for complex patterns. Automatically ignores node_modules.",
    schema: SearchFilesSchema,
    execute: wrapExecute("search_files", async (input) => {
      const parsed = SearchFilesSchema.parse(input);
      return searchFiles(parsed);
    }),
  },
  {
    name: "glob_files",
    description: "Find files by path pattern (e.g., '**/*.ts', 'src/**/*.test.js'). Returns a list of file paths. Use this to discover where files are located.",
    schema: GlobFilesSchema,
    execute: wrapExecute("glob_files", async (input) => {
      const parsed = GlobFilesSchema.parse(input);
      return globFiles(parsed);
    }),
  },
  {
    name: "delete_file",
    description: "Safely delete a file or directory. Requires 'recursive: true' for directories. Blocks protected paths like node_modules and .git.",
    schema: DeleteFileSchema,
    execute: wrapExecute("delete_file", async (input) => {
      const parsed = DeleteFileSchema.parse(input);
      return deleteFile(parsed);
    }),
  },
  {
    name: "todo_write",
    description: "Manage a persistent task list to track your progress on complex, multi-step refactors. Use 'list' to see current tasks, 'add' to create, 'update' to change status, and 'delete' to remove.",
    schema: TodoWriteSchema,
    execute: wrapExecute("todo_write", async (input) => {
      const parsed = TodoWriteSchema.parse(input);
      return todoWrite(parsed);
    }),
  },
  {
    name: "ask_question",
    description: "Pause your execution and ask the user for clarification. Use this when requirements are ambiguous. The agent loop will stop and wait for the user's reply.",
    schema: AskQuestionSchema,
    execute: wrapExecute("ask_question", async (input) => {
      const parsed = AskQuestionSchema.parse(input);
      return askQuestion(parsed);
    }),
  },
  {
    name: "send_message",
    description: "Send a formatted progress update or notification to the user mid-execution. Set 'ends_turn: true' if this message concludes your work.",
    schema: SendMessageSchema,
    execute: wrapExecute("send_message", async (input) => {
      const parsed = SendMessageSchema.parse(input);
      return sendMessage(parsed);
    }),
  },
  {
    name: "apply_patch",
    description:
      "Apply a unified diff patch to one or more files simultaneously. " +
      "Use this for large refactors touching multiple files where edit_file " +
      "would be too brittle. Supports fuzzy context matching up to 15 lines " +
      "of drift. Use dryRun: true to validate before applying.",
    schema: ApplyPatchSchema,
    execute: wrapExecute("apply_patch", async (input) => {
      const parsed = ApplyPatchSchema.parse(input);
      return applyPatch(parsed);
    }),
  },
];

// ━━━ Lookup ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

// ━━━ AI SDK Tool Format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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