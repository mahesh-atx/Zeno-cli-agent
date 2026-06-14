// src/core/conversation.ts
import { countHistoryTokens, countMessageTokens } from "../utils/tokens";

// ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

// ━━━ Conversation Manager ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class Conversation {
  private messages: Message[] = [];
  private systemPrompt: string;
  private baseSystemPrompt: string;

    constructor(systemPrompt?: string) {
    const base =
      systemPrompt ??
      [
        "You are an expert coding assistant with access to tools that let you",
        "read files, write files, edit files, list directories, and run commands.",
        "",
        "## Tool Use Rules — follow these exactly:",
        "",
        "1. NEVER ask the user for a file path if a tool call fails.",
        "   Instead, immediately call list_files to discover what exists,",
        "   then retry with the correct path you find.",
        "",
        "2. If read_file fails with 'File not found':",
        "   - Call list_files on the likely directory (e.g. '.' or 'src')",
        "   - Find the closest matching file in the results",
        "   - Call read_file again with the exact path from list_files",
        "   - Only tell the user if you truly cannot find anything relevant",
        "",
        "3. If a tool returns { success: false, error: '...' }:",
        "   - Read the error message carefully",
        "   - Attempt an alternative approach automatically",
        "   - Do NOT ask the user to fix it for you",
        "",
        "4. If list_files returns an empty directory:",
        "   - Try the parent directory",
        "   - Try common subdirectories: src/, lib/, app/",
        "",
        "5. When editing files:",
        "   - Always read_file first to see current content",
        "   - Use the exact content from read_file in your searchString",
        "",
        "6. Be concise in your final response.",
        "   Show the user what you did, not what went wrong internally.",
        "   Use the same language and style as the existing codebase.",
        "",
        "7. If you encounter an unfamiliar error, need library documentation, or want to verify a package:",
        "   - Use web_search to find official docs or StackOverflow threads.",
        "   - Use web_fetch to read the specific documentation page or article.",
        "   - Do NOT guess API signatures or library versions from memory.",
        
        "8. DO NOT show raw HTML, Markdown tables, or file contents in your response.",
        "   - You MUST summarize findings in natural language.",
        "   - Only show code blocks when writing or editing code.",
        "   - Only show file paths when necessary for clarity.",
        "9. To find where code is used or locate specific text across the project:",
        "   - Use search_files (acts like grep). Use 'isRegex: true' for complex patterns.",
        "10. To find files by name or path structure:",
        "   - Use glob_files (e.g., pattern: '**/*.test.ts').",
        "11. To clean up obsolete files:",
        "   - Use delete_file. NEVER use write_file with empty content to delete a file.",
        "12. For complex, multi-step tasks:",
        "    - Use todo_write to create a plan and track your progress.",
        "    - Mark tasks as 'completed' only after you have verified they work.",
        "13. If the user's request is ambiguous or you lack critical context:",
        "    - Use ask_question to pause and ask the user for clarification.",
        "    - NEVER guess critical architectural decisions.",
        "14. To communicate progress without ending your turn:",
        "    - Use send_message to push updates to the user while you continue working.",
      ].join("\n");
    this.baseSystemPrompt = base;
    this.systemPrompt = base;
  }

  // ─── System Prompt ────────────────────────────────────────────

  /**
   * Updates the full system prompt (including context file block).
   * Called by App.tsx before each runAgent() call with the
   * ContextManager.buildSystemPrompt() result.
   */
  updateSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /**
   * Returns the base system prompt without context files.
   */
  getBaseSystemPrompt(): string {
    return this.baseSystemPrompt;
  }

  /**
   * Updates only the base prompt — context block is re-applied
   * separately via updateSystemPrompt().
   */
  updateBaseSystemPrompt(prompt: string): void {
    this.baseSystemPrompt = prompt;
    this.systemPrompt = prompt;
  }

  // ─── Add Messages ─────────────────────────────────────────────

  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
  }

  addAssistantMessage(content: string): void {
    this.messages.push({ role: "assistant", content });
  }

  // ─── Read Messages ────────────────────────────────────────────

  /**
   * Returns the full message array with the current system prompt
   * (which includes context files if any were injected).
   * This is what gets sent to the provider.
   */
  getMessages(): Message[] {
    return [
      { role: "system", content: this.systemPrompt },
      ...this.messages,
    ];
  }

  /**
   * Returns messages with a custom override system prompt.
   * Used by agent.ts when passing truncated history.
   */
  getMessagesWithPrompt(systemPrompt: string): Message[] {
    return [
      { role: "system", content: systemPrompt },
      ...this.messages,
    ];
  }

  /**
   * Returns only the conversation messages (no system prompt).
   */
  getHistory(): Message[] {
    return [...this.messages];
  }

  getLastAssistantMessage(): Message | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === "assistant") {
        return this.messages[i];
      }
    }
    return null;
  }

  getLastUserMessage(): Message | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === "user") {
        return this.messages[i];
      }
    }
    return null;
  }

  // ─── Remove Messages ──────────────────────────────────────────

  removeLastMessage(): void {
    this.messages.pop();
  }

  removeLastExchange(): void {
    if (
      this.messages.length > 0 &&
      this.messages[this.messages.length - 1].role === "assistant"
    ) {
      this.messages.pop();
    }
  }

  /**
   * Replaces internal message history with a pre-truncated array.
   * Called by App.tsx after ContextManager.truncateHistory().
   * The system message at index 0 is stripped — we manage it separately.
   */
  applyTruncatedHistory(truncated: Message[]): void {
    // Strip system message from front if present
    this.messages =
      truncated[0]?.role === "system" ? truncated.slice(1) : truncated;
  }

  // ─── Clear ────────────────────────────────────────────────────

  clear(): void {
    this.messages = [];
    this.systemPrompt = this.baseSystemPrompt;
  }

  // ─── Token Counts ─────────────────────────────────────────────

  getTotalTokens(): number {
    return countHistoryTokens(this.getMessages());
  }

  /**
   * Returns only conversation history tokens (no system prompt).
   * Used by ContextManager to calculate total budget accurately.
   */
  getHistoryTokens(): number {
    return countHistoryTokens(this.messages);
  }

  getLastMessageTokens(): number {
    const last = this.messages[this.messages.length - 1];
    if (!last) return 0;
    return countMessageTokens(last);
  }

  // ─── State ────────────────────────────────────────────────────

  isEmpty(): boolean {
    return this.messages.length === 0;
  }

  getMessageCount(): number {
    return this.messages.length;
  }
}