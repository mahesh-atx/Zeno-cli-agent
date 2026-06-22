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
import { ThemeMenu } from "./ThemeMenu";
import { StatusMenu } from "./StatusMenu";
import type { ProviderName } from "../core/config";
import type { ContextSummary } from "../core/context";
import { getModelsForProvider } from "../providers";
import { themeManager } from "../themes/theme-manager";
import { Colors } from "../themes/colors";

interface InputBarProps {
  onSubmit: (value: string) => void;
  isDisabled: boolean;
  placeholder?: string;
  /** When true, show R-to-retry prompt and accept R keypress */
  networkDropped?: boolean;
  currentProviderId: ProviderName;
  currentModelId: string;
  currentThemeName: string;
  contextSummary: ContextSummary;
  onProviderConfirm: (provider: ProviderName) => void;
  onModelConfirm: (model: string) => void;
  onThemePreview?: (themeName: string) => void;
  onThemeConfirm: (themeName: string) => void;
  onRemoveFile: (filePath: string) => void;
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
  currentThemeName,
  contextSummary,
  onProviderConfirm,
  onModelConfirm,
  onThemePreview,
  onThemeConfirm,
  onRemoveFile,
  onMenuStateChange,
}: InputBarProps) {
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuClosed, setMenuClosed] = useState(false);
  
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  // ── Decide which menu (if any) to show ──
  const commandMenuVisible =
    !isDisabled && !menuClosed && !showProviderPicker && !showModelPicker && !showThemePicker && !showStatusMenu && shouldShowCommandMenu(value);

  const atQuery = !isDisabled && !menuClosed && !showProviderPicker && !showModelPicker && !showThemePicker && !showStatusMenu
    ? getActiveAtMentionQuery(value)
    : null;
  const fileMenuVisible = !commandMenuVisible && atQuery !== null;

  const isMenuOpen = showProviderPicker || showModelPicker || showThemePicker || showStatusMenu || commandMenuVisible || fileMenuVisible;

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
    if (command === "/theme") {
      const themes = themeManager.getAvailableThemes();
      const currentIdx = themes.findIndex(t => t.name === currentThemeName);
      setSelectedIndex(Math.max(0, currentIdx));
      themeManager.startPreview(currentThemeName);
      setShowThemePicker(true);
      setValue("");
      return;
    }
    const baseCmd = command.split(" ")[0];
    if (baseCmd === "/context" || baseCmd === "/tokens" || baseCmd === "/status") {
      setSelectedIndex(0);
      setShowStatusMenu(true);
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

      if (showThemePicker) {
        const themes = themeManager.getAvailableThemes();
        const len = themes.length;
        if (key.upArrow) {
          if (len > 0) {
            const nextIdx = (selectedIndex - 1 + len) % len;
            setSelectedIndex(nextIdx);
            themeManager.preview(themes[nextIdx].name);
            onThemePreview?.(themes[nextIdx].name);
          }
          return;
        }
        if (key.downArrow) {
          if (len > 0) {
            const nextIdx = (selectedIndex + 1) % len;
            setSelectedIndex(nextIdx);
            themeManager.preview(themes[nextIdx].name);
            onThemePreview?.(themes[nextIdx].name);
          }
          return;
        }
        if (key.escape) {
          themeManager.cancelPreview();
          onThemePreview?.(themeManager.getActiveTheme().name);
          setShowThemePicker(false);
          setValue("");
          return;
        }
        if (key.return) {
          if (len > 0) {
            const t = themes[Math.min(selectedIndex, len - 1)];
            if (t) {
              setShowThemePicker(false);
              setValue("");
              onThemeConfirm(t.name);
            }
          }
          return;
        }
      }
      
      if (showStatusMenu) {
        const len = contextSummary.files.length;
        if (key.upArrow) {
          if (len > 0) {
            setSelectedIndex((prev) => (prev - 1 + len) % len);
          }
          return;
        }
        if (key.downArrow) {
          if (len > 0) {
            setSelectedIndex((prev) => (prev + 1) % len);
          }
          return;
        }
        if (key.escape) {
          setShowStatusMenu(false);
          setValue("");
          return;
        }
        if (key.return) {
          if (len > 0) {
            const file = contextSummary.files[Math.min(selectedIndex, len - 1)];
            onRemoveFile(file);
          }
          // Intentionally do not close the menu on file remove, so user can remove multiple files
          return;
        }
        return;
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
        if (key.meta) {
          // Alt+Enter for multi-line
          setValue((prev) => prev + "\n");
          return;
        }

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
        if (trimmed === "/theme") {
          const themes = themeManager.getAvailableThemes();
          const currentIdx = themes.findIndex(t => t.name === currentThemeName);
          setSelectedIndex(Math.max(0, currentIdx));
          themeManager.startPreview(currentThemeName);
          setShowThemePicker(true);
          setValue("");
          return;
        }
        const baseCmd = trimmed.split(" ")[0];
        if (baseCmd === "/context" || baseCmd === "/tokens" || baseCmd === "/status") {
          setSelectedIndex(0);
          setShowStatusMenu(true);
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

      if (key.ctrl && input === "n") {
        setValue((prev) => prev + "\n");
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
          <Text color={Colors.AccentRed} bold>
            ✖ Network connection lost.{" "}
          </Text>
          <Text color={Colors.AccentYellow} bold>
            Press R to retry.
          </Text>
        </Box>
      )}

      {/* Input box styled like kode-cli */}
      <Box
        width="100%"
        backgroundColor={Colors.InputBackground ?? Colors.DarkGray}
      >
        <Text color={Colors.AccentPurple} bold>
          {" ❯ "}
        </Text>
        {value.length > 0 ? (
          <Text color={Colors.Foreground}>
            {value}
            <Text color={Colors.AccentCyan}>{cursor}</Text>
          </Text>
        ) : (
          <Text>
            <Text color={Colors.AccentCyan}>{cursor}</Text>
            <Text color={Colors.Gray}>{placeholder}</Text>
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
      {showThemePicker && (
        <ThemeMenu selectedIndex={selectedIndex} />
      )}
      {showStatusMenu && (
        <StatusMenu
          selectedIndex={selectedIndex}
          currentProviderId={currentProviderId}
          currentModelId={currentModelId}
          contextSummary={contextSummary}
        />
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