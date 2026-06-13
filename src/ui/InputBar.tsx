import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InputBarProps {
  onSubmit: (value: string) => void;
  isDisabled: boolean;
  placeholder?: string;
  width?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InputBar({
  onSubmit,
  isDisabled,
  placeholder = "Type a message...",
}: InputBarProps) {
  const [value, setValue] = useState("");
  const termWidth = process.stdout.columns ?? 80;

  useInput(
    (input: string, key: any) => {
      if (isDisabled) return;

      if (key.return) {
        const trimmed = value.trim();
        if (trimmed) {
          onSubmit(trimmed);
          setValue("");
        }
        return;
      }

      if (key.backspace || key.delete) {
        setValue((prev) => prev.slice(0, -1));
        return;
      }

      if (key.ctrl && input === "u") {
        // Ctrl+U — clear line
        setValue("");
        return;
      }

      // Ignore non-printable keys
      if (input && !key.ctrl && !key.meta) {
        setValue((prev) => prev + input);
      }
    },
    { isActive: !isDisabled }
  );

  const displayValue = value || (isDisabled ? "" : "");
  const showPlaceholder = !value && !isDisabled;
  const cursor = !isDisabled ? "▊" : "";

  return (
    <Box
      width={termWidth}
      marginTop={1}
      paddingX={1}
      borderStyle="single"
      borderColor={isDisabled ? "dim" : "cyan"}
      flexDirection="row"
    >
      <Text color={isDisabled ? "dim" : "white"} bold>
        {isDisabled ? "  " : "> "}
      </Text>

      {showPlaceholder && !displayValue ? (
        <Text color="dim">{placeholder}</Text>
      ) : (
        <Text color={isDisabled ? "dim" : "white"} wrap="truncate-end">
          {displayValue}
          {cursor && <Text color="cyan">{cursor}</Text>}
        </Text>
      )}
    </Box>
  );
}