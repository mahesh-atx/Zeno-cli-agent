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

// Push the cursor down a bit so Ink doesn't render at the very top
// when the terminal is empty. This gives the app room to grow downward.
process.stdout.write("\n");

const instance = render(React.createElement(App), {
  exitOnCtrlC: true,
  patchConsole: false,
});

instance.waitUntilExit().then(() => process.exit(0));