import React from "react";
import { Box, Text } from "ink";
import { ToolOutput, GroupedReadFilesOutput } from "./ToolOutput";
import type { ToolCall } from "./ToolOutput";
import { Ansi } from "./Ansi";
import { getHighlighter } from "../utils/render";
import { Markdown } from "./Markdown";
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
  isLast?: boolean;
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
  isLast,
}: {
  content: string;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  hideIcon?: boolean;
  isLast?: boolean;
}) {
  const textContent = content + (isStreaming ? "\u258a" : "");

  return (
    <Box flexDirection="column" marginTop={hideIcon ? 0 : 1}>
      {toolCalls && toolCalls.length > 0 && (
        <Box flexDirection="column" marginBottom={content || isStreaming ? 1 : 0}>
          {toolCalls.length > 1 && toolCalls.every(tc => tc.toolName === "read_file") ? (
            <Box marginBottom={1} marginLeft={2}>
              <GroupedReadFilesOutput toolCalls={toolCalls} isLast={isLast} />
            </Box>
          ) : (
            toolCalls.map((tc) => (
              <Box key={tc.id} marginBottom={1} marginLeft={2}>
                <ToolOutput toolCall={tc} isLast={isLast} />
              </Box>
            ))
          )}
        </Box>
      )}

      {(content || isStreaming) && (
        <Box flexDirection="row">
          <Box width={2} flexShrink={0}>
            {!hideIcon && <Text color={Colors.AccentGreen}>● </Text>}
          </Box>

          <Box flexDirection="column">
            {isStreaming && !content && <Text color={Colors.Gray}>thinking…</Text>}

            {textContent && (
              <Box flexDirection="column">
                <Markdown content={textContent} highlight={getHighlighter()} />
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
    <Box flexDirection="row" marginTop={1}>
      <Box width={2} flexShrink={0}>
        <Text color={Colors.AccentRed}>│ </Text>
      </Box>
      <Box flexDirection="column">
        <Text color={Colors.AccentRed} wrap="wrap">{content}</Text>
      </Box>
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

export function MessageItem({ message, isLast }: MessageItemProps) {
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
          isLast={isLast}
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
