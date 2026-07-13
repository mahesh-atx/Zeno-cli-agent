import * as fs from "fs";
import { z } from "zod";
import { assertSafePath, isBinaryBuffer, checkFileSize, LIMITS, estimateTokens } from "./guards";

export const ReadManyFilesSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(10).describe("List of file paths to read (max 10)"),
});

export type ReadManyFilesInput = z.infer<typeof ReadManyFilesSchema>;

export interface FileReadResult {
  path: string;
  success: boolean;
  content?: string;
  lines?: number;
  size?: number;
  tokens?: number;
  error?: string;
}

export interface ReadManyFilesOutput {
  success: true;
  results: FileReadResult[];
  totalFiles: number;
  totalTokens: number;
  totalBytes: number;
}

export interface ReadManyFilesError {
  success: false;
  error: string;
  results?: FileReadResult[];
}

export type ReadManyFilesResult = ReadManyFilesOutput | ReadManyFilesError;

export async function readManyFiles(input: ReadManyFilesInput): Promise<ReadManyFilesResult> {
  const results: FileReadResult[] = [];
  let totalTokens = 0;
  let totalBytes = 0;

  for (const inputPath of input.paths) {
    const safe = assertSafePath(inputPath);
    if (safe.error) {
      results.push({
        path: inputPath,
        success: false,
        error: safe.error,
      });
      continue;
    }

    const resolved = safe.resolved;

    try {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        results.push({
          path: inputPath,
          success: false,
          error: `Path is a directory, not a file: ${inputPath}. Use list_files instead.`,
        });
        continue;
      }

      const sizeCheck = checkFileSize(stat.size, LIMITS.MAX_READ_BYTES);
      if (!sizeCheck.ok) {
        results.push({
          path: inputPath,
          success: false,
          error: `File too large: ${inputPath} is ${(stat.size / 1024 / 1024).toFixed(2)}MB exceeds ${(LIMITS.MAX_READ_BYTES / 1024 / 1024).toFixed(0)}MB`,
        });
        continue;
      }

      // Check combined size
      if (totalBytes + stat.size > LIMITS.MAX_READ_BYTES * 2) {
        results.push({
          path: inputPath,
          success: false,
          error: `Combined size would exceed limit. Already read ${(totalBytes / 1024 / 1024).toFixed(2)}MB.`,
        });
        continue;
      }

      const buffer = fs.readFileSync(resolved);
      if (isBinaryBuffer(buffer)) {
        results.push({
          path: inputPath,
          success: false,
          error: `Binary file detected: ${inputPath}`,
        });
        continue;
      }

      const content = buffer.toString("utf-8");
      const tokens = estimateTokens(content);
      
      if (totalTokens + tokens > LIMITS.MAX_FILE_TOKENS * 2) {
        results.push({
          path: inputPath,
          success: false,
          error: `Combined tokens would exceed limit. Already ${totalTokens.toLocaleString()} tokens.`,
        });
        continue;
      }

      const lines = content.split("\n").length;
      const size = Buffer.byteLength(content, "utf-8");

      results.push({
        path: inputPath,
        success: true,
        content,
        lines,
        size,
        tokens,
      });

      totalTokens += tokens;
      totalBytes += size;

    } catch (error: any) {
      if (error.code === "ENOENT") {
        results.push({
          path: inputPath,
          success: false,
          error: `File not found: ${inputPath}`,
        });
      } else if (error.code === "EACCES") {
        results.push({
          path: inputPath,
          success: false,
          error: `Permission denied: ${inputPath}`,
        });
      } else {
        results.push({
          path: inputPath,
          success: false,
          error: `Could not read file: ${error.message}`,
        });
      }
    }
  }

  const anySuccess = results.some(r => r.success);

  if (!anySuccess) {
    return {
      success: false,
      error: `All ${results.length} file(s) failed to read`,
      results,
    };
  }

  return {
    success: true,
    results,
    totalFiles: results.filter(r => r.success).length,
    totalTokens,
    totalBytes,
  };
}
