import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { runAgent } from "../../src/core/agent";
import { Conversation } from "../../src/core/conversation";

// Load env from project root
dotenv.config({ path: path.join(process.cwd(), ".env") });

// ─── Configuration ───────────────────────────────────────────────────────────

const PROVIDER =
  (process.env.TEST_PROVIDER as "groq" | "openrouter" | "nvidia") ?? "groq";
const MODEL = process.env.TEST_MODEL ?? "llama-3.1-8b-instant";

const API_KEY =
  PROVIDER === "groq"
    ? process.env.GROQ_API_KEY
    : PROVIDER === "openrouter"
    ? process.env.OPENROUTER_API_KEY
    : process.env.NVIDIA_API_KEY;

const hasApiKey = !!API_KEY && API_KEY.length > 10;

// ─── Debug Output ────────────────────────────────────────────────────────────

console.log("\n=== LLM Integration Test Config ===");
console.log(`Provider : ${PROVIDER}`);
console.log(`Model    : ${MODEL}`);
console.log(`Has key  : ${hasApiKey}`);
console.log(`Key hint : ${API_KEY ? API_KEY.slice(0, 8) + "..." : "NOT SET"}`);
console.log("====================================\n");

if (!hasApiKey) {
  console.warn(
    "⚠ No API key found. All LLM tests will be skipped.\n" +
    `  Set ${PROVIDER.toUpperCase()}_API_KEY in your .env file.\n` +
    `  Or set TEST_PROVIDER and the matching key.\n`
  );
}

const skipIfNoKey = hasApiKey ? it : it.skip;

// ─── Workspace ───────────────────────────────────────────────────────────────

const WORKSPACE = path.join(process.cwd(), "tests", "_llm_workspace");

function makeWorkspace() {
  fs.mkdirSync(path.join(WORKSPACE, "src"), { recursive: true });

  fs.writeFileSync(
    path.join(WORKSPACE, "calculator.ts"),
    [
      "export function add(a: number, b: number): number {",
      "  return a + b;",
      "}",
      "",
      "export function subtract(a: number, b: number): number {",
      "  return a - b;",
      "}",
    ].join("\n")
  );

  fs.writeFileSync(
    path.join(WORKSPACE, "README.md"),
    [
      "# Calculator",
      "",
      "A simple calculator module.",
      "",
      "## Functions",
      "- add(a, b)",
      "- subtract(a, b)",
    ].join("\n")
  );

  fs.writeFileSync(
    path.join(WORKSPACE, "src", "index.ts"),
    'export { add, subtract } from "../calculator";'
  );
}

function cleanWorkspace() {
  if (fs.existsSync(WORKSPACE)) {
    fs.rmSync(WORKSPACE, { recursive: true, force: true });
  }
  const todoFile = path.join(process.cwd(), ".cli_agent_todos.json");
  if (fs.existsSync(todoFile)) fs.unlinkSync(todoFile);
}

// ─── Runner Helper ───────────────────────────────────────────────────────────

interface RunResult {
  response: string;
  toolsInvoked: string[];
  toolResults: Record<string, unknown>;
  events: Array<{ kind: string; message: string }>;
  errors: string[];
  durationMs: number;
}

