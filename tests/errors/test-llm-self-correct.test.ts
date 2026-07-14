import { describe, it, expect } from "vitest";
import { runAgent } from "../../src/core/agent";
import { Conversation } from "../../src/core/conversation";
import { config } from "../../src/core/config";

const hasRealKey = !!(process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENCODEZEN_API_KEY);

describe("LLM Self-Correction Live Test", () => {
  it.skipIf(!hasRealKey)("forces an error and correctly recovers", async () => {
    const conversation = new Conversation();
    
    conversation.addUserMessage(
      "Please read the file '/path/to/absolute/garbage/that/does/not/exist.txt'. " +
      "I expect this to fail. When it fails with an error, please read the 'package.json' file instead " +
      "and tell me its 'name' field."
    );

    let toolErrorCount = 0;
    let toolSuccessCount = 0;

    const result = await runAgent({
      provider: config.defaultProvider,
      model: config.defaultModel,
      conversation,
      onToolResult: (name, result: any) => {
        if (result && typeof result === 'object' && result.success === false) {
          toolErrorCount++;
        } else {
          toolSuccessCount++;
        }
      },
      onPermissionRequest: async () => true,
    });

    expect(toolErrorCount).toBeGreaterThan(0);
    expect(toolSuccessCount).toBeGreaterThan(0);
    expect(result).toContain("cli-agent");
  }, 30000);
});
