import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const ReadFileSchema = z.object({
  path: z.string().describe("Relative or absolute path to the file to read"),
  startLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional start line (1-indexed) for partial read"),
  endLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional end line (1-indexed) for partial read"),
});

export type ReadFileInput = z.infer<typeof ReadFileSchema>;

// ─── Output ───────────────────────────────────────────────────────────────────

export interface ReadFileOutput {
  success: true;
  content: string;
  lines: number;
  size: number;
  path: string;
}

export interface ReadFileError {
  success: false;
  error: string;
  path: string;
}

export type ReadFileResult = ReadFileOutput | ReadFileError;

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function readFile(input: ReadFileInput): Promise<ReadFileResult> {
  const resolved = path.resolve(process.cwd(), input.path);

  try {
    // Check file exists
    const stat = fs.statSync(resolved);

    if (stat.isDirectory()) {
      return {
        success: false,
        error: `Path is a directory, not a file: ${input.path}`,
        path: input.path,
      };
    }

    const raw = fs.readFileSync(resolved, "utf-8");
    const allLines = raw.split("\n");
    const totalLines = allLines.length;

    let content: string;

    if (input.startLine !== undefined || input.endLine !== undefined) {
      const start = (input.startLine ?? 1) - 1; // convert to 0-indexed
      const end = input.endLine ?? totalLines; // inclusive
      const sliced = allLines.slice(start, end);
      content = sliced.join("\n");
    } else {
      content = raw;
    }

    return {
      success: true,
      content,
      lines: totalLines,
      size: Buffer.byteLength(raw, "utf-8"),
      path: input.path,
    };
  } catch (error) {
    if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === "ENOENT") {
        return {
          success: false,
          error: `File not found: ${input.path}`,
          path: input.path,
        };
      }

      if (nodeError.code === "EACCES") {
        return {
          success: false,
          error: `Permission denied: ${input.path}`,
          path: input.path,
        };
      }

      return {
        success: false,
        error: `Could not read file: ${error.message}`,
        path: input.path,
      };
    }

    return {
      success: false,
      error: "Unknown error reading file",
      path: input.path,
    };
  }
}
