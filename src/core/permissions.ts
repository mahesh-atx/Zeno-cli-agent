import * as readline from "readline";
import chalk from "chalk";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionType = "write_file" | "edit_file" | "run_command";

export interface PermissionRequest {
  action: ActionType;
  title: string;
  details: string[];
}

// ─── Check Auto-Approve Flags ─────────────────────────────────────────────────

function isAutoApproved(): boolean {
  // --yes or -y flag
  const args = process.argv.slice(2);
  if (args.includes("--yes") || args.includes("-y")) return true;

  // YES_TO_ALL env var
  if (process.env.YES_TO_ALL === "true" || process.env.YES_TO_ALL === "1") {
    return true;
  }

  return false;
}

// ─── Format Details ───────────────────────────────────────────────────────────

function formatDetails(details: string[]): string {
  return details
    .map((line) => {
      if (line.startsWith("+")) {
        return chalk.green(line);
      }
      if (line.startsWith("-")) {
        return chalk.red(line);
      }
      return chalk.dim(line);
    })
    .join("\n");
}

// ─── Draw Box ─────────────────────────────────────────────────────────────────

function drawPermissionBox(request: PermissionRequest): void {
  const width = 50;
  const border = "─".repeat(width);

  console.log("");
  console.log(chalk.yellow(`┌${border}┐`));

  // Title row
  const isDestructive =
    request.action === "write_file" || request.action === "edit_file";
  const actionLabel = isDestructive
    ? chalk.yellow.bold(request.title)
    : chalk.cyan.bold(request.title);

  const titlePadded = request.title.padEnd(width - 2);
  console.log(chalk.yellow("│ ") + actionLabel + chalk.yellow(" │".padStart(width - request.title.length)));

  console.log(chalk.yellow(`├${border}┤`));

  // Details
  if (request.details.length > 0) {
    request.details.forEach((line) => {
      let formatted = line;
      if (line.startsWith("+")) {
        formatted = chalk.green(line);
      } else if (line.startsWith("-")) {
        formatted = chalk.red(line);
      } else {
        formatted = chalk.dim(line);
      }

      // Truncate long lines to fit box
      const plain = line.length > width - 4 ? line.slice(0, width - 7) + "..." : line;
      const display = line.startsWith("+")
        ? chalk.green(plain)
        : line.startsWith("-")
        ? chalk.red(plain)
        : chalk.dim(plain);

      console.log(chalk.yellow("│  ") + display);
    });
    console.log(chalk.yellow(`├${border}┤`));
  }

  // Prompt row
  console.log(
    chalk.yellow("│  ") +
    chalk.white("Allow? ") +
    chalk.green("[y]") +
    chalk.white(" / ") +
    chalk.red("[n]") +
    chalk.white("  ")
  );
  console.log(chalk.yellow(`└${border}┘`));
}

// ─── Ask Permission ───────────────────────────────────────────────────────────

export async function askPermission(
  request: PermissionRequest
): Promise<boolean> {
  // Skip prompt if auto-approve is set
  if (isAutoApproved()) {
    console.log(
      chalk.dim(`  [auto-approved] ${request.title}`)
    );
    return true;
  }

  drawPermissionBox(request);

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    process.stdout.write("  ");

    // Listen for single keypress
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.resume();

    const onKeypress = (key: Buffer) => {
      const char = key.toString().toLowerCase();

      if (char === "y") {
        process.stdout.write(chalk.green("y\n"));
        cleanup();
        resolve(true);
      } else if (char === "n" || char === "\u0003") {
        // n or Ctrl+C
        process.stdout.write(chalk.red("n\n"));
        cleanup();
        if (char === "\u0003") {
          resolve(false);
        } else {
          resolve(false);
        }
      }
      // Ignore other keys
    };

    function cleanup() {
      process.stdin.removeListener("data", onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      rl.close();
    }

    process.stdin.on("data", onKeypress);
  });
}
