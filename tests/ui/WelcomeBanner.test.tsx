import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { WelcomeBanner } from "../../src/ui/WelcomeBanner";

describe("WelcomeBanner", () => {
  it("renders the Zeno CLI header", () => {
    const { lastFrame } = render(
      <WelcomeBanner provider="groq" model="test-model" />
    );

    const output = lastFrame() ?? "";
    expect(output).toContain("███████ ███████ ███   ██  █████");
    expect(output).toContain("██████ ███████ ██");
    expect(output).toContain("Tips for getting started:");
  });
});
