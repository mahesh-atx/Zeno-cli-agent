import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import Fuse from "fuse.js";
import { CommandMenu } from "./CommandMenu";
import { FileMenu } from "./FileMenu";
import { COMMAND_META } from "../commands";
import type { CommandMeta } from "../commands";
import { searchFiles, getFileList } from "../utils/fileSearch";
import type { FileEntry } from "../utils/fileSearch";
import { ProviderMenu, PROVIDER_LIST } from "./ProviderMenu";
import { ModelMenu } from "./ModelMenu";
import type { ProviderName } from "../core/config";
import { getModelsForProvider } from "../providers";

interface InputBarProps {
  onSubmit: (value: string) => void;
  isDisabled: boolean;
  placeholder?: string;
  /** When true, show R-to-retry prompt and accept R keypress */
  networkDropped?: boolean;
  currentProviderId: ProviderName;
  currentModelId: string;
  onProviderConfirm: (provider: ProviderName) => void;
  onModelConfirm: (model: string) => void;
  onMenuStateChange?: (isOpen: boolean) => void;
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

function getActiveAtMentionQuery(value: string): string | null {
  const atIdx = value.lastIndexOf("@");
  if (atIdx === -1) return null;
  if (atIdx > 0) {
    const prev = value[atIdx - 1];
    if (prev !== " " && prev !== "\t" && prev !== "\n") return null;
  }
  const after = value.slice(atIdx + 1);
  if (/\s/.test(after)) return null;
  return after;
}

function replaceAtMention(value: string, filePath: string): string {
  const atIdx = value.lastIndexOf("@");
  if (atIdx === -1) return value;
  return value.slice(0, atIdx) + "@" + filePath + " ";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InputBar({
  onSubmit,
  isDisabled,
  placeholder: placeholderProp,
  networkDropped = false,
  currentProviderId,
  currentModelId,
  onProviderConfirm,
  onModelConfirm,
  onMenuStateChange,
}: InputBarProps) {
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuClosed, setMenuClosed] = useState(false);
  
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // ── Decide which menu (if any) to show ──
  const commandMenuVisible =
    !isDisabled && !menuClosed && !showProviderPicker && !showModelPicker && shouldShowCommandMenu(value);

  const atQuery = !isDisabled && !menuClosed && !showProviderPicker && !showModelPicker
    ? getActiveAtMentionQuery(value)
    : null;
  const fileMenuVisible = !commandMenuVisible && atQuery !== null;

  const isMenuOpen = commandMenuVisible || fileMenuVisible || showProviderPicker || showModelPicker;

  useEffect(() => {
    if (onMenuStateChange) {
      onMenuStateChange(isMenuOpen);
    }
  }, [isMenuOpen, onMenuStateChange]);

  // ── Warm the file cache as soon as user types @ ──
  useEffect(() => {
    if (fileMenuVisible) {
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
  
  const modelsForCurrentProvider = useMemo(
    () => getModelsForProvider(currentProviderId),
    [currentProviderId]
  );

  // ── Reset selection when input changes ──
  useEffect(() => {
    setSelectedIndex(0);
  }, [value]);

  // ── Apply selected command ──
  const handleSlashCommand = (command: string) => {
    if (command === "/provider") {
      setShowProviderPicker(true);
      setValue("");
      return;
    }
    if (command === "/model") {
      setShowModelPicker(true);
      setValue("");
      return;
    }
    
    // Submit normally for other commands
    onSubmit(command);
    setValue("");
  };

  const acceptSelectedCommand = () => {
    if (filteredCommands.length === 0) return;
    const cmd = filteredCommands[Math.min(selectedIndex, filteredCommands.length - 1)];
    if (cmd.usage) {
      setValue(`${cmd.name} `);
    } else {
      handleSlashCommand(cmd.name);
    }
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

      if (showProviderPicker) {
        const len = PROVIDER_LIST.length;
        if (key.upArrow) {
          if (len > 0) setSelectedIndex((prev) => (prev - 1 + len) % len);
          return;
        }
        if (key.downArrow) {
          if (len > 0) setSelectedIndex((prev) => (prev + 1) % len);
          return;
        }
        if (key.escape) {
          setShowProviderPicker(false);
          setValue("");
          return;
        }
        if (key.return) {
          if (len > 0) {
            const p = PROVIDER_LIST[Math.min(selectedIndex, len - 1)];
            if (p) {
              setShowProviderPicker(false);
              setValue("");
              onProviderConfirm(p.id);
            }
          }
          return;
        }
      }

      if (showModelPicker) {
        const len = modelsForCurrentProvider.length;
        if (key.upArrow) {
          if (len > 0) setSelectedIndex((prev) => (prev - 1 + len) % len);
          return;
        }
        if (key.downArrow) {
          if (len > 0) setSelectedIndex((prev) => (prev + 1) % len);
          return;
        }
        if (key.escape) {
          setShowModelPicker(false);
          setValue("");
          return;
        }
        if (key.return) {
          if (len > 0) {
            const m = modelsForCurrentProvider[Math.min(selectedIndex, len - 1)];
            if (m) {
              setShowModelPicker(false);
              setValue("");
              onModelConfirm(m);
            }
          }
          return;
        }
      }

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
        if (key.tab || key.return) {
          acceptSelectedCommand();
          return;
        }
        if (key.escape) {
          setMenuClosed(true);
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
        if (trimmed === "/provider") {
          setShowProviderPicker(true);
          setValue("");
          return;
        }
        if (trimmed === "/model") {
          setShowModelPicker(true);
          setValue("");
          return;
        }
        
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
  const cursor = !isDisabled ? "█" : " ";
  const placeholder = placeholderProp ?? 'Type your message or @file...';

  return (
    <Box flexDirection="column" width="100%" marginTop={1}>
      {/* Network drop retry prompt */}
      {networkDropped && (
        <Box paddingX={1}>
          <Text color="red" bold>
            ✖ Network connection lost.{" "}
          </Text>
          <Text color="yellow" bold>
            Press R to retry.
          </Text>
        </Box>
      )}

      {/* Input box styled like kode-cli */}
      <Box
        width="100%"
        backgroundColor="#222222" // DarkGray equivalent
      >
        <Text color="magentaBright" bold>
          {" ❯ "}
        </Text>
        {value.length > 0 ? (
          <Text color="white">
            {value}
            <Text color="cyanBright">{cursor}</Text>
          </Text>
        ) : (
          <Text>
            <Text color="cyanBright">{cursor}</Text>
            <Text dimColor>{placeholder}</Text>
          </Text>
        )}
      </Box>

      {/* Menus */}
      {showModelPicker && (
        <ModelMenu
          models={modelsForCurrentProvider}
          selectedIndex={selectedIndex}
          currentModelId={currentModelId}
          providerLabel={PROVIDER_LIST.find((p) => p.id === currentProviderId)?.label ?? ""}
        />
      )}
      {showProviderPicker && (
        <ProviderMenu selectedIndex={selectedIndex} currentProviderId={currentProviderId} />
      )}
      {commandMenuVisible && (
        <CommandMenu
          items={filteredCommands}
          selectedIndex={selectedIndex}
        />
      )}
      {fileMenuVisible && (
        <FileMenu
          items={filteredFiles}
          selectedIndex={selectedIndex}
          query={atQuery ?? ""}
        />
      )}
    </Box>
  );
}