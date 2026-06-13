import React from "react";
import { Text, Box } from "ink";
import Spinner from "ink-spinner";

interface LoadingSpinnerProps {
  label?: string;
}

export function LoadingSpinner({ label = "Thinking…" }: LoadingSpinnerProps) {
  return (
    <Box>
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
      <Text color="dim"> {label}</Text>
    </Box>
  );
}