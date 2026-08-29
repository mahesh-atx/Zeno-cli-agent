import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import {
  assertSafePath,
  isBinaryBuffer,
  checkFileSize,
  LIMITS,
  estimateTokens,
} from "./guards";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const ReadFileSchema = z.object({
  path: z.string().describe("Relative or absolute path to the file to read"),
  startLine: z.number().int().positive().optional().describe("Optional start line (1-indexed)"),
  endLine: z.number().int().positive().optional().describe("Optional end line (1-indexed)"),
}).refine((data) => {
  if (data.startLine !== undefined && data.endLine !== undefined) {
    return data.startLine <= data.endLine;
  }
  return true;
}, {
  message: "startLine must be <= endLine",
  path: ["startLine"],
});

export type ReadFileInput = z.infer<typeof ReadFileSchema>;

// ─── Output ───────────────────────────────────────────────────────────────────

export interface ReadFileOutput {
  success: true;
  content: string;
  lines: number; // lines in returned content
  totalLines?: number;
  size: number;
  tokens?: number;
  path: string;
  autoCorrectedFrom?: string;
  hints?: string[];
}

export interface ReadFileError {
  success: false;
  error: string;
  path: string;
  suggestions?: string[];
  hints?: string[];
}

export type ReadFileResult = ReadFileOutput | ReadFileError;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLineSlice(raw: string, startLine?: number, endLine?: number): { content: string; lines: number; totalLines: number } {
  const allLines = raw.split("\n");
  const totalLines = allLines.length;
  if (startLine !== undefined || endLine !== undefined) {
    const start = Math.max(0, (startLine ?? 1) - 1);
    const end = Math.min(totalLines, endLine ?? totalLines);
    const sliced = allLines.slice(start, end);
    return { content: sliced.join("\n"), lines: sliced.length, totalLines };
  }
  return { content: raw, lines: totalLines, totalLines };
}

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function readFile(input: ReadFileInput): Promise<ReadFileResult> {
  // Safe path check
  const safe = assertSafePath(input.path);
  if (safe.error) {
    return {
      success: false,
      error: safe.error,
      path: input.path,
      hints: ["Ensure path is inside project root and not in protected directories. Set ALLOW_OUTSIDE_CWD=1 if you really need outside access."],
    };
  }
  const resolved = safe.resolved;

  try {
    const stat = fs.statSync(resolved);

    if (stat.isDirectory()) {
      const filesInDir = fs.readdirSync(resolved).slice(0, 15);
      return {
        success: false,
        error: `Path is a directory, not a file: ${input.path}. You should use 'list_files' to see its contents.\n\nFiles inside:\n- ${filesInDir.join("\n- ")}`,
        path: input.path,
        suggestions: filesInDir,
      };
    }

    // Size guard before reading full content
    const sizeCheck = checkFileSize(stat.size, LIMITS.MAX_READ_BYTES);
    if (!sizeCheck.ok) {
      return {
        success: false,
        error: `File too large: ${input.path} is ${(stat.size / 1024 / 1024).toFixed(2)}MB, limit ${(LIMITS.MAX_READ_BYTES / 1024 / 1024).toFixed(0)}MB`,
        path: input.path,
        hints: [
          "Use startLine/endLine to read a slice",
          "Use search_files to locate specific content without reading whole file",
        ],
      };
    }

    // Binary check via buffer peek
    const buffer = fs.readFileSync(resolved);
    if (isBinaryBuffer(buffer)) {
      return {
        success: false,
        error: `Binary file detected: ${input.path} appears to be binary (contains null bytes).`,
        path: input.path,
        hints: ["This tool only reads text files. Use run_command with appropriate tool to inspect binary."],
      };
    }

    const raw = buffer.toString("utf-8");
    const tokens = estimateTokens(raw);
    if (tokens > LIMITS.MAX_FILE_TOKENS) {
      // Not hard fail, but warn and still allow sliced reads
      if (input.startLine === undefined && input.endLine === undefined) {
        return {
          success: false,
          error: `File too large for context: ${input.path} ~${tokens.toLocaleString()} tokens, max ${LIMITS.MAX_FILE_TOKENS.toLocaleString()}.`,
          path: input.path,
          hints: [
            `Try reading a slice: startLine 1 endLine 100`,
            `Or use search_files to find relevant sections`,
          ],
        };
      }
    }

    const { content, lines, totalLines } = getLineSlice(raw, input.startLine, input.endLine);

    return {
      success: true,
      content,
      lines,
      totalLines,
      size: Buffer.byteLength(raw, "utf-8"),
      tokens: estimateTokens(content),
      path: input.path,
    };
  } catch (error) {
    if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === "ENOENT") {
        const dir = path.dirname(resolved);
        const targetName = path.basename(resolved);

        let suggestions: string[] = [];
        let autoCorrectedPath: string | null = null;

        try {
          if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
            const filesInDir = fs.readdirSync(dir);
            const ext = path.extname(targetName).toLowerCase();
            const nameWithoutExt = path.basename(targetName, ext).toLowerCase();

            const matches = filesInDir
              .map(f => {
                const fExt = path.extname(f).toLowerCase();
                const fName = path.basename(f, fExt).toLowerCase();
                let score = 0;
                if (fExt === ext) score += 5;
                if (fName === nameWithoutExt) score += 100;
                else if (fName.includes(nameWithoutExt) || nameWithoutExt.includes(fName)) score += 50;
                return { file: f, score };
              })
              .filter(s => s.score > 0)
              .sort((a, b) => b.score - a.score);

            if (matches.length > 0 && matches[0].score >= 50) {
              const candidate = path.join(dir, matches[0].file);
              // Ensure candidate also passes safe path
              const candidateSafe = assertSafePath(path.relative(process.cwd(), candidate));
              if (!candidateSafe.error) {
                autoCorrectedPath = candidate;
              } else {
                suggestions = filesInDir.filter(f => {
                  try { return fs.statSync(path.join(dir, f)).isFile(); } catch { return false; }
                }).slice(0, 15);
              }
            } else {
              suggestions = filesInDir.filter(f => {
                try { return fs.statSync(path.join(dir, f)).isFile(); } catch { return false; }
              }).slice(0, 15);
            }
          } else {
            suggestions = fs.readdirSync(process.cwd()).slice(0, 15);
          }
        } catch {
          // ignore
        }

        if (autoCorrectedPath) {
          try {
            const buf = fs.readFileSync(autoCorrectedPath);
            if (!isBinaryBuffer(buf)) {
              const raw = buf.toString("utf-8");
              const { content, lines, totalLines } = getLineSlice(raw, input.startLine, input.endLine);
              const rel = path.relative(process.cwd(), autoCorrectedPath);
              return {
                success: true,
                content,
                lines,
                totalLines,
                size: Buffer.byteLength(raw, "utf-8"),
                tokens: estimateTokens(content),
                path: rel,
                autoCorrectedFrom: input.path,
                hints: [`Auto-corrected path from '${input.path}' to '${rel}'`],
              };
            }
          } catch {
            // fallback
          }
        }

        let errorMsg = `File not found: ${input.path}`;
        if (suggestions.length > 0) {
          const relDir = path.relative(process.cwd(), dir) || '.';
          errorMsg += `\n\nDid you mean one of these files in '${relDir}'? \n- ${suggestions.join("\n- ")}`;
        } else {
          const relDir = path.relative(process.cwd(), dir) || '.';
          errorMsg += `\n\nThe directory '${relDir}' appears to be empty or does not exist. Try calling 'list_files' on '.' to see the project root.`;
        }

        return {
          success: false,
          error: errorMsg,
          path: input.path,
          suggestions,
        };
      }

      if (nodeError.code === "EACCES") {
        return { success: false, error: `Permission denied: ${input.path}`, path: input.path };
      }

      return { success: false, error: `Could not read file: ${error.message}`, path: input.path };
    }

    return { success: false, error: "Unknown error reading file", path: input.path };
  }
}
