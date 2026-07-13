import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { askPermission } from "../core/permissions";
import { getPatchForDisplay } from "../utils/diff";
import {
  assertSafePath,
  isBinaryFileSync,
  checkFileSize,
  LIMITS,
} from "./guards";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const EditFileSchema = z.object({
  path: z.string().describe("Path to the file to edit"),
  searchString: z.string().describe("Exact string to search for in the file"),
  replaceString: z.string().describe("String to replace the searchString with"),
}).refine(data => data.searchString !== data.replaceString, {
  message: "searchString and replaceString must differ",
  path: ["replaceString"],
});

export type EditFileInput = z.infer<typeof EditFileSchema>;

// ─── Output ───────────────────────────────────────────────────────────────────

export interface EditFileOutput {
  success: true;
  path: string;
  linesChanged: number;
  preview: string;
  hunks?: import("diff").StructuredPatchHunk[];
  hints?: string[];
}

export interface EditFileError {
  success: false;
  error: string;
  path: string;
  hints?: string[];
}

export type EditFileResult = EditFileOutput | EditFileError;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&');
}

function findFuzzyMatches(content: string, searchString: string): string[] {
  // Avoid fuzzy for trivial single-char or very small searches
  const trimmedSearch = searchString.trim();
  if (trimmedSearch.length < 3) return [];

  const contentLines = content.split("\n");
  const searchLines = searchString.split("\n").map(l => l.trim());
  const numSearchLines = searchLines.length;
  const matches: string[] = [];

  if (numSearchLines === 0) return matches;

  for (let i = 0; i <= contentLines.length - numSearchLines; i++) {
    const window = contentLines.slice(i, i + numSearchLines);
    let isMatch = true;
    for (let j = 0; j < numSearchLines; j++) {
      if (window[j].trim() !== searchLines[j]) {
        isMatch = false;
        break;
      }
    }
    if (isMatch) {
      matches.push(window.join("\n"));
    }
  }
  return matches;
}

function findClosestLine(content: string, targetLine: string): string | null {
  const lines = content.split("\n");
  const target = targetLine.trim();
  if (!target) return null;

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === target) return line;

    let score = 0;
    const minLen = Math.min(trimmed.length, target.length);
    for (let i = 0; i < minLen; i++) {
      if (trimmed[i] === target[i]) score++;
      else break;
    }
    const normalizedScore = target.length > 0 ? score / target.length : 0;
    if (normalizedScore > bestScore && normalizedScore > 0.5) {
      bestScore = normalizedScore;
      bestMatch = line;
    }
  }
  return bestMatch;
}

