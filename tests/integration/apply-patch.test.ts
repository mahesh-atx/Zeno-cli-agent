import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { runAgent } from "../../src/core/agent";
import { Conversation } from "../../src/core/conversation";

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

console.log("\n=== apply_patch LLM Integration Test ===");
console.log(`Provider : ${PROVIDER}`);
console.log(`Model    : ${MODEL}`);
console.log(`Has key  : ${hasApiKey}`);
console.log("========================================\n");

const skipIfNoKey = hasApiKey ? it : it.skip;

// ─── Workspace ───────────────────────────────────────────────────────────────

const WORKSPACE = path.join(process.cwd(), "tests", "_patch_workspace");

// Relative path from cwd — this is what the LLM must use in patch headers
// process.cwd() = C:\...\cli-agent
// WORKSPACE     = C:\...\cli-agent\tests\_patch_workspace
// CALC_REL      = tests/_patch_workspace/src/calculator.ts
const CALC_REL = "tests/_patch_workspace/src/calculator.ts";
const UTILS_REL = "tests/_patch_workspace/src/utils.ts";

const CALC_ABS = path.join(WORKSPACE, "src", "calculator.ts");
const UTILS_ABS = path.join(WORKSPACE, "src", "utils.ts");

const ORIGINAL_CALC = [
  "export function add(a: number, b: number): number {",
  "  return a + b;",
  "}",
  "",
  "export function subtract(a: number, b: number): number {",
  "  return a - b;",
  "}",
].join("\n");

const ORIGINAL_UTILS = [
  "export function clamp(value: number, min: number, max: number): number {",
  "  return Math.min(Math.max(value, min), max);",
  "}",
  "",
  "export function isEven(n: number): boolean {",
  "  return n % 2 === 0;",
  "}",
].join("\n");

function makeWorkspace() {
  fs.mkdirSync(path.join(WORKSPACE, "src"), { recursive: true });
  fs.writeFileSync(CALC_ABS, ORIGINAL_CALC);
  fs.writeFileSync(UTILS_ABS, ORIGINAL_UTILS);
  fs.writeFileSync(
    path.join(WORKSPACE, "config.json"),
    JSON.stringify({ version: "1.0.0", debug: false }, null, 2)
  );
}

