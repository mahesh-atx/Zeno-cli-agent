// src/tools/editFile.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { editFile } from "../../src/tools/editFile";
import { askPermission } from "../../src/core/permissions";

vi.mock("../../src/core/permissions", () => ({
  askPermission: vi.fn(),
}));

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "editFile-test-"));
  vi.resetAllMocks();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeTmp(name: string, content: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, "utf-8");
  return path.relative(process.cwd(), p);
}

describe("editFile tool", () => {
  it("edits a file successfully if permitted", async () => {
    vi.mocked(askPermission).mockResolvedValue(true);
    
    const rel = writeTmp("edit.txt", "line1\nsearch_this\nline3");
    
    const result = await editFile({
      path: rel,
      searchString: "search_this",
      replaceString: "replace_this",
    });

    expect(result.success).toBe(true);
    
    const content = fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
    expect(content).toBe("line1\nreplace_this\nline3");
  });

  it("fails if permission is denied", async () => {
    vi.mocked(askPermission).mockResolvedValue(false);
    
    const rel = writeTmp("denied.txt", "find_me");
    
    const result = await editFile({
      path: rel,
      searchString: "find_me",
      replaceString: "new_text",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("User denied file edit");
    }

    const content = fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
    expect(content).toBe("find_me");
  });

  it("fails if searchString not found", async () => {
    const rel = writeTmp("missing.txt", "content");
    
    const result = await editFile({
      path: rel,
      searchString: "non_existent",
      replaceString: "new_text",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Search string not found");
    }
  });

  it("returns error for non-existent file", async () => {
    const p = path.join(tmpDir, "ghost.txt");
    const rel = path.relative(process.cwd(), p);
    
    const result = await editFile({
      path: rel,
      searchString: "foo",
      replaceString: "bar",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("File not found");
    }
  });
});
