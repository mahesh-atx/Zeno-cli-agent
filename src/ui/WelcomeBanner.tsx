import React from "react";
import { Box, Text } from "ink";
import { ThemedGradient } from "./ThemedGradient";

const LOGO_LINES = [
  ' ▝▜▄      ▗█▀▀▜▙▝█▛▀▀▌▜██▖▟██▘▜█▘▜██▖▝█▛▝█▛',
  '   ▝▜▄    █▌     █▙▟  ▐█▝█▛▐█ ▐█ ▐█▝█▖█▌ █▌',
  '  ▗▟▀     ▜▙ ▝█▛ █▌▝ ▖▐█   ▐█ ▐█ ▐█ ▝██▌ █▌',
  ' ▝▀        ▀▀▀▀▘▝▀▀▀▀▘▀▀▘  ▀▀▘▀▀▘▀▀▘ ▝▀▀▝▀▀'
];

const LOGO = LOGO_LINES.join("\n");

interface WelcomeBannerProps {
  provider: string;
  model: string;
}

export function WelcomeBanner({ provider, model }: WelcomeBannerProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        paddingX={1}
        paddingY={0}
        flexDirection="column"
      >
        <ThemedGradient>{LOGO}</ThemedGradient>
      </Box>

      <Box flexDirection="column" marginTop={1} paddingX={1}>
        <Text color="white" bold>Tips for getting started:</Text>
        <Box marginTop={1} flexDirection="column">
          <Text color="dim">1. Ask the agent to read, edit, or create files</Text>
          <Text color="dim">2. Run commands with permission prompts</Text>
          <Text color="dim">3. Use /model to switch providers</Text>
          <Text color="dim">4. Be specific — the more context, the better</Text>
        </Box>
      </Box>
    </Box>
  );
}