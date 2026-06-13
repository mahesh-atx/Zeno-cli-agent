// src/tools/listFiles.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { listFiles } from "../../src/tools/listFiles";

// ━━━ Helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "listFiles-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ━━━ listFiles ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("listFiles tool", () => {
  it("lists files and directories with correct formatting", async () => {
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "hello");
    fs.mkdirSync(path.join(tmpDir, "b-dir"));
    fs.writeFileSync(path.join(tmpDir, "b-dir", "nested.txt"), "");

    const rel = path.relative(process.cwd(), tmpDir);
    const result = await listFiles({ path: rel });

    expect(result.success).toBe(true);
    if (result.success) {
      // Directories should come first, then files
      expect(result.entries.length).toBeGreaterThanOrEqual(2);
      expect(result.entries.some(e => e.includes("[DIR]  b-dir/"))).toBe(true);
      expect(result.entries.some(e => e.includes("[FILE] a.txt"))).toBe(true);
      // Nested files should not be listed (non-recursive by design now)
      expect(result.entries.some(e => e.includes("nested.txt"))).toBe(false);
    }
  });

  it("ignores specified directories like node_modules", async () => {
    fs.mkdirSync(path.join(tmpDir, "node_modules"));
    fs.writeFileSync(path.join(tmpDir, "node_modules", "ignored.txt"), "");
    fs.mkdirSync(path.join(tmpDir, ".git"));
    fs.writeFileSync(path.join(tmpDir, ".git", "config"), "");
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "");

    const rel = path.relative(process.cwd(), tmpDir);
    const result = await listFiles({ path: rel });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.entries.some(e => e.includes("[FILE] a.txt"))).toBe(true);
      expect(result.entries.some(e => e.includes("node_modules"))).toBe(false);
      expect(result.entries.some(e => e.includes(".git"))).toBe(false);
    }
  });

  it("returns soft error (success: true) with hints if path is not a directory", async () => {
    const file = path.join(tmpDir, "file.txt");
    fs.writeFileSync(file, "");
    
    const rel = path.relative(process.cwd(), file);
    const result = await listFiles({ path: rel });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.entries.length).toBe(0);
      expect(result.hints?.[0]).toContain("is a file, not a directory");
    }
  });

  it("returns soft error (success: true) with hints if directory does not exist", async () => {
    const p = path.join(tmpDir, "nonexistent");
    const rel = path.relative(process.cwd(), p);
    const result = await listFiles({ path: rel });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.entries.length).toBe(0);
      expect(result.hints?.[0]).toContain("does not exist");
    }
  });
});
