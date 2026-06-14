// src/ui/QuestionPrompt.tsx
import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

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
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1} marginY={1}>
      <Text color="yellow" bold>❓ Agent Question</Text>
      <Box marginTop={1}>
        <Text wrap="wrap">{question}</Text>
      </Box>
      
      {hasOptions ? (
        <Box flexDirection="column" marginTop={1}>
          {options.map((opt, i) => (
            <Text key={i} color={i === selectedIndex ? "cyan" : "white"}>
              {i === selectedIndex ? "❯ " : "  "}{opt}
            </Text>
          ))}
          <Box marginTop={1}>
            <Text dimColor>Use ↑/↓ to select, Enter to confirm, Esc to cancel</Text>
          </Box>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color="cyan">Answer: </Text>
          <TextInput 
            value={value} 
            onChange={setValue} 
            placeholder="Type your answer and press Enter..." 
          />
          <Box marginLeft={2}>
            <Text dimColor>(Esc to cancel)</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}