import React from "react";
import { render } from "ink";
import fs from "fs";
import path from "path";
import "./themes/theme-manager";
import { App } from "./ui/App";

const [major] = process.versions.node.split(".").map(Number);
if (major < 18) {
  console.error(
    `✗ Node.js 18 or higher is required. You are running Node.js ${process.versions.node}`
  );
  process.exit(1);
}

// ─── CLI Args Handling (P2) ──────────────────────────────────────────────────
const args = process.argv.slice(2);

function printHelp() {
  console.log(`
Zeno CLI Agent — AI coding assistant

Usage: cli-agent [options]

Options:
  --help, -h          Show this help
  --version, -v       Show version
  --debug             Enable debug logging
  --yes, -y           Auto-approve all permissions
  --provider <name>   Set provider (openrouter, groq, nvidia, opencodezen)
  --model <name>      Set model
  --cwd <path>        Set working directory

Commands (inside TUI):
  /help               Show all commands
  /model [name]       Show or change model
  /provider           Switch provider
  /theme              Switch theme
  /add <path>         Add file to context
  /remove <path>      Remove file from context
  /context, /files    Show context files
  /tokens             Show token usage
  /status             Show session status
  /save [file]        Save conversation to markdown
  /resume [file]      Resume from saved session
  /clear              Clear conversation
  /exit, /quit        Quit

Environment:
  OPENROUTER_API_KEY, GROQ_API_KEY, NVIDIA_API_KEY, OPENCODEZEN_API_KEY
  DEFAULT_PROVIDER, DEFAULT_MODEL, TEMPERATURE, MAX_TOKENS
  DEBUG=1, YES_TO_ALL=1, ALLOW_OUTSIDE_CWD=1

Config file (P2):
  ~/.config/cli-agent/config.json or .cli-agent/config.json
  {
    "defaultProvider": "openrouter",
    "defaultModel": "poolside/laguna-m.1:free",
    "temperature": 0.7,
    "maxTokens": 16384,
    "openrouterApiKey": "...",
    "providers": { "groq": { "apiKey": "..." } }
  }

Examples:
  cli-agent
  cli-agent --yes
  cli-agent --provider groq --model llama-3.3-70b-versatile
`);
}

function printVersion() {
  try {
    const pkgPath = path.resolve(new URL(import.meta.url).pathname, "../../package.json");
    // When running via dist/index.js, package.json is in parent dir of dist? Actually dist is child of root, so ../package.json
    // Try alternative paths
    const altPaths = [
      path.join(process.cwd(), "package.json"),
      path.resolve(path.dirname(new URL(import.meta.url).pathname), "../package.json"),
      path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../package.json"),
    ];
    for (const p of altPaths) {
      if (fs.existsSync(p)) {
        const pkg = JSON.parse(fs.readFileSync(p, "utf-8"));
        console.log(`${pkg.name || "cli-agent"} v${pkg.version || "1.0.0"}`);
        return;
      }
    }
    console.log("cli-agent v1.0.0");
  } catch {
    console.log("cli-agent v1.0.0");
  }
}

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  printVersion();
  process.exit(0);
}

if (args.includes("--debug")) {
  process.env.DEBUG = "1";
}

// Handle --cwd flag before Ink renders (change process cwd)
const cwdIdx = args.findIndex(a => a === "--cwd");
if (cwdIdx !== -1 && args[cwdIdx + 1]) {
  const newCwd = path.resolve(args[cwdIdx + 1]);
  try {
    process.chdir(newCwd);
    if (process.env.DEBUG) console.log(`[debug] Changed cwd to ${newCwd}`);
  } catch (e: any) {
    console.error(`Failed to change directory to ${newCwd}: ${e.message}`);
    process.exit(1);
  }
}

// Push the cursor down a bit so Ink doesn't render at the very top
process.stdout.write("\n");

const instance = render(React.createElement(App), {
  exitOnCtrlC: true,
  patchConsole: false,
});

instance.waitUntilExit().then(() => process.exit(0));
