import React from "react";
import { marked, type Tokens, type Token } from "marked";
import crypto from "crypto";

const TOKEN_CACHE_MAX = 500;
const tokenCache = new Map<string, Token[]>();

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

const MD_SYNTAX_RE = /[#*`|[>\-_~]|\n\n|^\d+\. |\n\d+\. /;
function hasMarkdownSyntax(s: string): boolean {
  return MD_SYNTAX_RE.test(s.length > 500 ? s.slice(0, 500) : s);
}

function cachedLexer(content: string): Token[] {
  if (!hasMarkdownSyntax(content)) {
    return [{
      type: "paragraph",
      raw: content,
      text: content,
      tokens: [{ type: "text", raw: content, text: content }]
    } as Token];
  }
  
  const key = hashContent(content);
  const hit = tokenCache.get(key);
  if (hit) {
    tokenCache.delete(key);
    tokenCache.set(key, hit);
    return hit;
  }
  
  const tokens = marked.lexer(content);
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const first = tokenCache.keys().next().value;
    if (first !== undefined) tokenCache.delete(first);
  }
  
  tokenCache.set(key, tokens);
  return tokens;
}
import { Box } from "ink";
import { Ansi } from "./Ansi";
import { MarkdownTable } from "./MarkdownTable";
import { configureMarked, formatToken, type SyntaxHighlighter } from "../utils/markdown";

export function Markdown({
  content,
  highlight,
}: {
  content: string;
  highlight: SyntaxHighlighter | null;
}): React.ReactNode {
  configureMarked();

  if (!content) return null;

  const tokens = cachedLexer(content);
  const elements: React.ReactNode[] = [];
  let nonTableContent = "";

  const flushNonTableContent = () => {
    if (nonTableContent) {
      elements.push(
        <Ansi key={elements.length} wrap="wrap">
          {nonTableContent.trimEnd()}
        </Ansi>
      );
      nonTableContent = "";
    }
  };

  for (const token of tokens) {
    if (token.type === "table") {
      flushNonTableContent();
      elements.push(
        <MarkdownTable
          key={elements.length}
          token={token as Tokens.Table}
          highlight={highlight}
        />
      );
    } else {
      nonTableContent += formatToken(token, 0, null, null, highlight);
    }
  }

  flushNonTableContent();

  return (
    <Box flexDirection="column" gap={1}>
      {elements}
    </Box>
  );
}
