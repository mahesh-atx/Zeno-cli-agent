import { countHistoryTokens, countMessageTokens } from "../utils/tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

// ─── Conversation Manager ─────────────────────────────────────────────────────

export class Conversation {
  private messages: Message[] = [];
  private systemPrompt: string;

  constructor(systemPrompt?: string) {
    this.systemPrompt =
      systemPrompt ??
      "You are a helpful coding assistant. Be concise, accurate, and practical. " +
      "When writing code, use the same language and style as the existing codebase.";
  }

  // ─── Add Messages ──────────────────────────────────────────────────────────

  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
  }

  addAssistantMessage(content: string): void {
    this.messages.push({ role: "assistant", content });
  }

  // ─── Read Messages ─────────────────────────────────────────────────────────

  /**
   * Returns full message array with system prompt prepended.
   * This is what gets sent to the provider on every request.
   */
  getMessages(): Message[] {
    const systemMessage: Message = {
      role: "system",
      content: this.systemPrompt,
    };
    return [systemMessage, ...this.messages];
  }

  /**
   * Returns only the conversation messages (no system prompt).
   */
  getHistory(): Message[] {
    return [...this.messages];
  }

  /**
   * Returns the last assistant message, or null if none exists.
   */
  getLastAssistantMessage(): Message | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === "assistant") {
        return this.messages[i];
      }
    }
    return null;
  }

  /**
   * Returns the last user message, or null if none exists.
   */
  getLastUserMessage(): Message | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === "user") {
        return this.messages[i];
      }
    }
    return null;
  }

  // ─── Remove Messages ───────────────────────────────────────────────────────

  /**
   * Removes the last message from history (used by /retry).
   */
  removeLastMessage(): void {
    this.messages.pop();
  }

  /**
   * Removes last assistant + user messages (full retry pair).
   */
  removeLastExchange(): void {
    // Remove last assistant message if it exists
    if (
      this.messages.length > 0 &&
      this.messages[this.messages.length - 1].role === "assistant"
    ) {
      this.messages.pop();
    }
  }

  // ─── Clear ─────────────────────────────────────────────────────────────────

  clear(): void {
    this.messages = [];
  }

  // ─── Token Counts ──────────────────────────────────────────────────────────

  getTotalTokens(): number {
    return countHistoryTokens(this.getMessages());
  }

  getLastMessageTokens(): number {
    const last = this.messages[this.messages.length - 1];
    if (!last) return 0;
    return countMessageTokens(last);
  }

  // ─── State ─────────────────────────────────────────────────────────────────

  isEmpty(): boolean {
    return this.messages.length === 0;
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  updateSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }
}