async function runWithTracking(
  prompt: string,
  systemPrompt?: string
): Promise<RunResult> {
  // Build a focused system prompt for tests
  // The default system prompt is very long — a shorter one helps
  // small models (like llama-3.1-8b) stay on task
  const testSystemPrompt =
    systemPrompt ??
    [
      "You are a coding assistant with access to tools.",
      "RULES:",
      "1. Always use the appropriate tool when asked to read, write, edit,",
      "   list, search, delete files, run commands, or search the web.",
      "2. Never answer from memory when a tool would give accurate information.",
      "3. Use exactly the tool the user specifies when they name one explicitly.",
      "4. After using a tool, summarize what you found or did.",
    ].join("\n");

  const conversation = new Conversation(testSystemPrompt);
  conversation.addUserMessage(prompt);

  const toolsInvoked: string[] = [];
  const toolResults: Record<string, unknown> = {};
  const events: Array<{ kind: string; message: string }> = [];
  const errors: string[] = [];
  const start = Date.now();

  const response = await runAgent({
    provider: PROVIDER,
    model: MODEL,
    conversation,
    onToolCall: (toolName, input) => {
      toolsInvoked.push(toolName);
      console.log(`    → [tool call ] ${toolName}`);
      console.log(`      input: ${JSON.stringify(input).slice(0, 150)}`);
    },
    onToolResult: (toolName, result) => {
      // Store last result per tool name
      toolResults[toolName] = result;
      const preview = JSON.stringify(result).slice(0, 150);
      console.log(`    ← [tool result] ${toolName}: ${preview}`);
    },
    onAgentEvent: (event) => {
      events.push({ kind: event.kind, message: event.message });
    },
    onError: (error) => {
      errors.push(error.message);
      console.error(`    ✖ [error] ${error.message}`);
    },
    onFatalError: (event) => {
      errors.push(event.message);
      console.error(`    ✖ [fatal] ${event.message}`);
    },
  });

  const durationMs = Date.now() - start;

  console.log(`    ⏱ Duration: ${durationMs}ms`);
  console.log(`    📋 Tools used: [${toolsInvoked.join(", ")}]`);
  console.log(`    💬 Response length: ${response.length} chars`);

  return { response, toolsInvoked, toolResults, events, errors, durationMs };
}

// ─── Sanity Check ────────────────────────────────────────────────────────────
// This runs first. If it fails, all other tests are meaningless.

describe("LLM Connection Sanity", () => {
  beforeAll(makeWorkspace);
  afterAll(cleanWorkspace);

  skipIfNoKey(
    "LLM responds to a plain text message with no tools",
    async () => {
      console.log("\n[sanity] Testing basic LLM connection...");

      const conversation = new Conversation("You are a helpful assistant.");
      conversation.addUserMessage('Reply with exactly the text: "PING_OK"');

      const response = await runAgent({
        provider: PROVIDER,
        model: MODEL,
        conversation,
        onError: (e) => console.error("Error:", e.message),
        onFatalError: (e) => console.error("Fatal:", e.message),
      });

      console.log(`[sanity] Response: "${response}"`);

      // If this fails, the API key or network is the problem
      expect(response.length).toBeGreaterThan(0);
      expect(response).toMatch(/PING_OK/i);
    },
    30_000
  );

  skipIfNoKey(
    "LLM actually calls a tool when directly instructed",
    async () => {
      console.log("\n[sanity] Testing tool invocation...");

      const calcsPath = path.join(WORKSPACE, "calculator.ts");
      const toolsInvoked: string[] = [];

      const conversation = new Conversation(
        [
          "You are a coding assistant with tools.",
          "When asked to read a file, you MUST call the read_file tool.",
          "Do not answer from memory. Use the tool.",
        ].join("\n")
      );
      conversation.addUserMessage(
        `Call the read_file tool on this exact path: ${calcsPath}`
      );

      const response = await runAgent({
        provider: PROVIDER,
        model: MODEL,
        conversation,
        onToolCall: (name) => {
          toolsInvoked.push(name);
          console.log(`  Tool called: ${name}`);
        },
        onError: (e) => console.error("Error:", e.message),
      });

      console.log(`[sanity] Tools invoked: [${toolsInvoked.join(", ")}]`);
      console.log(`[sanity] Response: "${response.slice(0, 200)}"`);

      // This is the critical gate test
      // If this fails, fix agent.ts maxSteps before running any other test
      expect(toolsInvoked).toContain("read_file");
    },
    30_000
  );
});

// ─── Individual Tool Tests ───────────────────────────────────────────────────

