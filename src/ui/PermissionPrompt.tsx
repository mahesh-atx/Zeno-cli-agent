import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ActionType } from "../core/permissions";
import { Colors } from "../themes/colors";

export interface PendingPermission {
  id: string;
  action: ActionType;
  title: string;
  details: string[];
  resolve: (approved: boolean) => void;
}

interface PermissionPromptProps {
  permission: PendingPermission;
}

const OPTIONS = [
  { label: "Allow once", value: "once" },
  { label: "Allow all for this session", value: "all" },
  { label: "Deny", value: "deny" }
];

export function PermissionPrompt({ permission }: PermissionPromptProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input: string, key: any) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : OPTIONS.length - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < OPTIONS.length - 1 ? prev + 1 : 0));
      return;
    }

    if (key.return || key.tab) {
      const selected = OPTIONS[selectedIndex].value;
      if (selected === "all") {
        process.env.YES_TO_ALL = "true";
        permission.resolve(true);
      } else if (selected === "once") {
        permission.resolve(true);
      } else {
        permission.resolve(false);
      }
      return;
    }

    // Fallbacks for standard y/n
    if (input === "y" || input === "Y") {
      permission.resolve(true);
    } else if (input === "n" || input === "N" || key.escape) {
      permission.resolve(false);
    }
  });

  return (
    <Box
      flexDirection="column"
      width="100%"
      marginTop={1}
    >
      <Box paddingX={1} marginBottom={1}>
        <Text color={Colors.AccentYellow} bold>{permission.title}</Text>
      </Box>

      {permission.details.length > 0 && (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          {permission.details.slice(0, 20).map((line, i) => {
            let color: "green" | "red" | "gray" = "gray";
            const trim = line.trimStart();
            if (trim.startsWith("+")) color = "green";
            else if (trim.startsWith("-")) color = "red";

            return (
              <Text key={i} color={color}>{line}</Text>
            );
          })}
          {permission.details.length > 20 && (
            <Text color={Colors.Gray} dimColor>
              ... ({permission.details.length - 20} more lines)
            </Text>
          )}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1} width="100%">
        <Box paddingX={1} marginBottom={1}>
          <Text bold>Allow this action?</Text>
        </Box>
        {OPTIONS.map((opt, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box
              key={opt.value}
              width="100%"
              paddingX={1}
              backgroundColor={isSelected ? (Colors.FocusBackground ?? Colors.AccentYellow) : undefined}
            >
              <Text
                color={isSelected ? (Colors.FocusColor ?? Colors.Background) : Colors.Foreground}
                bold={isSelected}
              >
                {isSelected ? "❯ " : "  "}
                {opt.label}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}