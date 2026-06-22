import React from "react";
import { Text, Box } from "ink";
import Spinner from "ink-spinner";
import { Colors } from "../themes/colors";

interface LoadingSpinnerProps {
  label?: string;
}

export function LoadingSpinner({ label = "Thinking…" }: LoadingSpinnerProps) {
  return (
    <Box>
      <Text color={Colors.AccentCyan}>
        <Spinner type="dots" />
      </Text>
      <Text color={Colors.Gray}> {label}</Text>
    </Box>
  );
}