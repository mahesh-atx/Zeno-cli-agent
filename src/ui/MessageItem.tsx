import React from "react";
import { Box, Text } from "ink";
import { ToolOutput } from "./ToolOutput";
import type { ToolCall } from "./ToolOutput";
import { Ansi } from "./Ansi";
import { renderMarkdown, renderStreaming } from "../utils/render";
import { Colors } from "../themes/colors";

export type MessageRole = "user" | "assistant" | "error" | "system-notice";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  hideIcon?: boolean;
}

interface MessageItemProps {
  message: ChatMessage;
}

function UserMessage({ content }: { content: string }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={Colors.AccentGreen} bold>{"> "}</Text>
        <Text wrap="wrap">{content}</Text>
      </Box>
    </Box>
  );
}

function AssistantMessage({
  content,
  isStreaming,
  toolCalls,
  hideIcon,
}: {
  content: string;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  hideIcon?: boolean;
}) {
  const rendered = isStreaming
    ? renderStreaming(content)
    : content
    ? renderMarkdown(content).trim()
    : "";

  return (
    <Box flexDirection="column" marginTop={hideIcon ? 0 : 1}>
      {toolCalls && toolCalls.length > 0 && (
        <Box flexDirection="column" marginBottom={content || isStreaming ? 1 : 0}>
          {toolCalls.map((tc) => (
            <ToolOutput key={tc.id} toolCall={tc} />
          ))}
        </Box>
      )}

      {(content || isStreaming) && (
        <Box flexDirection="row">
          <Box width={2} flexShrink={0}>
            {!hideIcon && <Text color={Colors.AccentGreen}>● </Text>}
          </Box>

          <Box flexDirection="column">
            {isStreaming && !content && <Text color={Colors.Gray}>thinking…</Text>}

            {rendered && (
              <Box flexDirection="column">
                <Ansi wrap="wrap">
                  {rendered}
                  {isStreaming ? "\u258a" : ""}
                </Ansi>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function ErrorMessage({ content }: { content: string }) {
  return (
    <Box marginTop={1}>
      <Text color={Colors.AccentRed}>⚠ </Text>
      <Text color={Colors.AccentRed} wrap="wrap">{content}</Text>
    </Box>
  );
}

function SystemNotice({ content }: { content: string }) {
  return (
    <Box marginTop={1} flexDirection="column">
      {content.split("\n").map((line, i) => (
        <Text key={i} color={Colors.Gray}>{line}</Text>
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
          hideIcon={message.hideIcon}
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