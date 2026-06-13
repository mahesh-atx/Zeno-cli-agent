import React from "react";
import { Box, Text } from "ink";
import { ToolOutput } from "./ToolOutput";
import type { ToolCall } from "./ToolOutput";
import { renderMarkdown, renderStreaming } from "../utils/render";

export type MessageRole = "user" | "assistant" | "error" | "system-notice";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
}

interface MessageItemProps {
  message: ChatMessage;
}

function UserMessage({ content }: { content: string }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="green" bold>{"> "}</Text>
        <Text wrap="wrap">{content}</Text>
      </Box>
    </Box>
  );
}

function AssistantMessage({
  content,
  isStreaming,
  toolCalls,
}: {
  content: string;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
}) {
  const rendered = isStreaming
    ? renderStreaming(content)
    : content
    ? renderMarkdown(content).trim()
    : "";

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="cyan" bold>✻ </Text>
        {isStreaming && !content && <Text color="dim">thinking…</Text>}
      </Box>

      {toolCalls && toolCalls.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {toolCalls.map((tc) => (
            <ToolOutput key={tc.id} toolCall={tc} />
          ))}
        </Box>
      )}

      {rendered && (
        <Box marginLeft={2} flexDirection="column">
          <Text wrap="wrap">
            {rendered}
            {isStreaming && <Text color="cyan">▊</Text>}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function ErrorMessage({ content }: { content: string }) {
  return (
    <Box marginTop={1}>
      <Text color="red">⚠ </Text>
      <Text color="red" wrap="wrap">{content}</Text>
    </Box>
  );
}

function SystemNotice({ content }: { content: string }) {
  return (
    <Box marginTop={1} flexDirection="column">
      {content.split("\n").map((line, i) => (
        <Text key={i} color="gray" dimColor>{line}</Text>
      ))}
    </Box>
  );
}

export function MessageItem({ message }: MessageItemProps) {
  switch (message.role) {
    case "user":
      return <UserMessage content={message.content} />;
    case "assistant":
      return (
        <AssistantMessage
          content={message.content}
          isStreaming={message.isStreaming}
          toolCalls={message.toolCalls}
        />
      );
    case "error":
      return <ErrorMessage content={message.content} />;
    case "system-notice":
      return <SystemNotice content={message.content} />;
    default:
      return null;
  }
}