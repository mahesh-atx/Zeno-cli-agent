import React from "react";
import { render } from "ink";
import { App } from "./ui/App";

const [major] = process.versions.node.split(".").map(Number);
if (major < 18) {
  console.error(
    `✗ Node.js 18 or higher is required. You are running Node.js ${process.versions.node}`
  );
  process.exit(1);
}

// IMPORTANT: do NOT pass { stdout: ..., patchConsole: false } or fullscreen options.
// Default render() flows in the terminal like normal output and supports scrolling.
const { waitUntilExit } = render(React.createElement(App), {
  exitOnCtrlC: true,
  // patchConsole defaults to true — fine.
});

waitUntilExit().then(() => process.exit(0));