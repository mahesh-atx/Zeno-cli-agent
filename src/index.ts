import * as readline from "readline";
import chalk from "chalk";
import { config } from "./core/config";
import { Conversation } from "./core/conversation";
import { runAgent } from "./core/agent";
import { getDefaultModel, PROVIDER_MODELS } from "./providers";
import { formatTokenCount } from "./utils/tokens";
import type { ProviderName } from "./core/config";

// ─── State ────────────────────────────────────────────────────────────────────

let currentProvider: ProviderName = config.defaultProvider;
let currentModel: string = config.defaultModel;
let conversation = new Conversation();
let isLoading = false;

// ─── Display Helpers ──────────────────────────────────────────────────────────

function printHeader(): void {
  console.log("");
  console.log(chalk.cyan("╔══════════════════════════════════════════════════════════╗"));
  console.log(chalk.cyan("║") + chalk.white.bold("              CLI Agent — V1                              ") + chalk.cyan("║"));
  console.log(chalk.cyan("╚══════════════════════════════════════════════════════════╝"));
  console.log(`  Provider : ${chalk.cyan(currentProvider)}`);
  console.log(`  Model    : ${chalk.green(currentModel)}`);
  console.log(`  Type ${chalk.yellow("/help")} for commands. ${chalk.dim("Ctrl+C to exit.")}`);
  console.log("");
}

function printStatus(): void {
  const tokens = conversation.getTotalTokens();
  console.log(
    chalk.dim(`\n[${currentProvider} | ${currentModel} | Tokens: ${formatTokenCount(tokens)}]`)
  );
}

function printHelp(): void {
  console.log("");
  console.log(chalk.cyan("┌────────────────────────────────────────────────┐"));
  console.log(chalk.cyan("│") + chalk.white("  CLI Agent — Commands                          ") + chalk.cyan("│"));
  console.log(chalk.cyan("├────────────────────────────────────────────────┤"));
  console.log(chalk.cyan("│") + "  /help              Show this list             " + chalk.cyan("│"));
  console.log(chalk.cyan("│") + "  /model [name]      Switch model or list all   " + chalk.cyan("│"));
  console.log(chalk.cyan("│") + "  /clear             Clear conversation         " + chalk.cyan("│"));
  console.log(chalk.cyan("│") + "  /tokens            Show current token count   " + chalk.cyan("│"));
  console.log(chalk.cyan("│") + "  /exit              Quit                       " + chalk.cyan("│"));
  console.log(chalk.cyan("└────────────────────────────────────────────────┘"));
  console.log("");
  console.log(chalk.dim("  Tools available: read_file, write_file, edit_file, list_files, run_command"));
  console.log(chalk.dim("  Use --yes flag to auto-approve all tool permissions."));
  console.log("");
}

function printModels(): void {
  console.log("");
  console.log(`Current: ${chalk.cyan(currentProvider)} / ${chalk.green(currentModel)}`);
  console.log("");
  console.log("Available models:");
  console.log("");

  for (const [providerName, models] of Object.entries(PROVIDER_MODELS)) {
    console.log(`  ${chalk.cyan(`[${providerName}]`)}`);
    models.forEach((model) => {
      const isCurrent =
        providerName === currentProvider && model === currentModel;
      console.log(
        `    ${isCurrent ? chalk.green("→ ") : "  "}${isCurrent ? chalk.green(model) : model}`
      );
    });
    console.log("");
  }
}

// ─── Slash Command Handler ────────────────────────────────────────────────────

