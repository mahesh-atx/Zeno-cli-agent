// src/errors/test-tools.test.ts
// Run with: npx tsx src/errors/test-tools.test.ts

import { catchToolError } from "./toolErrors";

console.log("\n━━━ catchToolError tests ━━━\n");

// ── Test 1: ENOENT (file not found) ──
const enoent = Object.assign(new Error("no such file"), {
  code: "ENOENT",
  path: "/tmp/missing.txt",
});
const r1 = catchToolError("read_file", enoent);
console.log("Test 1 — ENOENT:");
console.log("  success:", r1.success);       // false
console.log("  error:", r1.error);           // File or directory not found (ENOENT): /tmp/missing.txt
console.log("  toolName:", r1.toolName);     // read_file

// ── Test 2: EACCES (permission denied) ──
const eacces = Object.assign(new Error("permission denied"), {
  code: "EACCES",
  path: "/etc/shadow",
});
const r2 = catchToolError("write_file", eacces);
console.log("\nTest 2 — EACCES:");
console.log("  success:", r2.success);       // false
console.log("  error:", r2.error);           // Permission denied (EACCES): /etc/shadow

// ── Test 3: Generic Error ──
const generic = new Error("something exploded");
const r3 = catchToolError("run_command", generic);
console.log("\nTest 3 — generic Error:");
console.log("  success:", r3.success);       // false
console.log("  error:", r3.error);           // something exploded

// ── Test 4: Non-Error thrown (string) ──
const r4 = catchToolError("list_files", "raw string throw");
console.log("\nTest 4 — string thrown:");
console.log("  success:", r4.success);       // false
console.log("  error:", r4.error);           // Unexpected error in tool "list_files": raw string throw

// ── Test 5: Verify result shape feeds back to LLM correctly ──
// The agent puts this in messages — must be JSON serialisable
console.log("\nTest 5 — JSON serialisable for LLM feed:");
const json = JSON.stringify(r1, null, 2);
console.log(json);                           // clean JSON, no circular refs

console.log("\n✓ All tool error tests complete\n");
