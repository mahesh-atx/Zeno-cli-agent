// src/tools/index.ts
import { z, ZodError } from "zod";

import { ReadFileSchema, readFile } from "./readFile";
import { WriteFileSchema, writeFile } from "./writeFile";
import { EditFileSchema, editFile } from "./editFile";
import { ListFilesSchema, listFiles } from "./listFiles";
import { RunCommandSchema, runCommand } from "./runCommand";
import { catchToolError } from "../errors/toolErrors";

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