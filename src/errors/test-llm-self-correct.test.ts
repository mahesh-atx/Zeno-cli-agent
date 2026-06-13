// src/errors/test-llm-self-correct.test.ts
// Run with: npx tsx src/errors/test-llm-self-correct.test.ts

import { runAgent } from "../core/agent";
import { Conversation } from "../core/conversation";
import { config } from "../core/config";

async function main() {
  console.log("\n━━━ LLM Self-Correction Live Test ━━━\n");
  
  const conversation = new Conversation();
  
  // A prompt specifically designed to force an error and require a recovery
  conversation.addUserMessage(
    "Please read the file '/path/to/absolute/garbage/that/does/not/exist.txt'. " +
    "I expect this to fail. When it fails with an error, please read the 'package.json' file instead " +
    "and tell me its 'name' field."
  );

  let toolErrorCount = 0;
  let toolSuccessCount = 0;

  console.log(`Running agent using ${config.defaultProvider} / ${config.defaultModel} (this hits the real API)...\n`);
  console.log("Agent response:\n");

  const result = await runAgent({
    provider: config.defaultProvider,
    model: config.defaultModel,
    conversation,
    onToken: (t) => process.stdout.write(t),
    onToolCall: (name, input) => {
      console.log(`\n\n[Agent calling tool: ${name}]`, input);
    },
    onToolResult: (name, result: any) => {
      if (result && typeof result === 'object' && result.success === false) {
        console.log(`\n[Tool failed (Expected!)]:`, result.error);
        toolErrorCount++;
      } else {
        console.log(`\n[Tool succeeded]`);
        toolSuccessCount++;
      }
    },
    onPermissionRequest: async () => true, // auto-approve everything for the test
  });

  console.log("\n\n━━━ Test Results ━━━");
  console.log("Errors caught by agent: ", toolErrorCount);
  console.log("Successful tools run:   ", toolSuccessCount);
  
  if (toolErrorCount > 0 && toolSuccessCount > 0 && result.includes("cli-agent")) {
    console.log("\n✓ SUCCESS: The LLM encountered an error, self-corrected, and successfully completed the task.\n");
  } else {
    console.log("\n✗ FAILED: The LLM did not perform the expected error-and-recovery flow.\n");
  }
}

main().catch(console.error);
