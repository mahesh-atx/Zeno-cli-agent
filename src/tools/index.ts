import { z } from "zod";

import { ReadFileSchema, readFile } from "./readFile";
import { WriteFileSchema, writeFile } from "./writeFile";
import { EditFileSchema, editFile } from "./editFile";
import { ListFilesSchema, listFiles } from "./listFiles";
import { RunCommandSchema, runCommand } from "./runCommand";

// ─── Tool Definition ──────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  execute: (input: unknown) => Promise<unknown>;
}

// ─── Tool Registry ────────────────────────────────────────────────────────────

export const TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description:
      "Read the contents of a file. Optionally specify startLine and endLine for partial reads.",
    schema: ReadFileSchema,
    execute: async (input) => {
      const parsed = ReadFileSchema.parse(input);
      return readFile(parsed);
    },
  },
  {
    name: "write_file",
    description:
      "Write content to a file. Creates the file if it does not exist. Overwrites if it does. Always asks user permission first.",
    schema: WriteFileSchema,
    execute: async (input) => {
      const parsed = WriteFileSchema.parse(input);
      return writeFile(parsed);
    },
  },
  {
    name: "edit_file",
    description:
      "Edit a file by replacing an exact string with a new string. The searchString must match exactly. Always asks user permission first.",
    schema: EditFileSchema,
    execute: async (input) => {
      const parsed = EditFileSchema.parse(input);
      return editFile(parsed);
    },
  },
  {
    name: "list_files",
    description:
      "List files and directories at a given path. Optionally recursive. Ignores node_modules, .git, dist.",
    schema: ListFilesSchema,
    execute: async (input) => {
      const parsed = ListFilesSchema.parse(input);
      return listFiles(parsed);
    },
  },
  {
    name: "run_command",
    description:
      "Run a shell command. Always asks user permission before executing. Has a 30 second timeout.",
    schema: RunCommandSchema,
    execute: async (input) => {
      const parsed = RunCommandSchema.parse(input);
      return runCommand(parsed);
    },
  },
];

// ─── Lookup ───────────────────────────────────────────────────────────────────

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

// ─── AI SDK Tool Format ───────────────────────────────────────────────────────
// Converts our tool registry into the format expected by the Vercel AI SDK

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
