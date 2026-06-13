import * as readline from "readline";
import { config } from "./core/config";
import { Conversation } from "./core/conversation";
import { getProvider, getDefaultModel, PROVIDER_MODELS } from "./providers";
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
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║              CLI Agent — V1                              ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Provider : ${currentProvider}`);
  console.log(`  Model    : ${currentModel}`);
  console.log(`  Type /help for commands. Ctrl+C to exit.`);
  console.log("");
}

function printStatus(): void {
  const tokens = conversation.getTotalTokens();
  process.stdout.write(
    `\n[${currentProvider} | ${currentModel} | Tokens: ${formatTokenCount(tokens)}]\n`
  );
}

function printHelp(): void {
  console.log("");
  console.log("┌────────────────────────────────────────────────┐");
  console.log("│  CLI Agent — Commands                          │");
  console.log("├────────────────────────────────────────────────┤");
  console.log("│  /help              Show this list             │");
  console.log("│  /model [name]      Switch model or list all   │");
  console.log("│  /clear             Clear conversation         │");
  console.log("│  /tokens            Show current token count   │");
  console.log("│  /exit              Quit                       │");
  console.log("└────────────────────────────────────────────────┘");
  console.log("");
}

function printModels(): void {
  console.log("");
  console.log(`Current: ${currentProvider} / ${currentModel}`);
  console.log("");
  console.log("Available models:");
  console.log("");

  for (const [providerName, models] of Object.entries(PROVIDER_MODELS)) {
    console.log(`  [${providerName}]`);
    models.forEach((model) => {
      const isCurrent =
        providerName === currentProvider && model === currentModel;
      console.log(`    ${isCurrent ? "→ " : "  "}${model}`);
    });
    console.log("");
  }
}

// ─── Slash Command Handler ────────────────────────────────────────────────────

function handleSlashCommand(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return false;

  const [command, ...args] = trimmed.split(" ");

  switch (command) {
    case "/help": {
      printHelp();
      return true;
    }

    case "/clear": {
      conversation.clear();
      console.log("\n  Conversation cleared. Tokens reset to 0.\n");
      return true;
    }

    case "/tokens": {
      const tokens = conversation.getTotalTokens();
      console.log(`\n  Current token count: ${formatTokenCount(tokens)}\n`);
      return true;
    }

    case "/model": {
      const modelArg = args[0];

      if (!modelArg) {
        printModels();
        return true;
      }

      // Check if it matches provider:model format
      const allModels = Object.entries(PROVIDER_MODELS).flatMap(
        ([provider, models]) =>
          models.map((m) => ({ provider: provider as ProviderName, model: m }))
      );

      const match = allModels.find((entry) => entry.model === modelArg);

      if (match) {
        currentProvider = match.provider;
        currentModel = match.model;
        console.log(
          `\n  Switched to ${currentModel} (${currentProvider})\n`
        );
      } else {
        // Accept unknown model on current provider (some models not in our list)
        currentModel = modelArg;
        console.log(
          `\n  Switched to model: ${currentModel} on ${currentProvider}\n`
        );
        console.log(
          `  Note: This model is not in the known list. It may or may not work.\n`
        );
      }
      return true;
    }

    case "/exit": {
      console.log("\n  Goodbye.\n");
      process.exit(0);
    }

    default: {
      console.log(`\n  Unknown command: ${command}. Type /help for list.\n`);
      return true;
    }
  }
}

// ─── Send Message ─────────────────────────────────────────────────────────────

async function sendMessage(userInput: string): Promise<void> {
  if (isLoading) {
    console.log("  (Please wait for the current response to finish)");
    return;
  }

  const trimmed = userInput.trim();
  if (!trimmed) return;

  // Add user message to conversation
  conversation.addUserMessage(trimmed);

  // Get the provider chat function
  const chatFn = getProvider(currentProvider, config);

  isLoading = true;
  process.stdout.write("\nAssistant: ");

  let fullResponse = "";

  try {
    const result = await chatFn(conversation.getMessages(), currentModel);

    // Stream tokens to stdout as they arrive
    for await (const token of result.stream) {
      process.stdout.write(token);
      fullResponse += token;
    }

    // Newline after streaming completes
    process.stdout.write("\n");

    // Save complete response to conversation
    conversation.addAssistantMessage(fullResponse);
  } catch (error) {
    // Remove the user message we added since the request failed
    conversation.removeLastMessage();

    if (error instanceof Error) {
      console.error(`\n  Error: ${error.message}\n`);
    } else {
      console.error("\n  An unknown error occurred.\n");
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
    process.stdout.write("You: ");
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
    console.log("\n\n  Goodbye.\n");
    process.exit(0);
  });

  // Handle Ctrl+C
  process.on("SIGINT", () => {
    console.log("\n\n  Goodbye.\n");
    process.exit(0);
  });
}

// ─── Run ──────────────────────────────────────────────────────────────────────

main().catch((error) => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
