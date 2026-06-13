import React from "react";
import { Box } from "ink";
import { MessageItem } from "./MessageItem";
import type { ChatMessage } from "./MessageItem";
import { LoadingSpinner } from "./LoadingSpinner";
import { PermissionPrompt } from "./PermissionPrompt";
import type { PendingPermission } from "./PermissionPrompt";

interface ChatWindowProps {
  activeMessage: ChatMessage | null;
  isLoading: boolean;
  pendingPermission: PendingPermission | null;
}

export function ChatWindow({
  activeMessage,
  isLoading,
  pendingPermission,
}: ChatWindowProps) {
  return (
    <Box flexDirection="column">
      {/* The currently streaming assistant message (if any) */}
      {activeMessage && <MessageItem message={activeMessage} />}

      {/* Spinner only when waiting for the first token */}
      {isLoading && (!activeMessage || activeMessage.content === "") && (
        <Box marginY={1} marginLeft={2}>
          <LoadingSpinner />
        </Box>
      )}

      {/* Inline permission prompt */}
      {pendingPermission && (
        <Box marginX={1}>
          <PermissionPrompt permission={pendingPermission} />
        </Box>
      )}
    </Box>
  );
}