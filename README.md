# Zeno-cli-agent

A powerful CLI-based coding agent with multi-provider LLM support (OpenRouter, Groq, NVIDIA) and built-in interactive tools.

## Features

- **Multi-Provider Support**: Seamlessly switch between OpenRouter, Groq, and NVIDIA APIs.
- **Interactive Shell**: Interactive terminal chat interface with commands (`/help`, `/model`, `/clear`, `/tokens`).
- **Tool System**: The agent has access to various tools to read, write, edit files, and execute shell commands inside your workspace.
- **Rich Terminal UI**: Built with React Ink, featuring live previews, status bars, loading spinners, and an interactive command menu.
- **Smart @Mentions**: Type `@` followed by a filename to fuzzy-search and instantly include file contents in your context.
- **Context Management**: Built-in token counting and context window management to prevent context overflows.
- **Markdown & Syntax Highlighting**: Beautifully formatted terminal outputs with fully rendered markdown and code syntax highlighting (`marked` & `cli-highlight`).
- **Permission System**: Built-in permission prompts for safe execution of commands and file modifications.

### Available Tools

- `read_file`: View the contents of a file (optionally a specific line range).
- `write_file`: Create or overwrite a file with new content.
- `edit_file`: Replace an exact string in a file with another string.
- `delete_file`: Safely delete a file or directory.
- `list_files`: Show files/folders in a directory (recursive optional).
- `search_files`: Search file contents across the codebase (like grep).
- `glob_files`: Find files by path pattern.
- `run_command`: Execute a shell command (e.g., `git status`, `npm install`).
- `web_search`: Search the web using DuckDuckGo.
- `web_fetch`: Fetch a specific URL and extract its content as Markdown.
- `todo_write`: Manage a persistent task list for complex refactors.
- `ask_question`: Pause execution and ask the user for clarification.
- `send_message`: Send a formatted progress update to the user.

## Getting Started

1. Set your API keys in the `.env` file (`OPENROUTER_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`).
2. Run `npm install` to install dependencies.
3. Run `npm run build` to build the agent.
4. Run `node dist/index.js` to start the interactive agent.

## Testing

This project uses [Vitest](https://vitest.dev/) for testing. The test suite is divided into fast unit tests and comprehensive LLM integration tests.

- `npm run test` - Runs all tests.
- `npm run test:unit` - Runs only the unit tests (core logic, tools, and error handling).
- `npm run test:llm` - Runs the LLM integration tests against real models.
- `npm run test:llm:watch` - Runs the LLM integration tests in watch mode.

**Note on LLM Integration Tests:**
The integration tests interact with real LLM APIs to verify that the agent correctly understands and chains tools together. They require an active API key to run successfully. By default, they use the `groq` provider. 
If no API key is found in your `.env` file, the integration tests will gracefully skip themselves. You can configure which provider to test against by setting `TEST_PROVIDER` (e.g., `groq`, `openrouter`, or `nvidia`) and `TEST_MODEL` in your `.env`.

## Project Structure

```text
cli-agent/
├── .env                          # Environment variables (API keys)
├── .env.example                  # Example environment file
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsup.config.ts                # Build configuration
├── vitest.config.ts              # Vitest test configuration
├── dist/                         # Compiled output
├── tests/                        # Unit and integration tests
├── src/
│   ├── index.ts                  # Entry point
│   ├── commands/
│   │   └── index.ts              # CLI command definitions
│   ├── core/
│   │   ├── agent.ts              # Agent main loop & orchestration
│   │   ├── config.ts             # Configuration management
│   │   ├── context.ts            # Context window management
│   │   ├── conversation.ts       # Conversation history
│   │   └── permissions.ts        # Permission system
│   ├── errors/
│   │   ├── base.ts               # Typed event and error definitions
│   │   └── toolErrors.ts         # Tool error handling utilities
│   ├── providers/
│   │   ├── index.ts              # Provider registry
│   │   ├── groq.ts               # Groq API provider
│   │   ├── nvidia.ts             # NVIDIA API provider
│   │   └── openrouter.ts         # OpenRouter API provider
│   ├── tools/
│   │   ├── index.ts              # Tool registry
│   │   ├── askQuestion.ts        # ask_question tool
│   │   ├── deleteFile.ts         # delete_file tool
│   │   ├── editFile.ts           # edit_file tool
│   │   ├── globFiles.ts          # glob_files tool
│   │   ├── listFiles.ts          # list_files tool
│   │   ├── readFile.ts           # read_file tool
│   │   ├── runCommand.ts         # run_command tool
│   │   ├── searchFiles.ts        # search_files tool
│   │   ├── sendMessage.ts        # send_message tool
│   │   ├── todoWrite.ts          # todo_write tool
│   │   ├── webFetch.ts           # web_fetch tool
│   │   ├── webSearch.ts          # web_search tool
│   │   └── writeFile.ts          # write_file tool
│   ├── ui/
│   │   ├── App.tsx               # React ink app root
│   │   ├── ChatWindow.tsx        # Chat message display
│   │   ├── CommandMenu.tsx       # /command menu overlay
│   │   ├── DiffView.tsx          # File diff viewer
│   │   ├── FileMenu.tsx          # File explorer menu
│   │   ├── InputBar.tsx          # User input component
│   │   ├── LivePreview.tsx       # Live preview panel
│   │   ├── LoadingSpinner.tsx    # Loading indicator
│   │   ├── MessageItem.tsx       # Single message renderer
│   │   ├── PermissionPrompt.tsx  # Permission approval UI
│   │   ├── QuestionPrompt.tsx    # Interactive question UI
│   │   ├── StatusBar.tsx         # Bottom status bar
│   │   ├── StatusLine.tsx        # Status line component
│   │   ├── ToolOutput.tsx        # Tool execution output
│   │   └── WelcomeBanner.tsx     # Welcome screen
│   └── utils/
│       ├── atMention.ts          # @mention file resolution
│       ├── fileSearch.ts         # Fuzzy file search
│       ├── render.ts             # Output rendering helpers
│       └── tokens.ts             # Token counting utilities
└── node_modules/                 # Dependencies
```
