import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { askPermission } from "../core/permissions";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const EditFileSchema = z.object({
  path: z.string().describe("Path to the file to edit"),
  searchString: z.string().describe("Exact string to search for in the file"),
  replaceString: z.string().describe("String to replace the searchString with"),
});

export type EditFileInput = z.infer<typeof EditFileSchema>;

// ─── Output ───────────────────────────────────────────────────────────────────

export interface EditFileOutput {
  success: true;
  path: string;
  linesChanged: number;
  preview: string;
  hints?: string[]; // NEW
}

export interface EditFileError {
  success: false;
  error: string;
  path: string;
  hints?: string[]; // NEW
}

export type EditFileResult = EditFileOutput | EditFileError;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROTECTED_DIRS = ["node_modules", ".git", ".next", ".nuxt", "dist", "build", ".venv", "venv", "__pycache__", ".cache"];
function isProtectedPath(resolvedPath: string): boolean {
  const normalized = resolvedPath.replace(/\\/g, "/");
  return PROTECTED_DIRS.some((dir) => new RegExp(`(^|/)${dir}(/|$)`).test(normalized));
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * MODERN UPGRADE 1: Fuzzy Matching (Whitespace Tolerance)
 * LLMs frequently mess up indentation or trailing whitespace. 
 * This finds a match if the trimmed lines are identical.
 */
function findFuzzyMatches(content: string, searchString: string): string[] {
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

/**
 * MODERN UPGRADE 2: Contextual Error Hinting
 * If the search fails completely, find the closest matching line to help the LLM adjust.
 */
function findClosestLine(content: string, targetLine: string): string | null {
  const lines = content.split("\n");
  const target = targetLine.trim();
  if (!target) return null;
  
  let bestMatch = null;
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

  // Terminal UI Protection: Cap at 10 lines per side
  const MAX_PREVIEW_LINES = 10;

  searchLines.slice(0, MAX_PREVIEW_LINES).forEach((line) => details.push(`- ${line}`));
  if (searchLines.length > MAX_PREVIEW_LINES) details.push(`  ... (${searchLines.length - MAX_PREVIEW_LINES} more removed lines)`);

  replaceLines.slice(0, MAX_PREVIEW_LINES).forEach((line) => details.push(`+ ${line}`));
  if (replaceLines.length > MAX_PREVIEW_LINES) details.push(`  ... (${replaceLines.length - MAX_PREVIEW_LINES} more added lines)`);

  return details;
}

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function editFile(input: EditFileInput): Promise<EditFileResult> {
  const resolved = path.resolve(process.cwd(), input.path);

  // Guardrail: Protected Paths
  if (isProtectedPath(resolved)) {
    return {
      success: false,
      error: `Blocked: Cannot edit protected directory '${input.path}'.`,
      path: input.path,
      hints: ["Editing node_modules, .git, or build directories is prohibited."],
    };
  }

  // Read existing file
  let content: string;
  try {
    content = fs.readFileSync(resolved, "utf-8");
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return {
        success: false,
        error: `File not found: ${input.path}`,
        path: input.path,
        hints: ["Use 'list_files' to find the correct path before attempting to edit."],
      };
    }
    return { success: false, error: `Could not read file: ${error.message}`, path: input.path };
  }

  // 1. Exact Match Check
  let occurrences = (content.match(new RegExp(escapeRegExp(input.searchString), 'g')) || []).length;
  let actualSearchString = input.searchString;
  let autoCorrected = false;

  if (occurrences === 0) {
    // 2. Fuzzy Match (Whitespace Tolerance)
    const fuzzyMatches = findFuzzyMatches(content, input.searchString);
    
    if (fuzzyMatches.length === 1) {
      // Auto-correct indentation/whitespace!
      actualSearchString = fuzzyMatches[0];
      occurrences = 1;
      autoCorrected = true;
    } else if (fuzzyMatches.length > 1) {
      return {
        success: false,
        error: `Search string is not unique. It matches ${fuzzyMatches.length} times if we ignore whitespace.`,
        path: input.path,
        hints: ["Include more surrounding lines in your searchString to make it unique."],
      };
    }
  }

  // 3. Mass Replacement Guardrail
  if (occurrences > 1) {
    return {
      success: false,
      error: `Search string matches ${occurrences} times in the file.`,
      path: input.path,
      hints: [
        "You cannot replace multiple occurrences at once.",
        "Include more surrounding context in your searchString to target the exact single instance you want to change."
      ],
    };
  }

  // 4. Complete Failure Handling
  if (occurrences === 0) {
    const firstSearchLine = input.searchString.split("\n")[0];
    const closest = findClosestLine(content, firstSearchLine);
    
    const hints: string[] = [
      "The exact string was not found. Check for missing indentation, extra spaces, or outdated code.",
      "Ensure you have read the file recently to get the latest content before editing."
    ];
    
    if (closest) {
      hints.push(`Closest matching line in file: "${closest.trim()}"`);
    }

    return {
      success: false,
      error: `Search string not found in ${input.path}. The text must match exactly.`,
      path: input.path,
      hints,
    };
  }

  // Build new content
  const newContent = content.split(actualSearchString).join(input.replaceString);

  // Calculate lines changed
  const oldLines = actualSearchString.split("\n").length;
  const newLines = input.replaceString.split("\n").length;
  const linesChanged = Math.abs(oldLines - newLines) + Math.min(oldLines, newLines);

  // Build diff preview
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
    fs.writeFileSync(resolved, newContent, "utf-8");
    
    const hints: string[] = [];
    if (autoCorrected) {
      hints.push("I auto-corrected the whitespace/indentation in your searchString to match the file.");
    }

    return {
      success: true,
      path: input.path,
      linesChanged,
      preview: diffLines.join("\n"),
      ...(hints.length > 0 && { hints }),
    };
  } catch (error: any) {
    return { success: false, error: `Could not write file: ${error.message}`, path: input.path };
  }
}