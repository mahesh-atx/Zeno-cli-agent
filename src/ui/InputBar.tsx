import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Fuse from "fuse.js";
import { CommandMenu } from "./CommandMenu";
import { FileMenu } from "./FileMenu";
import { COMMAND_META } from "../commands";
import type { CommandMeta } from "../commands";
import { searchFiles, getFileList } from "../utils/fileSearch";
import type { FileEntry } from "../utils/fileSearch";

interface InputBarProps {
  onSubmit: (value: string) => void;
  isDisabled: boolean;
  placeholder?: string;
  width: number;
  /** When true, show R-to-retry prompt and accept R keypress */
  networkDropped?: boolean;
}

// ─── Slash command fuzzy index ────────────────────────────────────────────────

const commandFuse = new Fuse(COMMAND_META, {
  keys: [
    { name: "name", weight: 0.7 },
    { name: "description", weight: 0.2 },
    { name: "aliases", weight: 0.1 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
});

// ─── Slash menu helpers ───────────────────────────────────────────────────────

function shouldShowCommandMenu(value: string): boolean {
  if (!value.startsWith("/")) return false;
  if (value.includes(" ")) return false;
  return true;
}

function getFilteredCommands(value: string): CommandMeta[] {
  if (value === "/" || value === "") return COMMAND_META;
  const query = value.slice(1);
  if (!query) return COMMAND_META;
  const results = commandFuse.search(query);
  if (results.length === 0) return [];
  return results.map((r) => r.item);
}

// ─── @-mention helpers ───────────────────────────────────────────────────────

/**
 * Detect if the user is currently typing an @mention.
 * Returns the query (the text after @, up to the cursor) or null.
 *
 * Triggers when:
 * - There's an "@" preceded by start-of-string or whitespace
 * - And no whitespace between "@" and end-of-string
 */
function getActiveAtMentionQuery(value: string): string | null {
  // Find the last "@" in the string
  const atIdx = value.lastIndexOf("@");
  if (atIdx === -1) return null;

  // Must be at start or preceded by whitespace
  if (atIdx > 0) {
    const prev = value[atIdx - 1];
    if (prev !== " " && prev !== "\t" && prev !== "\n") return null;
  }

  // Get text after the @
  const after = value.slice(atIdx + 1);

  // If there's whitespace after, the mention is "complete" — don't show menu
  if (/\s/.test(after)) return null;

  return after;
}

/**
 * Replace the active @-mention with the selected file path.
 */
function replaceAtMention(value: string, filePath: string): string {
  const atIdx = value.lastIndexOf("@");
  if (atIdx === -1) return value;
  return value.slice(0, atIdx) + "@" + filePath + " ";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InputBar({
  onSubmit,
  isDisabled,
  placeholder = 'Try "fix typecheck errors" or @filename',
  width,
  networkDropped = false,
}: InputBarProps) {
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuClosed, setMenuClosed] = useState(false);

  // ── Decide which menu (if any) to show ──
  const commandMenuVisible =
    !isDisabled && !menuClosed && shouldShowCommandMenu(value);

  const atQuery = !isDisabled && !menuClosed
    ? getActiveAtMentionQuery(value)
    : null;
  const fileMenuVisible = !commandMenuVisible && atQuery !== null;

  // ── Warm the file cache as soon as user types @ ──
  useEffect(() => {
    if (fileMenuVisible) {
      // Trigger the cache build (returns instantly if cached)
      getFileList();
    }
  }, [fileMenuVisible]);

  // ── Filtered lists ──
  const filteredCommands = useMemo(
    () => (commandMenuVisible ? getFilteredCommands(value) : []),
    [value, commandMenuVisible]
  );

  const filteredFiles: FileEntry[] = useMemo(
    () => (fileMenuVisible ? searchFiles(atQuery ?? "", 50) : []),
    [atQuery, fileMenuVisible]
  );

  // ── Reset selection when input changes ──
  useEffect(() => {
    setSelectedIndex(0);
  }, [value]);

  // ── Reset menuClosed when slash/at is removed ──
  useEffect(() => {
    if (menuClosed) {
      const hasSlash = value.startsWith("/");
      const hasAt = getActiveAtMentionQuery(value) !== null;
      if (!hasSlash && !hasAt) {
        setMenuClosed(false);
      }
    }
  }, [value, menuClosed]);

  // ── Apply selected command ──
  const acceptSelectedCommand = () => {
    if (filteredCommands.length === 0) return;
    const cmd = filteredCommands[Math.min(selectedIndex, filteredCommands.length - 1)];
    setValue(cmd.usage ? `${cmd.name} ` : cmd.name);
  };

  // ── Apply selected file ──
  const acceptSelectedFile = () => {
    if (filteredFiles.length === 0) return;
    const file = filteredFiles[Math.min(selectedIndex, filteredFiles.length - 1)];
    setValue((prev) => replaceAtMention(prev, file.path));
  };

  useInput(
    (input, key) => {
      if (isDisabled) return;

      // ── Command menu navigation ──
      if (commandMenuVisible && filteredCommands.length > 0) {
        if (key.upArrow) {
          setSelectedIndex((i) =>
            i <= 0 ? filteredCommands.length - 1 : i - 1
          );
          return;
        }
        if (key.downArrow) {
          setSelectedIndex((i) =>
            i >= filteredCommands.length - 1 ? 0 : i + 1
          );
          return;
        }
        if (key.tab) {
          acceptSelectedCommand();
          return;
        }
        if (key.escape) {
          setMenuClosed(true);
          return;
        }
        if (key.return) {
          const cmd = filteredCommands[selectedIndex];
          if (!cmd) return;
          if (cmd.usage) {
            setValue(`${cmd.name} `);
          } else {
            onSubmit(cmd.name);
            setValue("");
          }
          return;
        }
      }

      // ── File menu navigation ──
      if (fileMenuVisible && filteredFiles.length > 0) {
        if (key.upArrow) {
          setSelectedIndex((i) =>
            i <= 0 ? filteredFiles.length - 1 : i - 1
          );
          return;
        }
        if (key.downArrow) {
          setSelectedIndex((i) =>
            i >= filteredFiles.length - 1 ? 0 : i + 1
          );
          return;
        }
        if (key.tab || key.return) {
          acceptSelectedFile();
          return;
        }
        if (key.escape) {
          setMenuClosed(true);
          return;
        }
        // Fall through to regular typing so the user can refine the query
      }

      // ── Regular input ──
      if (key.return) {
        const trimmed = value.trim();
        if (trimmed) {
          onSubmit(trimmed);
          setValue("");
          setMenuClosed(false);
        }
        return;
      }

      if (key.backspace || key.delete) {
        setValue((prev) => prev.slice(0, -1));
        return;
      }

      if (key.ctrl && input === "u") {
        setValue("");
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        setValue((prev) => prev + input);
      }
    },
    { isActive: !isDisabled }
  );

  const showPlaceholder = !value;
  const boxWidth = Math.min(width - 2, 100);

  return (
    <Box flexDirection="column">
      {/* Network drop retry prompt */}
      {networkDropped && (
        <Box marginTop={1} paddingX={1}>
          <Text color="red" bold>
            ✖ Network connection lost.{" "}
          </Text>
          <Text color="yellow" bold>
            Press R to retry.
          </Text>
        </Box>
      )}
      {/* Input box */}
      <Box marginTop={1}>
        <Box
          borderStyle="round"
          borderColor={isDisabled ? "gray" : "cyan"}
          paddingX={1}
          width={boxWidth}
        >
          <Text color={isDisabled ? "gray" : "cyan"} bold>
            {"> "}
          </Text>
          {showPlaceholder ? (
            <Text color="gray" dimColor>
              {placeholder}
            </Text>
          ) : (
            <Text color={isDisabled ? "gray" : "white"} wrap="truncate-end">
              {value}
              {!isDisabled && <Text color="cyan">▊</Text>}
            </Text>
          )}
        </Box>
      </Box>

      {/* Menu appears BELOW the input box */}
      {commandMenuVisible && (
        <CommandMenu
          items={filteredCommands}
          selectedIndex={selectedIndex}
          width={width}
        />
      )}

      {fileMenuVisible && (
        <FileMenu
          items={filteredFiles}
          selectedIndex={selectedIndex}
          width={width}
          query={atQuery ?? ""}
        />
      )}
    </Box>
  );
}