function handleSlashCommand(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return false;

  const parts = trimmed.split(" ");
  const command = parts[0];
  const args = parts.slice(1);

  switch (command) {
    case "/help": {
      printHelp();
      return true;
    }

    case "/clear": {
      conversation.clear();
      console.log(chalk.green("\n  Conversation cleared. Tokens reset to 0.\n"));
      return true;
    }

    case "/tokens": {
      const tokens = conversation.getTotalTokens();
      console.log(`\n  Current token count: ${chalk.yellow(formatTokenCount(tokens))}\n`);
      return true;
    }

    case "/model": {
      const modelArg = args[0];

      if (!modelArg) {
        printModels();
        return true;
      }

      // Find model across all providers
      const allModels = Object.entries(PROVIDER_MODELS).flatMap(
        ([provider, models]) =>
          models.map((m) => ({ provider: provider as ProviderName, model: m }))
      );

      const match = allModels.find((entry) => entry.model === modelArg);

      if (match) {
        currentProvider = match.provider;
        currentModel = match.model;
        console.log(
          chalk.green(`\n  Switched to ${currentModel} (${currentProvider})\n`)
        );
      } else {
        currentModel = modelArg;
        console.log(chalk.green(`\n  Switched to model: ${currentModel} on ${currentProvider}\n`));
        console.log(
          chalk.yellow(`  Note: This model is not in the known list. It may or may not work.\n`)
        );
      }
      return true;
    }

    case "/exit": {
      console.log(chalk.dim("\n  Goodbye.\n"));
      process.exit(0);
    }

    default: {
      console.log(chalk.yellow(`\n  Unknown command: ${command}. Type /help for list.\n`));
      return true;
    }
  }
}

// ─── Send Message ─────────────────────────────────────────────────────────────

async function sendMessage(userInput: string): Promise<void> {
  if (isLoading) {
    console.log(chalk.yellow("  (Please wait for the current response to finish)"));
    return;
  }

  const trimmed = userInput.trim();
  if (!trimmed) return;

  // Add to conversation
  conversation.addUserMessage(trimmed);

  isLoading = true;
  process.stdout.write(chalk.white("\nAssistant: "));

  let fullResponse = "";

  try {
    fullResponse = await runAgent({
      provider: currentProvider,
      model: currentModel,
      conversation,
      onToken: (token) => {
        process.stdout.write(token);
      },
      onToolCall: (toolName, input) => {
        // Tool display is handled inside agent.ts
      },
      onToolResult: (toolName, result) => {
        // Result display is handled inside agent.ts
        // Newline before assistant continues
        process.stdout.write(chalk.white("\nAssistant: "));
      },
      onError: (error) => {
        console.error(chalk.red(`\n  Error: ${error.message}`));
      },
    });

    process.stdout.write("\n");

    // Save complete response
    conversation.addAssistantMessage(fullResponse);

  } catch (error) {
    // Remove user message since request failed
    conversation.removeLastMessage();

    if (error instanceof Error) {
      console.error(chalk.red(`\n  Error: ${error.message}\n`));
    } else {
      console.error(chalk.red("\n  An unknown error occurred.\n"));
    }
  } finally {
    isLoading = false;
    printStatus();
  }
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Handle single-shot mode: node dist/index.js "some question"
  const args = process.argv.slice(2);

  if (args.length > 0 && !args[0].startsWith("--")) {
    const question = args.join(" ");
    console.log(`\n> You asked: ${question}`);
    console.log(`> [Provider: ${currentProvider} | Model: ${currentModel}]`);
    console.log("");
    await sendMessage(question);
    process.exit(0);
  }

  // Interactive mode
  printHeader();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  // Prompt function
  const prompt = (): void => {
    process.stdout.write(chalk.cyan("You: "));
  };

  prompt();

  rl.on("line", async (line) => {
    const input = line.trim();

    if (!input) {
      prompt();
      return;
    }

    // Check for slash commands first
    if (handleSlashCommand(input)) {
      prompt();
      return;
    }

    // Otherwise send as message
    await sendMessage(input);
    prompt();
  });

  rl.on("close", () => {
    console.log(chalk.dim("\n\n  Goodbye.\n"));
    process.exit(0);
  });

  // Handle Ctrl+C
  process.on("SIGINT", () => {
    console.log(chalk.dim("\n\n  Goodbye.\n"));
    process.exit(0);
  });
}

// ─── Run ──────────────────────────────────────────────────────────────────────

main().catch((error) => {
  console.error(chalk.red("\nFatal error:"), error);
  process.exit(1);
});
