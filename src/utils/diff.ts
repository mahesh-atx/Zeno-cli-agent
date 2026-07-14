import { type StructuredPatchHunk, structuredPatch } from 'diff';

export const CONTEXT_LINES = 3;
export const DIFF_TIMEOUT_MS = 5000;

export interface FileEdit {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

// For some reason, & confuses the diff library, so we replace it with a token,
// then substitute it back in after the diff is computed.
const AMPERSAND_TOKEN = '<<:AMPERSAND_TOKEN:>>';
const DOLLAR_TOKEN = '<<:DOLLAR_TOKEN:>>';

function escapeForDiff(s: string): string {
  return s.replaceAll('&', AMPERSAND_TOKEN).replaceAll('$', DOLLAR_TOKEN);
}

function unescapeFromDiff(s: string): string {
  return s.replaceAll(AMPERSAND_TOKEN, '&').replaceAll(DOLLAR_TOKEN, '$');
}

/**
 * Replaces leading tabs with spaces to ensure predictable alignment in UI.
 * Uses 4 spaces per tab (common default), configurable via env TAB_WIDTH.
 */
export function convertLeadingTabsToSpaces(content: string, tabWidth = 4): string {
  const envWidth = parseInt(process.env.TAB_WIDTH || "", 10);
  const spaces = Number.isFinite(envWidth) && envWidth > 0 && envWidth <= 8 ? envWidth : tabWidth;
  const replacement = " ".repeat(spaces);
  return content.replace(/^[ \t]+/gm, (match) => match.replace(/\t/g, replacement));
}

/**
 * Get a patch for display with edits applied
 * @param filePath The path to the file
 * @param fileContents The contents of the file
 * @param edits An array of edits to apply to the file
 * @param ignoreWhitespace Whether to ignore whitespace changes
 * @returns An array of hunks representing the diff
 */
export function getPatchForDisplay({
  filePath,
  fileContents,
  edits,
  ignoreWhitespace = false,
}: {
  filePath: string;
  fileContents: string;
  edits: FileEdit[];
  ignoreWhitespace?: boolean;
}): StructuredPatchHunk[] {
  const preparedFileContents = escapeForDiff(convertLeadingTabsToSpaces(fileContents));

  let finalContents = preparedFileContents;

  for (const edit of edits) {
    const { old_string, new_string, replace_all } = edit;
    const escapedOldString = escapeForDiff(convertLeadingTabsToSpaces(old_string));
    const escapedNewString = escapeForDiff(convertLeadingTabsToSpaces(new_string));

    if (replace_all) {
      finalContents = finalContents.replaceAll(escapedOldString, () => escapedNewString);
    } else {
      finalContents = finalContents.replace(escapedOldString, () => escapedNewString);
    }
  }

  const result = structuredPatch(
    filePath,
    filePath,
    preparedFileContents,
    finalContents,
    undefined,
    undefined,
    {
      context: CONTEXT_LINES,
      ignoreWhitespace,
      timeout: DIFF_TIMEOUT_MS,
    }
  );

  if (!result) {
    return [];
  }

  return result.hunks.map((hunk) => ({
    ...hunk,
    lines: hunk.lines.map(unescapeFromDiff),
  }));
}

export function getPatchFromContents({
  filePath,
  oldContent,
  newContent,
  ignoreWhitespace = false,
  singleHunk = false,
}: {
  filePath: string;
  oldContent: string;
  newContent: string;
  ignoreWhitespace?: boolean;
  singleHunk?: boolean;
}): StructuredPatchHunk[] {
  const result = structuredPatch(
    filePath,
    filePath,
    escapeForDiff(oldContent),
    escapeForDiff(newContent),
    undefined,
    undefined,
    {
      ignoreWhitespace,
      context: singleHunk ? 100_000 : CONTEXT_LINES,
      timeout: DIFF_TIMEOUT_MS,
    }
  );
  if (!result) {
    return [];
  }
  return result.hunks.map((hunk) => ({
    ...hunk,
    lines: hunk.lines.map(unescapeFromDiff),
  }));
}

export function adjustHunkLineNumbers(
  hunks: StructuredPatchHunk[],
  offset: number
): StructuredPatchHunk[] {
  if (offset === 0) return hunks;
  return hunks.map((h) => ({
    ...h,
    oldStart: h.oldStart + offset,
    newStart: h.newStart + offset,
  }));
}
