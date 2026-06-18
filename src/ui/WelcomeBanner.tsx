import React from "react";
import { Box, Text } from "ink";

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
        <Box>
          <Text color="cyan" bold>
            ✻ Welcome to{" "}
          </Text>
          <Text color="cyanBright" bold>
            CLI Agent
          </Text>
          <Text color="cyan" bold>
            !
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text color="dim">  /help</Text>
          <Text color="dim"> for help, </Text>
          <Text color="dim">/status</Text>
          <Text color="dim"> for your current setup</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="dim">  cwd: </Text>
          <Text color="white">{process.cwd()}</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="dim">  model: </Text>
          <Text color="green">{model}</Text>
          <Text color="dim"> · provider: </Text>
          <Text color="cyan">{provider}</Text>
        </Box>
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