describe("LLM Tool Integration", () => {
  beforeAll(makeWorkspace);
  afterAll(cleanWorkspace);

  // ─── read_file ──────────────────────────────────────────────────────────

  describe("read_file", () => {
    skipIfNoKey(
      "reads a file and reports its contents",
      async () => {
        console.log("\n[read_file]");
        const filePath = path.join(WORKSPACE, "calculator.ts");

        const result = await runWithTracking(
          `Call the read_file tool on this path: "${filePath}". ` +
          `After reading it, tell me what functions it contains.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.durationMs).toBeGreaterThan(200); // real network call
        expect(result.toolsInvoked).toContain("read_file");

        const toolResult = result.toolResults["read_file"] as any;
        expect(toolResult?.success).toBe(true);
        expect(toolResult?.content).toBeDefined();
        expect(result.response.toLowerCase()).toMatch(/add|subtract/);
      },
      45_000
    );
  });

  // ─── write_file ─────────────────────────────────────────────────────────

  describe("write_file", () => {
    skipIfNoKey(
      "creates a new file at the specified path",
      async () => {
        console.log("\n[write_file]");
        const targetPath = path.join(WORKSPACE, "multiply.ts");

        // Remove if exists from a previous run
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);

        const result = await runWithTracking(
          `Use the write_file tool to create a file at this exact path: "${targetPath}". ` +
          `The file should contain a TypeScript function called multiply that takes ` +
          `two numbers and returns their product. Write it now.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("write_file");
        expect(fs.existsSync(targetPath)).toBe(true);

        const content = fs.readFileSync(targetPath, "utf-8");
        expect(content.toLowerCase()).toContain("multiply");
      },
      45_000
    );
  });

  // ─── edit_file ──────────────────────────────────────────────────────────

  describe("edit_file", () => {
    skipIfNoKey(
      "edits an existing file by replacing a string",
      async () => {
        console.log("\n[edit_file]");
        const targetPath = path.join(WORKSPACE, "version.ts");
        fs.writeFileSync(targetPath, "export const VERSION = '1.0.0';\n");

        const result = await runWithTracking(
          `First use read_file to read: "${targetPath}". ` +
          `Then use edit_file to change VERSION from '1.0.0' to '2.0.0'. ` +
          `Use the exact string you read as the searchString.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("edit_file");

        const content = fs.readFileSync(targetPath, "utf-8");
        expect(content).toContain("2.0.0");
        expect(content).not.toContain("1.0.0");
      },
      45_000
    );
  });

  // ─── list_files ─────────────────────────────────────────────────────────

  describe("list_files", () => {
    skipIfNoKey(
      "lists files in a given directory",
      async () => {
        console.log("\n[list_files]");

        const result = await runWithTracking(
          `Use the list_files tool to list what is in this directory: "${WORKSPACE}". ` +
          `Then tell me the names of the files you found.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("list_files");

        const toolResult = result.toolResults["list_files"] as any;
        expect(toolResult?.success).toBe(true);
        expect(result.response.toLowerCase()).toMatch(/calculator|readme/i);
      },
      45_000
    );
  });

  // ─── run_command ────────────────────────────────────────────────────────

  describe("run_command", () => {
    skipIfNoKey(
      "runs a shell command and returns stdout",
      async () => {
        console.log("\n[run_command]");

        const result = await runWithTracking(
          `Use the run_command tool to run this exact command: echo "TOOL_TEST_OUTPUT". ` +
          `Tell me what the command printed.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("run_command");

        const toolResult = result.toolResults["run_command"] as any;
        expect(toolResult?.exitCode).toBe(0);
        expect(toolResult?.stdout).toContain("TOOL_TEST_OUTPUT");
      },
      45_000
    );
  });

  // ─── search_files ───────────────────────────────────────────────────────

  describe("search_files", () => {
    skipIfNoKey(
      "searches file contents for a string",
      async () => {
        console.log("\n[search_files]");

        const result = await runWithTracking(
          `Use the search_files tool to search for the text "subtract" ` +
          `in the directory: "${WORKSPACE}". ` +
          `Tell me which files contain that word.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("search_files");

        const toolResult = result.toolResults["search_files"] as any;
        expect(toolResult?.success).toBe(true);
        expect(toolResult?.total).toBeGreaterThan(0);
      },
      45_000
    );
  });

  // ─── glob_files ─────────────────────────────────────────────────────────

  describe("glob_files", () => {
    skipIfNoKey(
      "finds files matching a glob pattern",
      async () => {
        console.log("\n[glob_files]");

        const result = await runWithTracking(
          `Use the glob_files tool with pattern "**/*.ts" in directory "${WORKSPACE}". ` +
          `Tell me how many TypeScript files you found and list their names.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("glob_files");

        const toolResult = result.toolResults["glob_files"] as any;
        expect(toolResult?.success).toBe(true);
        expect(toolResult?.total).toBeGreaterThan(0);
      },
      45_000
    );
  });

  // ─── delete_file ────────────────────────────────────────────────────────

  describe("delete_file", () => {
    skipIfNoKey(
      "deletes a file from disk",
      async () => {
        console.log("\n[delete_file]");
        const targetPath = path.join(WORKSPACE, "temp_to_delete.ts");
        fs.writeFileSync(targetPath, "// temp\n");
        expect(fs.existsSync(targetPath)).toBe(true);

        const result = await runWithTracking(
          `Use the delete_file tool to delete this file: "${targetPath}". ` +
          `Confirm when done.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("delete_file");
        expect(fs.existsSync(targetPath)).toBe(false);
      },
      45_000
    );

    skipIfNoKey(
      "returns an error for protected paths without crashing",
      async () => {
        console.log("\n[delete_file protected]");

        const result = await runWithTracking(
          `Try to use the delete_file tool to delete "node_modules". ` +
          `Tell me what happened.`
        );

        // Agent must not crash regardless of outcome
        expect(result.durationMs).toBeGreaterThan(200);

        if (result.toolsInvoked.includes("delete_file")) {
          const toolResult = result.toolResults["delete_file"] as any;
          expect(toolResult?.success).toBe(false);
        }
      },
      45_000
    );
  });

  // ─── web_search ─────────────────────────────────────────────────────────

  describe("web_search", () => {
    skipIfNoKey(
      "searches the web and returns results",
      async () => {
        console.log("\n[web_search]");

        const result = await runWithTracking(
          `Use the web_search tool to search for "vitest javascript testing". ` +
          `Tell me the title of the first result you get back.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("web_search");

        const toolResult = result.toolResults["web_search"] as any;
        expect(toolResult?.success).toBe(true);
        expect(Array.isArray(toolResult?.results)).toBe(true);
        expect(toolResult?.results?.length).toBeGreaterThan(0);
      },
      60_000
    );
  });

  // ─── web_fetch ──────────────────────────────────────────────────────────

  describe("web_fetch", () => {
    skipIfNoKey(
      "fetches a URL and returns page content",
      async () => {
        console.log("\n[web_fetch]");

        const result = await runWithTracking(
          `Use the web_fetch tool to fetch this URL: "https://example.com". ` +
          `Tell me the title of the page.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("web_fetch");

        const toolResult = result.toolResults["web_fetch"] as any;
        expect(toolResult?.success).toBe(true);
        expect(typeof toolResult?.title).toBe("string");
        expect(toolResult?.title?.length).toBeGreaterThan(0);
      },
      60_000
    );
  });

  // ─── todo_write ─────────────────────────────────────────────────────────

  describe("todo_write", () => {
    skipIfNoKey(
      "creates tasks and lists them",
      async () => {
        console.log("\n[todo_write]");

        // Clean slate
        const todoFile = path.join(process.cwd(), ".cli_agent_todos.json");
        if (fs.existsSync(todoFile)) fs.unlinkSync(todoFile);

        const result = await runWithTracking(
          `Use todo_write to do the following in order:\n` +
          `1. Call todo_write with action "add" and title "Task Alpha"\n` +
          `2. Call todo_write with action "add" and title "Task Beta"\n` +
          `3. Call todo_write with action "list" to see all tasks\n` +
          `Tell me the IDs of the tasks you created.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("todo_write");

        const todoInvocations = result.toolsInvoked.filter(
          (t) => t === "todo_write"
        );
        // add + add + list = at least 2, likely 3
        expect(todoInvocations.length).toBeGreaterThanOrEqual(2);

        // Tasks on disk
        expect(fs.existsSync(todoFile)).toBe(true);
        const tasks = JSON.parse(fs.readFileSync(todoFile, "utf-8"));
        expect(tasks.length).toBeGreaterThanOrEqual(2);
        expect(
          tasks.some((t: any) =>
            t.title.toLowerCase().includes("alpha")
          )
        ).toBe(true);
      },
      60_000
    );
  });

  // ─── ask_question ───────────────────────────────────────────────────────

  describe("ask_question", () => {
    skipIfNoKey(
      "pauses and emits agent_paused when it calls ask_question",
      async () => {
        console.log("\n[ask_question]");

        const result = await runWithTracking(
          `Use the ask_question tool to ask me: "Which file should I refactor?" ` +
          `with options ["calculator.ts", "index.ts"]. ` +
          `Call the tool now.`,
          [
            "You are a coding assistant.",
            "When explicitly told to call ask_question, you MUST call it.",
            "Do not skip it. Call ask_question with the exact question and options given.",
          ].join("\n")
        );

        expect(result.toolsInvoked).toContain("ask_question");

        const toolResult = result.toolResults["ask_question"] as any;
        expect(toolResult?.requires_user_input).toBe(true);
        expect(typeof toolResult?.question).toBe("string");

        // agent_paused event should have fired
        const pausedEvent = result.events.find(
          (e) => e.kind === "agent_paused"
        );
        expect(pausedEvent).toBeDefined();
      },
      45_000
    );
  });

  // ─── send_message ───────────────────────────────────────────────────────

  describe("send_message", () => {
    skipIfNoKey(
      "sends a progress message with message_sent:true",
      async () => {
        console.log("\n[send_message progress]");

        const result = await runWithTracking(
          `Use the send_message tool to send a message with:\n` +
          `- message: "I am making progress on your task"\n` +
          `- type: "info"\n` +
          `- ends_turn: false\n` +
          `Then tell me you sent the message.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("send_message");

        const toolResult = result.toolResults["send_message"] as any;
        expect(toolResult?.success).toBe(true);
        expect(toolResult?.message_sent).toBe(true);
        expect(toolResult?.ends_turn).toBe(false);
        expect(toolResult?.ui_message?.content).toBeDefined();
      },
      45_000
    );

    skipIfNoKey(
      "ends the turn when ends_turn is true",
      async () => {
        console.log("\n[send_message ends_turn]");

        const result = await runWithTracking(
          `Use the send_message tool with:\n` +
          `- message: "All tasks complete"\n` +
          `- type: "success"\n` +
          `- ends_turn: true\n` +
          `Call the tool right now.`,
          [
            "You are a coding assistant.",
            "When told to call send_message with ends_turn: true, call it immediately.",
            "After calling it, stop. Do not say anything else.",
          ].join("\n")
        );

        expect(result.toolsInvoked).toContain("send_message");

        const toolResult = result.toolResults["send_message"] as any;
        expect(toolResult?.ends_turn).toBe(true);

        // agent_turn_end event should fire
        const turnEnd = result.events.find(
          (e) => e.kind === "agent_turn_end"
        );
        expect(turnEnd).toBeDefined();
      },
      45_000
    );
  });

  // ─── Multi-Tool Chains ───────────────────────────────────────────────────

  describe("Multi-tool chains", () => {
    skipIfNoKey(
      "chains read → write: reads a file then writes a new one based on it",
      async () => {
        console.log("\n[chain: read → write]");
        const sourcePath = path.join(WORKSPACE, "calculator.ts");
        const targetPath = path.join(WORKSPACE, "calculator_copy.ts");
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);

        const result = await runWithTracking(
          `Step 1: Use read_file to read "${sourcePath}".\n` +
          `Step 2: Use write_file to create "${targetPath}" ` +
          `with the same content but add a comment at the top: // copied file\n` +
          `Do both steps now.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("read_file");
        expect(result.toolsInvoked).toContain("write_file");
        expect(fs.existsSync(targetPath)).toBe(true);
      },
      60_000
    );

    skipIfNoKey(
      "chains list → read: lists directory then reads a specific file",
      async () => {
        console.log("\n[chain: list → read]");

        const result = await runWithTracking(
          `Step 1: Use list_files to list what is in "${WORKSPACE}".\n` +
          `Step 2: From what you found, use read_file to read "calculator.ts" ` +
          `(use the full path you see in the listing).\n` +
          `Do both steps.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("list_files");
        expect(result.toolsInvoked).toContain("read_file");

        const readResult = result.toolResults["read_file"] as any;
        expect(readResult?.success).toBe(true);
      },
      60_000
    );

    skipIfNoKey(
      "chains search → read: finds a file by content then reads it",
      async () => {
        console.log("\n[chain: search → read]");

        const result = await runWithTracking(
          `Step 1: Use search_files to search for "subtract" in "${WORKSPACE}".\n` +
          `Step 2: From the results, use read_file to read the file that contains it.\n` +
          `Tell me the full content of that file.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("search_files");
        expect(result.toolsInvoked).toContain("read_file");

        const readResult = result.toolResults["read_file"] as any;
        expect(readResult?.success).toBe(true);
        expect(readResult?.content).toContain("subtract");
      },
      60_000
    );

    skipIfNoKey(
      "chains todo add → write → todo update: plan, execute, complete",
      async () => {
        console.log("\n[chain: todo → write → todo]");
        const todoFile = path.join(process.cwd(), ".cli_agent_todos.json");
        if (fs.existsSync(todoFile)) fs.unlinkSync(todoFile);

        const newFile = path.join(WORKSPACE, "divide.ts");
        if (fs.existsSync(newFile)) fs.unlinkSync(newFile);

        const result = await runWithTracking(
          `Do these steps in order:\n` +
          `1. Call todo_write action "add" title "Write divide.ts"\n` +
          `2. Call write_file to create "${newFile}" with a divide function\n` +
          `3. Call todo_write action "update" to mark the task "completed"\n` +
          `   (use the id returned from step 1)\n` +
          `Confirm when all three steps are done.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("todo_write");
        expect(result.toolsInvoked).toContain("write_file");
        expect(fs.existsSync(newFile)).toBe(true);

        const todoInvocations = result.toolsInvoked.filter(
          (t) => t === "todo_write"
        );
        expect(todoInvocations.length).toBeGreaterThanOrEqual(2);
      },
      90_000
    );
  });

  // ─── Error Recovery ──────────────────────────────────────────────────────

  describe("Error recovery", () => {
    skipIfNoKey(
      "LLM reports when a file does not exist",
      async () => {
        console.log("\n[error recovery: missing file]");
        const missingPath = path.join(WORKSPACE, "does_not_exist.ts");

        const result = await runWithTracking(
          `Use read_file to read "${missingPath}". ` +
          `If it does not exist, tell me clearly that the file was not found.`
        );

        expect(result.durationMs).toBeGreaterThan(200);
        expect(result.toolsInvoked).toContain("read_file");

        const toolResult = result.toolResults["read_file"] as any;
        // Tool should return success: false
        expect(toolResult?.success).toBe(false);

        // LLM should report the failure
        expect(result.response.toLowerCase()).toMatch(
          /not found|doesn.t exist|does not exist|no file|cannot find|error/i
        );
      },
      45_000
    );

    skipIfNoKey(
      "LLM reads file before editing to get exact content",
      async () => {
        console.log("\n[error recovery: read before edit]");
        const targetPath = path.join(WORKSPACE, "calculator.ts");

        // Reset to known state
        fs.writeFileSync(
          targetPath,
          [
            "export function add(a: number, b: number): number {",
            "  return a + b;",
            "}",
            "",
            "export function subtract(a: number, b: number): number {",
            "  return a - b;",
            "}",
          ].join("\n")
        );

        const result = await runWithTracking(
          `Edit "${targetPath}" to rename the "add" function to "addition".\n` +
          `IMPORTANT: First use read_file to get the exact current content, ` +
          `then use edit_file with the exact string you read as searchString.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("read_file");
        expect(result.toolsInvoked).toContain("edit_file");

        const content = fs.readFileSync(targetPath, "utf-8");
        const editResult = result.toolResults["edit_file"] as any;

        // Either the edit succeeded on disk OR the LLM reported doing it
        const diskChanged = content.includes("addition");
        const editSucceeded = editResult?.success === true;
        expect(diskChanged || editSucceeded).toBe(true);
      },
      60_000
    );
  });
});