function buildEditDiff(searchString: string, replaceString: string): string[] {
  const searchLines = searchString.split("\n");
  const replaceLines = replaceString.split("\n");
  const details: string[] = [];
  const MAX_PREVIEW = 10;

  searchLines.slice(0, MAX_PREVIEW).forEach((line) => details.push(`- ${line}`));
  if (searchLines.length > MAX_PREVIEW) details.push(`  ... (${searchLines.length - MAX_PREVIEW} more removed)`);

  replaceLines.slice(0, MAX_PREVIEW).forEach((line) => details.push(`+ ${line}`));
  if (replaceLines.length > MAX_PREVIEW) details.push(`  ... (${replaceLines.length - MAX_PREVIEW} more added)`);

  return details;
}

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function editFile(input: EditFileInput): Promise<EditFileResult> {
  const safe = assertSafePath(input.path);
  if (safe.error) {
    return {
      success: false,
      error: safe.error,
      path: input.path,
      hints: ["Ensure path is inside project root and not protected."],
    };
  }
  const resolved = safe.resolved;

  // Binary check
  if (isBinaryFileSync(resolved)) {
    return {
      success: false,
      error: `Cannot edit binary file: ${input.path}`,
      path: input.path,
      hints: ["This file appears binary. Use write_file to overwrite or run_command."],
    };
  }

  let content: string;
  try {
    content = fs.readFileSync(resolved, "utf-8");
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return {
        success: false,
        error: `File not found: ${input.path}`,
        path: input.path,
        hints: ["Use 'list_files' to find correct path before editing."],
      };
    }
    return { success: false, error: `Could not read file: ${error.message}`, path: input.path };
  }

  // Size guard on resulting file
  const projectedSize = Buffer.byteLength(content, "utf-8") - Buffer.byteLength(input.searchString, "utf-8") + Buffer.byteLength(input.replaceString, "utf-8");
  const sizeCheck = checkFileSize(projectedSize, LIMITS.MAX_WRITE_BYTES);
  if (!sizeCheck.ok) {
    return {
      success: false,
      error: `Resulting file would be too large: ${(projectedSize / 1024 / 1024).toFixed(2)}MB exceeds ${(LIMITS.MAX_WRITE_BYTES / 1024 / 1024).toFixed(0)}MB`,
      path: input.path,
      hints: ["Split edit into smaller chunks or use apply_patch"],
    };
  }

  let occurrences = (content.match(new RegExp(escapeRegExp(input.searchString), 'g')) || []).length;
  let actualSearchString = input.searchString;
  let autoCorrected = false;

  if (occurrences === 0) {
    const fuzzyMatches = findFuzzyMatches(content, input.searchString);
    if (fuzzyMatches.length === 1) {
      actualSearchString = fuzzyMatches[0];
      occurrences = 1;
      autoCorrected = true;
    } else if (fuzzyMatches.length > 1) {
      return {
        success: false,
        error: `Search string is not unique. Matches ${fuzzyMatches.length} times ignoring whitespace (possibly trivial like '}' ).`,
        path: input.path,
        hints: ["Include more surrounding lines to make searchString unique, at least 2-3 lines context."],
      };
    }
  }

  if (occurrences > 1) {
    return {
      success: false,
      error: `Search string matches ${occurrences} times in file.`,
      path: input.path,
      hints: [
        "You cannot replace multiple occurrences at once.",
        "Include more surrounding context to target exact single instance.",
      ],
    };
  }

  if (occurrences === 0) {
    const firstSearchLine = input.searchString.split("\n")[0];
    const closest = findClosestLine(content, firstSearchLine);

    const hints: string[] = [
      "Exact string not found. Check indentation, extra spaces, or outdated content.",
      "Read file again to get latest content before editing.",
    ];
    if (closest) {
      hints.push(`Closest matching line in file: "${closest.trim()}"`);
    }

    return {
      success: false,
      error: `Search string not found in ${input.path}. Must match exactly.`,
      path: input.path,
      hints,
    };
  }

  // Accurate replacement: find index and splice only first occurrence
  const idx = content.indexOf(actualSearchString);
  if (idx === -1) {
    return {
      success: false,
      error: `Search string not found (mismatch after fuzzy check) in ${input.path}`,
      path: input.path,
    };
  }
  const newContent = content.slice(0, idx) + input.replaceString + content.slice(idx + actualSearchString.length);

  const oldLines = actualSearchString.split("\n").length;
  const newLines = input.replaceString.split("\n").length;
  const linesChanged = Math.max(oldLines, newLines);

  const diffLines = buildEditDiff(actualSearchString, input.replaceString);

  const approved = await askPermission({
    action: "edit_file",
    title: `EDIT FILE: ${input.path}`,
    details: diffLines,
  });

  if (!approved) {
    return { success: false, error: "User denied file edit", path: input.path };
  }

  try {
    // Atomic write
    const tmpPath = resolved + `.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    fs.writeFileSync(tmpPath, newContent, "utf-8");
    fs.renameSync(tmpPath, resolved);

    const hints: string[] = [];
    if (autoCorrected) {
      hints.push("Auto-corrected whitespace/indentation in searchString to match file.");
    }

    return {
      success: true,
      path: input.path,
      linesChanged,
      preview: diffLines.join("\n"),
      hunks: getPatchForDisplay({
        filePath: input.path,
        fileContents: content,
        edits: [{ old_string: actualSearchString, new_string: input.replaceString }]
      }),
      ...(hints.length > 0 && { hints }),
    };
  } catch (error: any) {
    return { success: false, error: `Could not write file: ${error.message}`, path: input.path };
  }
}
