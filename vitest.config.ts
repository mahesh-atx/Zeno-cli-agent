import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // We define a 30s timeout here globally because our live agent tests hit the real LLM APIs
    testTimeout: 30000,
    include: ["tests/**/*.test.{ts,tsx}"],
    clearMocks: true,
    passWithNoTests: true,
    fileParallelism: false,
  },
});
