# Zeno-cli-agent

A powerful CLI-based coding agent with multi-provider LLM support (OpenRouter, Groq, NVIDIA) and built-in interactive tools.

## Features

- **Multi-Provider Support**: Seamlessly switch between OpenRouter, Groq, and NVIDIA APIs.
- **Interactive Shell**: Interactive terminal chat interface with commands (`/help`, `/model`, `/clear`, `/tokens`).
- **Tool System**: The agent has access to various tools to read, write, edit files, and execute shell commands inside your workspace.

### Available Tools

- `read_file`: View the contents of a file (optionally a specific line range).
- `write_file`: Create or overwrite a file with new content.
- `edit_file`: Replace an exact string in a file with another string.
- `list_files`: Show files/folders in a directory (recursive optional).
- `run_command`: Execute a shell command (e.g., `git status`, `npm install`).

## Getting Started

1. Set your API keys in the `.env` file (`OPENROUTER_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`).
2. Run `npm install` to install dependencies.
3. Run `npm run build` to build the agent.
4. Run `node dist/index.js` to start the interactive agent.
