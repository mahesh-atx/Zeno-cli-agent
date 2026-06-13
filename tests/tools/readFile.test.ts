// src/tools/readFile.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { readFile } from "../../src/tools/readFile";

// ━━━ Helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "readFile-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeTmp(name: string, content: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, "utf-8");
  return path.relative(process.cwd(), p);
}

// ━━━ readFile ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("readFile tool", () => {
  it("reads an entire file successfully", async () => {
    const rel = writeTmp("full.txt", "line1\nline2\nline3");
    const result = await readFile({ path: rel });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toBe("line1\nline2\nline3");
      expect(result.lines).toBe(3);
      expect(result.size).toBeGreaterThan(0);
      expect(result.path).toBe(rel);
    }
  });

  it("reads partial file with startLine", async () => {
    const rel = writeTmp("partial1.txt", "line1\nline2\nline3\nline4");
    const result = await readFile({ path: rel, startLine: 3 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toBe("line3\nline4");
      expect(result.lines).toBe(4); // total lines of original file
    }
  });

  it("reads partial file with endLine", async () => {
    const rel = writeTmp("partial2.txt", "line1\nline2\nline3\nline4");
    const result = await readFile({ path: rel, endLine: 2 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toBe("line1\nline2");
    }
  });

  it("reads partial file with both startLine and endLine", async () => {
    const rel = writeTmp("partial3.txt", "line1\nline2\nline3\nline4");
    const result = await readFile({ path: rel, startLine: 2, endLine: 3 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toBe("line2\nline3");
    }
  });

  it("returns error for missing file (ENOENT)", async () => {
    const p = path.join(tmpDir, "missing.txt");
    const result = await readFile({ path: p });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("File not found");
      expect(result.path).toBe(p);
    }
  });

  it("returns error when path is a directory", async () => {
    const dir = path.join(tmpDir, "some-dir");
    fs.mkdirSync(dir);
    const rel = path.relative(process.cwd(), dir);
    const result = await readFile({ path: rel });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("directory, not a file");
    }
  });
});
