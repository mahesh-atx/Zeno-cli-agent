// src/providers/groq.ts
import { createGroq } from "@ai-sdk/groq";
import { streamText } from "ai";
import type { Message } from "../core/conversation";
import type { Config } from "../core/config";
import type { StreamResult } from "./openrouter";
import { translateProviderError } from "../errors/apiErrors";
import type { AgentEvent } from "../errors/base";

// ━━━ Available Groq Models ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const GROQ_MODELS = [
  "llama-3.1-70b-versatile",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
  "gemma2-9b-it",
] as const;

export const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";

// ━━━ Groq Client ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Returns a StreamResult on success.
 * On failure, returns a typed AgentEvent — never throws to console.
 */
export async function chatWithGroq(
  messages: Message[],
  model: string,
  config: Config,
  attempt = 1
): Promise<StreamResult | AgentEvent> {
  if (!config.groqApiKey) {
    // Missing key is an auth event, not a crash
    return {
      kind: "auth_error",
      message: "GROQ_API_KEY is not set. Add it to your .env file.",
      statusCode: 401,
      retryable: false,
      requiresUserAction: true,
      provider: "groq",
      timestamp: Date.now(),
    };
  }

  const groq = createGroq({ apiKey: config.groqApiKey });

  const formattedMessages = messages.map((msg) => ({
    role: msg.role as "system" | "user" | "assistant",
    content: msg.content,
  }));

  try {
    const result = streamText({
      model: groq(model),
      messages: formattedMessages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    return { stream: result.textStream };
  } catch (error) {
    // Translate raw HTTP/network error into a typed event
    return translateProviderError("groq", error, attempt);
  }
}