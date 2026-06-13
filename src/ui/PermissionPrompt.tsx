import React from "react";
import { Box, Text, useInput } from "ink";
import type { ActionType } from "../core/permissions";

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

export function PermissionPrompt({ permission }: PermissionPromptProps) {
  useInput((input: string, key: any) => {
    if (input === "y" || input === "Y") {
      permission.resolve(true);
    } else if (input === "n" || input === "N" || key.escape) {
      permission.resolve(false);
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      marginTop={1}
    >
      <Text color="yellow" bold>{permission.title}</Text>

      {permission.details.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
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
            <Text color="gray" dimColor>
              ... ({permission.details.length - 20} more lines)
            </Text>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text>Allow? </Text>
        <Text color="green" bold>[y]</Text>
        <Text color="gray"> / </Text>
        <Text color="red" bold>[n]</Text>
      </Box>
    </Box>
  );
}