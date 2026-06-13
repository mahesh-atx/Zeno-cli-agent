// src/tools/writeFile.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { writeFile } from "../../src/tools/writeFile";
import { askPermission } from "../../src/core/permissions";

// Mock the permissions module
vi.mock("../../src/core/permissions", () => ({
  askPermission: vi.fn(),
}));

// ━━━ Helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "writeFile-test-"));
  vi.resetAllMocks();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ━━━ writeFile ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("writeFile tool", () => {
  it("writes to a new file successfully", async () => {
    vi.mocked(askPermission).mockResolvedValue(true);
    
    const p = path.join(tmpDir, "new.txt");
    const rel = path.relative(process.cwd(), p);
    const content = "hello world\nnew file";

    const result = await writeFile({ path: rel, content });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.isNew).toBe(true);
      expect(result.path).toBe(rel);
      expect(result.bytesWritten).toBeGreaterThan(0);
    }

    const written = fs.readFileSync(p, "utf-8");
    expect(written).toBe(content);
    
    // Ensure askPermission was called with CREATE FILE action
    expect(askPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "write_file",
        title: expect.stringContaining("CREATE FILE"),
      })
    );
  });

  it("overwrites an existing file successfully", async () => {
    vi.mocked(askPermission).mockResolvedValue(true);
    
    const p = path.join(tmpDir, "existing.txt");
    fs.writeFileSync(p, "old content", "utf-8");
    
    const rel = path.relative(process.cwd(), p);
    const content = "new content";

    const result = await writeFile({ path: rel, content });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.isNew).toBe(false);
    }

    const written = fs.readFileSync(p, "utf-8");
    expect(written).toBe(content);
    
    // Ensure askPermission was called with OVERWRITE FILE action
    expect(askPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("OVERWRITE FILE"),
      })
    );
  });

  it("fails if permission is denied", async () => {
    vi.mocked(askPermission).mockResolvedValue(false);
    
    const p = path.join(tmpDir, "denied.txt");
    const result = await writeFile({ path: p, content: "denied" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("User denied file write");
    }
    
    expect(fs.existsSync(p)).toBe(false);
  });

  it("creates parent directories if they don't exist", async () => {
    vi.mocked(askPermission).mockResolvedValue(true);
    
    const p = path.join(tmpDir, "deep", "nested", "dir", "file.txt");
    const result = await writeFile({ path: p, content: "deep" });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(p, "utf-8")).toBe("deep");
  });
});