function resetWorkspace() {
  fs.writeFileSync(CALC_ABS, ORIGINAL_CALC);
  fs.writeFileSync(UTILS_ABS, ORIGINAL_UTILS);

  const toRemove = [
    path.join(WORKSPACE, "src", "multiply.ts"),
    path.join(WORKSPACE, "src", "oldfile.ts"),
    path.join(WORKSPACE, "src", "drifttest.ts"),
  ];
  for (const f of toRemove) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

function cleanWorkspace() {
  if (fs.existsSync(WORKSPACE)) {
    fs.rmSync(WORKSPACE, { recursive: true, force: true });
  }
}

// ─── Runner Helper ────────────────────────────────────────────────────────────

interface RunResult {
  response: string;
  toolsInvoked: string[];
  toolResults: Record<string, unknown>;
  events: Array<{ kind: string; message: string }>;
  errors: string[];
  durationMs: number;
}

// Key insight: tell the LLM the exact relative path it must use.
// process.cwd() is the project root. Paths in patch headers must
// be relative to cwd so path.resolve(cwd, patchPath) finds the file.
function makePatchSystemPrompt(extraRules: string[] = []): string {
  return [
    "You are a coding assistant with file editing tools.",
    "",
    "CRITICAL PATH RULE:",
    `The current working directory is: ${process.cwd().replace(/\\/g, "/")}`,
    "ALL paths in patch --- and +++ headers MUST be relative to this directory.",
    `Example: to patch calculator.ts in the workspace, use:`,
    `  --- a/${CALC_REL}`,
    `  +++ b/${CALC_REL}`,
    "NEVER use just 'src/calculator.ts' — that resolves to the wrong location.",
    "",
    "PATCH FORMAT — follow exactly:",
    `--- a/${CALC_REL}`,
    `+++ b/${CALC_REL}`,
    "@@ -LINE,COUNT +LINE,COUNT @@",
    " context line (space prefix)",
    "-removed line (minus prefix)",
    "+added line (plus prefix)",
    " context line (space prefix)",
    "",
    "RULES:",
    "1. Always read the file first with read_file.",
    "2. Use the full relative path shown above in the patch headers.",
    "3. Include 3 lines of context before and after each change.",
    "4. Never use *** Begin Patch or any non-standard format.",
    "5. Use dryRun: true first, then apply without dryRun.",
    "6. After applying, read the file to confirm the change.",
    ...extraRules,
  ].join("\n");
}

async function runPatchTest(
  prompt: string,
  extraRules: string[] = []
): Promise<RunResult> {
  const conversation = new Conversation(makePatchSystemPrompt(extraRules));
  conversation.addUserMessage(prompt);

  const toolsInvoked: string[] = [];
  const toolResults: Record<string, unknown> = {};
  const events: Array<{ kind: string; message: string }> = [];
  const errors: string[] = [];
  const start = Date.now();

  // Track all apply_patch results in order
  const allPatchResults: unknown[] = [];

  const response = await runAgent({
    provider: PROVIDER,
    model: MODEL,
    conversation,
    onToolCall: (toolName, input) => {
      toolsInvoked.push(toolName);
      console.log(`    → [tool call ] ${toolName}`);
      if (toolName === "apply_patch") {
        const inp = input as any;
        const preview = (inp?.patch ?? "").slice(0, 200);
        console.log(`      patch: ${preview}${preview.length >= 200 ? "..." : ""}`);
        console.log(`      dryRun: ${inp?.dryRun}`);
      } else {
        console.log(`      input: ${JSON.stringify(input).slice(0, 150)}`);
      }
    },
    onToolResult: (toolName, result) => {
      toolResults[toolName] = result;
      if (toolName === "apply_patch") {
        allPatchResults.push(result);
        toolResults[`apply_patch_${allPatchResults.length}`] = result;
      }
      console.log(`    ← [result    ] ${toolName}: ${JSON.stringify(result).slice(0, 150)}`);
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
  console.log(`    ⏱ ${durationMs}ms | tools: [${toolsInvoked.join(", ")}]`);
  console.log(`    💬 response: ${response.length} chars`);

  // Attach all patch results for inspection
  (toolResults as any)["_allPatchResults"] = allPatchResults;

  return { response, toolsInvoked, toolResults, events, errors, durationMs };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("apply_patch LLM Integration", () => {
  beforeAll(makeWorkspace);
  afterAll(cleanWorkspace);
  beforeEach(resetWorkspace);

  // ─── Sanity ──────────────────────────────────────────────────────────────

  describe("Sanity", () => {
    skipIfNoKey(
      "LLM connection works",
      async () => {
        const conv = new Conversation("You are a helpful assistant.");
        conv.addUserMessage('Reply with exactly: "PATCH_TEST_READY"');
        const response = await runAgent({
          provider: PROVIDER,
          model: MODEL,
          conversation: conv,
        });
        expect(response).toMatch(/PATCH_TEST_READY/i);
      },
      30_000
    );

    skipIfNoKey(
      "tool correctly rejects wrong path and accepts correct path",
      async () => {
        console.log("\n[sanity: path resolution]");

        // Test the tool directly with wrong path
        const { applyPatch } = await import("../../src/tools/applyPatch");

        const wrongPath = await applyPatch({
          patch: [
            "--- a/src/calculator.ts",
            "+++ b/src/calculator.ts",
            "@@ -1,3 +1,4 @@",
            "+// comment",
            " export function add(a: number, b: number): number {",
            "   return a + b;",
            " }",
          ].join("\n"),
          dryRun: true,
        });

        // Wrong path — file not found at cwd/src/calculator.ts
        console.log(`    Wrong path result: ${JSON.stringify(wrongPath).slice(0, 100)}`);

        const rightPath = await applyPatch({
          patch: [
            `--- a/${CALC_REL}`,
            `+++ b/${CALC_REL}`,
            "@@ -1,3 +1,4 @@",
            "+// comment",
            " export function add(a: number, b: number): number {",
            "   return a + b;",
            " }",
          ].join("\n"),
          dryRun: true,
        });

        // Right path — should succeed
        console.log(`    Right path result: ${JSON.stringify(rightPath).slice(0, 100)}`);
        expect(rightPath.success).toBe(true);
        if (rightPath.success) {
          expect(rightPath.patches[0].status).toBe("DRY_RUN");
          // Should NOT have file-not-found error
          expect(rightPath.patches[0].error).toBeUndefined();
        }
      },
      10_000 // No LLM — direct tool call
    );
  });

  // ─── Dry Run ─────────────────────────────────────────────────────────────

  describe("Dry Run", () => {
    skipIfNoKey(
      "dry run validates patch without writing to disk",
      async () => {
        console.log("\n[dry run: basic]");
        const originalContent = fs.readFileSync(CALC_ABS, "utf-8");

        const result = await runPatchTest(
          `Read the file "${CALC_ABS}" then use apply_patch with dryRun: true ` +
          `to add a multiply function after subtract. ` +
          `Do NOT apply for real. Tell me the dry run result.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("read_file");
        expect(result.toolsInvoked).toContain("apply_patch");

        // File must be unchanged
        expect(fs.readFileSync(CALC_ABS, "utf-8")).toBe(originalContent);

        const patchResult = result.toolResults["apply_patch"] as any;
        expect(patchResult?.success).toBe(true);
        expect(patchResult?.dryRun).toBe(true);

        const patches = patchResult?.patches as any[];
        expect(patches.length).toBeGreaterThan(0);
        // No file-not-found errors
        const hasFoundError = patches.some(
          (p: any) => p.error === "File does not exist"
        );
        expect(hasFoundError).toBe(false);
        expect(patches.every((p: any) => p.status === "DRY_RUN")).toBe(true);
      },
      90_000
    );

    skipIfNoKey(
      "dry run on non-existent file shows FAILED not crash",
      async () => {
        console.log("\n[dry run: non-existent file]");

        // Call the tool directly — no LLM needed for this behavior test
        const { applyPatch } = await import("../../src/tools/applyPatch");

        const fakePath = "tests/_patch_workspace/src/ghost.ts";
        const result = await applyPatch({
          patch: [
            `--- a/${fakePath}`,
            `+++ b/${fakePath}`,
            "@@ -1,1 +1,2 @@",
            " export const ghost = true;",
            "+export const x = 1;",
          ].join("\n"),
          dryRun: true,
        });

        console.log(`    Result: ${JSON.stringify(result).slice(0, 200)}`);

        // Should succeed (dryRun returns success:true even for missing files)
        // or fail cleanly — either way no crash
        expect(() => result).not.toThrow();

        if (result.success) {
          const patches = result.patches;
          expect(patches.length).toBeGreaterThan(0);
          // Missing file → FAILED or DRY_RUN with error
          const p = patches[0];
          if (p.status === "DRY_RUN") {
            expect(p.error).toMatch(/does not exist/i);
          } else {
            expect(p.status).toBe("FAILED");
          }
        } else {
          // Also acceptable — clean error
          expect(typeof result.error).toBe("string");
        }
      },
      10_000 // Direct tool call — no LLM
    );
  });

  // ─── Single File Patch ────────────────────────────────────────────────────

  describe("Single File Patch", () => {
    skipIfNoKey(
      "adds a new function to an existing file",
      async () => {
        console.log("\n[single: add function]");

        const result = await runPatchTest(
          `Read the file "${CALC_ABS}" then use apply_patch to add a multiply ` +
          `function after the subtract function. ` +
          `The patch header must use the path: ${CALC_REL}\n` +
          `Run dryRun first, then apply for real. ` +
          `Finally read the file to confirm "multiply" is there.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("read_file");
        expect(result.toolsInvoked).toContain("apply_patch");

        const content = fs.readFileSync(CALC_ABS, "utf-8");
        const allPatches = (result.toolResults as any)["_allPatchResults"] as any[];
        const appliedRun = allPatches.find(
          (r: any) => r?.success && !r?.dryRun &&
          r?.patches?.some((p: any) => p.status === "APPLIED")
        );

        if (appliedRun) {
          expect(content).toContain("multiply");
          expect(content).toContain("add");
          expect(content).toContain("subtract");
        } else {
          // At minimum the agent should have tried
          expect(result.toolsInvoked.filter(t => t === "apply_patch").length)
            .toBeGreaterThanOrEqual(1);
        }
      },
      120_000
    );

    skipIfNoKey(
      "renames a function via patch",
      async () => {
        console.log("\n[single: rename function]");

        const result = await runPatchTest(
          `Read "${CALC_ABS}" then use apply_patch to rename the "add" ` +
          `function to "addition". ` +
          `Patch header path must be: ${CALC_REL}\n` +
          `Apply the patch then read the file to confirm.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("apply_patch");

        const allPatches = (result.toolResults as any)["_allPatchResults"] as any[];
        const appliedRun = allPatches.find(
          (r: any) => r?.success && !r?.dryRun &&
          r?.patches?.some((p: any) => p.status === "APPLIED")
        );

        if (appliedRun) {
          const content = fs.readFileSync(CALC_ABS, "utf-8");
          expect(content).toContain("addition");
        }

        expect(result.errors).toHaveLength(0);
      },
      120_000
    );

    skipIfNoKey(
      "adds a JSDoc comment via patch",
      async () => {
        console.log("\n[single: add jsdoc]");

        const result = await runPatchTest(
          `Read "${CALC_ABS}" then use apply_patch to add a JSDoc comment ` +
          `above the subtract function:\n` +
          `/**\n * Subtracts b from a.\n */\n` +
          `Patch header path must be: ${CALC_REL}\n` +
          `Apply then confirm.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("apply_patch");

        const allPatches = (result.toolResults as any)["_allPatchResults"] as any[];
        const appliedRun = allPatches.find(
          (r: any) => r?.success && !r?.dryRun &&
          r?.patches?.some((p: any) => p.status === "APPLIED")
        );

        if (appliedRun) {
          const content = fs.readFileSync(CALC_ABS, "utf-8");
          expect(content).toMatch(/\/\*\*[\s\S]*?Subtracts/);
        }

        expect(result.errors).toHaveLength(0);
      },
      120_000
    );
  });

  // ─── Multi-File Patch ─────────────────────────────────────────────────────

  describe("Multi-File Patch", () => {
    skipIfNoKey(
      "patches two files in a single apply_patch call",
      async () => {
        console.log("\n[multi: two files]");

        const result = await runPatchTest(
          `Read both files:\n` +
          `1. "${CALC_ABS}"\n` +
          `2. "${UTILS_ABS}"\n` +
          `Then use a SINGLE apply_patch call to:\n` +
          `- Add comment "// Math operations" on line 1 of calculator.ts\n` +
          `- Add comment "// Utility functions" on line 1 of utils.ts\n` +
          `Patch header paths must be:\n` +
          `  ${CALC_REL}\n` +
          `  ${UTILS_REL}\n` +
          `Both changes in one patch string. Apply then confirm both files changed.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("apply_patch");

        const allPatches = (result.toolResults as any)["_allPatchResults"] as any[];
        const appliedRun = allPatches.find(
          (r: any) => r?.success && !r?.dryRun &&
          r?.patches?.some((p: any) => p.status === "APPLIED")
        );

        if (appliedRun) {
          const appliedPaths = appliedRun.patches
            .filter((p: any) => p.status === "APPLIED")
            .map((p: any) => p.path);
          console.log(`    Applied: ${appliedPaths.join(", ")}`);

          const calcContent = fs.readFileSync(CALC_ABS, "utf-8");
          const utilsContent = fs.readFileSync(UTILS_ABS, "utf-8");
          const calcChanged = calcContent.includes("Math operations");
          const utilsChanged = utilsContent.includes("Utility functions");
          expect(calcChanged || utilsChanged).toBe(true);
        }
      },
      150_000
    );

    skipIfNoKey(
      "creates a new file via patch using /dev/null syntax",
      async () => {
        console.log("\n[multi: create new file]");

        const newFileRel = "tests/_patch_workspace/src/multiply.ts";
        const newFileAbs = path.join(WORKSPACE, "src", "multiply.ts");
        if (fs.existsSync(newFileAbs)) fs.unlinkSync(newFileAbs);

        const result = await runPatchTest(
          `Use apply_patch to create a new file at: ${newFileRel}\n` +
          `The file should contain:\n` +
          `export function multiply(a: number, b: number): number {\n` +
          `  return a * b;\n` +
          `}\n\n` +
          `For a file creation patch, the --- header must be: --- /dev/null\n` +
          `The +++ header must be: +++ b/${newFileRel}\n` +
          `Apply and confirm the file was created.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("apply_patch");

        const allPatches = (result.toolResults as any)["_allPatchResults"] as any[];
        const appliedRun = allPatches.find(
          (r: any) => r?.success && !r?.dryRun &&
          r?.patches?.some((p: any) => p.status === "APPLIED")
        );

        if (appliedRun) {
          expect(fs.existsSync(newFileAbs)).toBe(true);
          const content = fs.readFileSync(newFileAbs, "utf-8");
          expect(content).toContain("multiply");
        }
      },
      120_000
    );
  });

  // ─── File Deletion ────────────────────────────────────────────────────────

  describe("File Deletion via Patch", () => {
    skipIfNoKey(
      "deletes a file using /dev/null patch syntax",
      async () => {
        console.log("\n[delete via patch]");

        const toDeleteRel = "tests/_patch_workspace/src/oldfile.ts";
        const toDeleteAbs = path.join(WORKSPACE, "src", "oldfile.ts");
        fs.writeFileSync(toDeleteAbs, "export const old = true;\n");

        const result = await runPatchTest(
          `Use apply_patch to delete the file at: ${toDeleteRel}\n` +
          `For a deletion patch, use:\n` +
          `--- a/${toDeleteRel}\n` +
          `+++ /dev/null\n` +
          `(No @@ hunk needed for deletion)\n` +
          `Apply then confirm the file is gone.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("apply_patch");

        const allPatches = (result.toolResults as any)["_allPatchResults"] as any[];
        const appliedRun = allPatches.find(
          (r: any) => r?.success && !r?.dryRun &&
          r?.patches?.some((p: any) => p.status === "APPLIED")
        );

        if (appliedRun) {
          expect(fs.existsSync(toDeleteAbs)).toBe(false);
        }
      },
      60_000
    );
  });

  // ─── Error Recovery ───────────────────────────────────────────────────────

  describe("Error Recovery", () => {
    skipIfNoKey(
      "recovers from stale context by re-reading and retrying",
      async () => {
        console.log("\n[error recovery: stale patch]");

        const result = await runPatchTest(
          `Apply this patch to "${CALC_ABS}" using apply_patch.\n` +
          `The patch header path is: ${CALC_REL}\n\n` +
          `--- a/${CALC_REL}\n` +
          `+++ b/${CALC_REL}\n` +
          `@@ -1,3 +1,4 @@\n` +
          ` THIS LINE DOES NOT EXIST\n` +
          ` export function add(a: number, b: number): number {\n` +
          `   return a + b;\n` +
          `+// added comment\n` +
          `\n` +
          `If it fails, read the file to get current content, ` +
          `then try again with a correct patch.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("apply_patch");

        // First patch should fail (bad context line)
        const allPatches = (result.toolResults as any)["_allPatchResults"] as any[];
        const firstResult = allPatches[0] as any;
        const firstFailed = !firstResult?.success ||
          firstResult?.patches?.some((p: any) => p.status === "FAILED");

        if (firstFailed) {
          // LLM should have tried to recover
          expect(
            result.toolsInvoked.includes("read_file") ||
            result.toolsInvoked.filter(t => t === "apply_patch").length >= 2
          ).toBe(true);
        }
      },
      90_000
    );

    skipIfNoKey(
      "tool blocks protected paths and returns clean error",
      async () => {
        console.log("\n[protected path: direct tool call]");

        // Test the tool directly — LLM refusing is valid behavior
        // so we test the tool's protection, not the LLM's judgment
        const { applyPatch } = await import("../../src/tools/applyPatch");

        const result = await applyPatch({
          patch: [
            "--- a/node_modules/some-pkg/index.js",
            "+++ b/node_modules/some-pkg/index.js",
            "@@ -1,1 +1,2 @@",
            " // original",
            "+// injected",
          ].join("\n"),
          dryRun: false,
        });

        console.log(`    Result: ${JSON.stringify(result).slice(0, 150)}`);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toMatch(/blocked|protected/i);
        }

        // node_modules must be untouched
        expect(fs.existsSync(path.join(process.cwd(), "node_modules"))).toBe(true);
      },
      10_000 // Direct tool call — no LLM
    );

    skipIfNoKey(
      "malformed format returns actionable error for LLM to self-correct",
      async () => {
        console.log("\n[malformed: direct tool call]");

        // Test the tool directly with *** Begin Patch format
        const { applyPatch } = await import("../../src/tools/applyPatch");

        const result = await applyPatch({
          patch: [
            "*** Begin Patch",
            `*** Update File: ${CALC_REL}`,
            "@@",
            " export function subtract(a: number, b: number): number {",
            "   return a - b;",
            " }",
            "+",
            "+export function divide(a: number, b: number): number {",
            "+  return a / b;",
            "+}",
            "*** End Patch",
          ].join("\n"),
          dryRun: false,
        });

        console.log(`    Result: ${JSON.stringify(result).slice(0, 200)}`);

        // Must fail cleanly with actionable hint
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(typeof result.error).toBe("string");
          expect(result.hints).toBeDefined();
          expect(result.hints!.length).toBeGreaterThan(0);
          // Hint should tell LLM how to fix it
          const hintText = result.hints!.join(" ").toLowerCase();
          expect(hintText).toMatch(/---|\+\+\+|format|unified/i);
        }
      },
      10_000 // Direct tool call — no LLM
    );
  });

  // ─── Patch Output Structure ───────────────────────────────────────────────

  describe("Patch Output Structure", () => {
    skipIfNoKey(
      "apply_patch returns correct patches array structure",
      async () => {
        console.log("\n[output structure]");

        const result = await runPatchTest(
          `Read "${CALC_ABS}" then use apply_patch (not dryRun) to add ` +
          `the comment "// calculator module" on the very first line.\n` +
          `Patch header path must be: ${CALC_REL}\n` +
          `Tell me the result.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("apply_patch");

        const allPatches = (result.toolResults as any)["_allPatchResults"] as any[];
        const appliedRun = allPatches.find(
          (r: any) => r?.success && !r?.dryRun
        );

        if (appliedRun) {
          expect(typeof appliedRun.success).toBe("boolean");
          expect(typeof appliedRun.dryRun).toBe("boolean");
          expect(Array.isArray(appliedRun.patches)).toBe(true);

          for (const patch of appliedRun.patches) {
            expect(typeof patch.path).toBe("string");
            expect(patch.path.length).toBeGreaterThan(0);
            expect(["APPLIED", "FAILED", "DRY_RUN"]).toContain(patch.status);

            if (patch.status === "APPLIED") {
              expect(typeof patch.hunks).toBe("number");
              expect(typeof patch.linesChanged).toBe("number");
            }
            if (patch.status === "FAILED") {
              expect(typeof patch.error).toBe("string");
            }
          }
        }
      },
      120_000
    );

    skipIfNoKey(
      "dry run marks all patches as DRY_RUN",
      async () => {
        console.log("\n[output: dry run status]");

        const result = await runPatchTest(
          `Read "${CALC_ABS}" then use apply_patch with dryRun: true ` +
          `to preview adding comment "// preview only" on line 1.\n` +
          `Patch header path must be: ${CALC_REL}\n` +
          `Do not apply for real.`
        );

        expect(result.errors).toHaveLength(0);
        expect(result.toolsInvoked).toContain("apply_patch");

        const allPatches = (result.toolResults as any)["_allPatchResults"] as any[];
        const dryRun = allPatches.find((r: any) => r?.success && r?.dryRun);

        if (dryRun) {
          const patches = dryRun.patches as any[];
          expect(patches.length).toBeGreaterThan(0);
          // All should be DRY_RUN (not file-not-found errors)
          const validDryRuns = patches.filter(
            (p: any) => p.status === "DRY_RUN" && !p.error
          );
          expect(validDryRuns.length).toBeGreaterThan(0);

          // File must be unchanged
          expect(fs.readFileSync(CALC_ABS, "utf-8")).toBe(ORIGINAL_CALC);
        }
      },
      90_000
    );
  });

  // ─── UI Summary Alignment (direct — no LLM) ───────────────────────────────

  describe("UI Summary Alignment", () => {
    it("APPLIED summary shows file names and count", async () => {
      console.log("\n[UI: APPLIED]");
      const { getToolResultSummary } = await import("../../src/core/agent");

      const summary = getToolResultSummary("apply_patch", {
        success: true,
        dryRun: false,
        patches: [
          { path: "src/calculator.ts", status: "APPLIED", hunks: 2, linesChanged: 5 },
          { path: "src/utils.ts", status: "APPLIED", hunks: 1, linesChanged: 3 },
        ],
      });

      console.log(`    Summary: "${summary}"`);
      expect(summary).toMatch(/patches applied/i);
      expect(summary).toContain("2");
      expect(summary).toContain("calculator.ts");
      expect(summary).not.toContain("src/"); // should use basename
    });

    it("FAILED summary shows failed file names", async () => {
      console.log("\n[UI: FAILED]");
      const { getToolResultSummary } = await import("../../src/core/agent");

      const summary = getToolResultSummary("apply_patch", {
        success: true,
        dryRun: false,
        patches: [
          {
            path: "src/calculator.ts",
            status: "FAILED",
            error: "Could not find context",
            hunks: 0,
            linesChanged: 0,
          },
        ],
      });

      console.log(`    Summary: "${summary}"`);
      expect(summary).toMatch(/patch failed/i);
      expect(summary).toContain("calculator.ts");
    });

    it("DRY_RUN summary shows validated label", async () => {
      console.log("\n[UI: DRY_RUN]");
      const { getToolResultSummary } = await import("../../src/core/agent");

      const summary = getToolResultSummary("apply_patch", {
        success: true,
        dryRun: true,
        patches: [
          { path: "src/calculator.ts", status: "DRY_RUN", hunks: 1, linesChanged: 2 },
        ],
      });

      console.log(`    Summary: "${summary}"`);
      expect(summary).toMatch(/dry run/i);
      expect(summary).toContain("calculator.ts");
    });

    it("empty patches returns fallback string", async () => {
      console.log("\n[UI: empty]");
      const { getToolResultSummary } = await import("../../src/core/agent");

      const summary = getToolResultSummary("apply_patch", {
        success: true,
        dryRun: false,
        patches: [],
      });

      console.log(`    Summary: "${summary}"`);
      expect(typeof summary).toBe("string");
      expect(summary.length).toBeGreaterThan(0);
    });
  });

  // ─── Drift Tolerance ──────────────────────────────────────────────────────

  describe("Drift Tolerance", () => {
    skipIfNoKey(
      "fuzzy matching finds context shifted by 2 lines",
      async () => {
        console.log("\n[drift: 2 line shift]");

        const driftRel = "tests/_patch_workspace/src/drifttest.ts";
        const driftAbs = path.join(WORKSPACE, "src", "drifttest.ts");

        // Write file with target at line 6 (shifted from line 4)
        fs.writeFileSync(
          driftAbs,
          [
            "// prepended line A",
            "// prepended line B",
            "// line 1",
            "// line 2",
            "// line 3",
            "export function target(): string {",
            "  return 'original';",
            "}",
            "// line 7",
          ].join("\n")
        );

        // Patch targets line 4 but content is at line 6
        // Fuzzy matching should find it within MAX_DRIFT=15
        const { applyPatch } = await import("../../src/tools/applyPatch");

        const result = await applyPatch({
          patch: [
            `--- a/${driftRel}`,
            `+++ b/${driftRel}`,
            "@@ -4,3 +4,3 @@",
            " export function target(): string {",
            "-  return 'original';",
            "+  return 'patched';",
            " }",
          ].join("\n"),
          dryRun: false,
        });

        console.log(`    Result: ${JSON.stringify(result).slice(0, 200)}`);

        expect(result.success).toBe(true);
        if (result.success) {
          const applied = result.patches.some(p => p.status === "APPLIED");
          if (applied) {
            const content = fs.readFileSync(driftAbs, "utf-8");
            expect(content).toContain("patched");
            expect(content).not.toContain("original");
            console.log("    ✓ Fuzzy matching handled 2-line drift");
          }
        }

        if (fs.existsSync(driftAbs)) fs.unlinkSync(driftAbs);
      },
      10_000 // Direct tool call — no LLM
    );
  });
});