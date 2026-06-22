// src/ui/QuestionPrompt.tsx
import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Colors } from "../themes/colors";

interface QuestionPromptProps {
  question: string;
  options?: string[];
  onSubmit: (answer: string) => void;
  onCancel: () => void;
}

export function QuestionPrompt({ question, options, onSubmit, onCancel }: QuestionPromptProps) {
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const hasOptions = options && options.length > 0;

  useInput((input, key) => {
    if (hasOptions) {
      if (key.upArrow) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
      } else if (key.return) {
        onSubmit(options[selectedIndex]);
      } else if (key.escape) {
        onCancel();
      }
    } else {
      if (key.return && value.trim()) {
        onSubmit(value);
      } else if (key.escape) {
        onCancel();
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      width="100%"
    >
      <Box paddingX={1} flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow} bold>❓ Question</Text>
      </Box>
      <Box paddingX={1} flexDirection="column" marginBottom={1}>
        <Text wrap="wrap" color={Colors.Foreground}>{question}</Text>
      </Box>
      
      {hasOptions ? (
        <Box flexDirection="column" width="100%">
          {options.map((opt, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Box
                key={i}
                width="100%"
                paddingX={1}
                backgroundColor={isSelected ? (Colors.FocusBackground ?? Colors.AccentYellow) : undefined}
              >
                <Text
                  color={isSelected ? (Colors.FocusColor ?? Colors.Background) : Colors.Foreground}
                  bold={isSelected}
                >
                  {isSelected ? "❯ " : "  "}
                  {opt}
                </Text>
              </Box>
            );
          })}
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>Enter to confirm · Esc to exit</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" width="100%" paddingX={1}>
          <Box>
            <Text color={Colors.AccentCyan} bold>❯ </Text>
            <TextInput 
              value={value} 
              onChange={setValue} 
              placeholder="Type your answer..." 
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Enter to confirm · Esc to exit</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}