import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const ReadFileSchema = z.object({
  path: z.string().describe("Relative or absolute path to the file to read"),
  startLine: z.number().int().positive().optional().describe("Optional start line (1-indexed)"),
  endLine: z.number().int().positive().optional().describe("Optional end line (1-indexed)"),
});

export type ReadFileInput = z.infer<typeof ReadFileSchema>;

// ─── Output (Upgraded with new fields) ────────────────────────────────────────

export interface ReadFileOutput {
  success: true;
  content: string;
  lines: number;
  size: number;
  path: string;
  autoCorrectedFrom?: string; // NEW: Tells the LLM we fixed its typo
}

export interface ReadFileError {
  success: false;
  error: string;
  path: string;
  suggestions?: string[]; // NEW: Gives the LLM immediate context to retry
}

export type ReadFileResult = ReadFileOutput | ReadFileError;

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function readFile(input: ReadFileInput): Promise<ReadFileResult> {
  const resolved = path.resolve(process.cwd(), input.path);

  try {
    const stat = fs.statSync(resolved);

    // MODERN UPGRADE 1: Handle directory read attempts gracefully
    if (stat.isDirectory()) {
      const filesInDir = fs.readdirSync(resolved).slice(0, 15);
      return {
        success: false,
        error: `Path is a directory, not a file: ${input.path}. You should use 'list_files' to see its contents.\n\nFiles inside:\n- ${filesInDir.join("\n- ")}`,
        path: input.path,
        suggestions: filesInDir,
      };
    }

    const raw = fs.readFileSync(resolved, "utf-8");
    const allLines = raw.split("\n");
    const totalLines = allLines.length;
    let content: string;

    if (input.startLine !== undefined || input.endLine !== undefined) {
      const start = (input.startLine ?? 1) - 1;
      const end = input.endLine ?? totalLines;
      content = allLines.slice(start, end).join("\n");
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

      // MODERN UPGRADE 2: Smart Fuzzy Matching & Auto-Correction
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

            // Simple zero-dependency fuzzy scoring
            const matches = filesInDir
              .map(f => {
                const fExt = path.extname(f).toLowerCase();
                const fName = path.basename(f, fExt).toLowerCase();
                let score = 0;
                
                if (fExt === ext) score += 5; // Bonus for matching extension
                if (fName === nameWithoutExt) score += 100; // Exact name match (case-insensitive)
                else if (fName.includes(nameWithoutExt) || nameWithoutExt.includes(fName)) score += 50; // Substring match
                
                return { file: f, score };
              })
              .filter(s => s.score > 0)
              .sort((a, b) => b.score - a.score);

            // If we have a strong match, auto-correct it
            if (matches.length > 0 && matches[0].score >= 50) {
              autoCorrectedPath = path.join(dir, matches[0].file);
            } else {
              // No strong match, gather suggestions (only files, limit to 15 to save tokens)
              suggestions = filesInDir.filter(f => {
                 try { return fs.statSync(path.join(dir, f)).isFile(); } catch { return false; }
              }).slice(0, 15);
            }
          } else {
            // Parent dir doesn't exist, list root as fallback
            suggestions = fs.readdirSync(process.cwd()).slice(0, 15);
          }
        } catch (listError) {
          // Ignore directory listing errors
        }

        // If we found an auto-corrected path, read it and return success!
        if (autoCorrectedPath) {
          try {
            const raw = fs.readFileSync(autoCorrectedPath, "utf-8");
            const allLines = raw.split("\n");
            const totalLines = allLines.length;
            let content = raw;
            
            if (input.startLine !== undefined || input.endLine !== undefined) {
              const start = (input.startLine ?? 1) - 1;
              const end = input.endLine ?? totalLines;
              content = allLines.slice(start, end).join("\n");
            }
            
            return {
              success: true,
              content,
              lines: totalLines,
              size: Buffer.byteLength(raw, "utf-8"),
              path: path.relative(process.cwd(), autoCorrectedPath),
              autoCorrectedFrom: input.path, // Flag that we fixed a typo
            };
          } catch (readError) {
            // Fallback if reading the auto-corrected file fails
          }
        }

        // If we couldn't auto-correct, return a highly informative error
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