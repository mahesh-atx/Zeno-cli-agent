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
  it("lists files and directories non-recursively", async () => {
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "");
    fs.mkdirSync(path.join(tmpDir, "b-dir"));
    fs.writeFileSync(path.join(tmpDir, "b-dir", "nested.txt"), "");

    const rel = path.relative(process.cwd(), tmpDir);
    const result = await listFiles({ path: rel, recursive: false });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.files).toContain("a.txt");
      expect(result.files).not.toContain(path.join("b-dir", "nested.txt"));
      expect(result.directories).toContain("b-dir");
    }
  });

  it("lists files recursively", async () => {
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "");
    fs.mkdirSync(path.join(tmpDir, "b-dir"));
    fs.writeFileSync(path.join(tmpDir, "b-dir", "nested.txt"), "");

    const rel = path.relative(process.cwd(), tmpDir);
    const result = await listFiles({ path: rel, recursive: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.files).toContain("a.txt");
      // Use standard path join for cross-platform comparison
      expect(result.files).toContain(path.join("b-dir", "nested.txt"));
      expect(result.directories).toContain("b-dir");
    }
  });

  it("ignores specified directories like node_modules", async () => {
    fs.mkdirSync(path.join(tmpDir, "node_modules"));
    fs.writeFileSync(path.join(tmpDir, "node_modules", "ignored.txt"), "");
    fs.mkdirSync(path.join(tmpDir, ".git"));
    fs.writeFileSync(path.join(tmpDir, ".git", "config"), "");
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "");

    const rel = path.relative(process.cwd(), tmpDir);
    const result = await listFiles({ path: rel, recursive: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.files).toContain("a.txt");
      expect(result.directories).not.toContain("node_modules");
      expect(result.directories).not.toContain(".git");
      expect(result.files).not.toContain(path.join("node_modules", "ignored.txt"));
    }
  });

  it("returns error if path is not a directory", async () => {
    const file = path.join(tmpDir, "file.txt");
    fs.writeFileSync(file, "");
    
    const rel = path.relative(process.cwd(), file);
    const result = await listFiles({ path: rel, recursive: false });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Path is not a directory");
    }
  });

  it("returns error if directory does not exist", async () => {
    const p = path.join(tmpDir, "nonexistent");
    const rel = path.relative(process.cwd(), p);
    const result = await listFiles({ path: rel, recursive: false });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Directory not found");
    }
  });
});
