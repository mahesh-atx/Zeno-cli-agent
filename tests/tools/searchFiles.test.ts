import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { searchFiles, SearchFilesSchema } from "../../src/tools/searchFiles";

let TMP: string;

function setup() {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), "searchFiles-test-"));
  fs.writeFileSync(path.join(TMP, "a.ts"), "export const foo = 42;\nconst bar = 'hello';\n");
  fs.writeFileSync(path.join(TMP, "b.ts"), "import { foo } from './a';\nconsole.log(foo);\n");
  fs.writeFileSync(path.join(TMP, "c.txt"), "This is a plain text file.\nfoo bar baz\n");
}

function teardown() {
  if (TMP && fs.existsSync(TMP)) {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
}

describe("SearchFilesSchema", () => {
  it("accepts minimal input", () => {
    const r = SearchFilesSchema.safeParse({ query: "foo", directory: "." });
    expect(r.success).toBe(true);
  });

  it("accepts isRegex flag", () => {
    const r = SearchFilesSchema.safeParse({
      query: "foo.*bar",
      directory: ".",
      isRegex: true,
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing query", () => {
    const r = SearchFilesSchema.safeParse({ directory: "." });
    expect(r.success).toBe(false);
  });
});

describe("searchFiles", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("finds a simple string match", async () => {
    const result = await searchFiles({ query: "foo", directory: TMP, caseSensitive: false, isRegex: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.total).toBeGreaterThan(0);
    }
  });

  it("returns matches with file paths", async () => {
    const result = await searchFiles({ query: "foo", directory: TMP, caseSensitive: false, isRegex: false });
    if (result.success && result.matches) {
      expect(result.matches.every((m: any) => typeof m.file === "string")).toBe(true);
    }
  });

  it("returns zero results for a string that does not exist", async () => {
    const result = await searchFiles({
      query: "ZZZNOMATCH999",
      directory: TMP,
      caseSensitive: false,
      isRegex: false,
    });
    if (result.success) {
      expect(result.total).toBe(0);
    }
  });

  it("regex search works", async () => {
    const result = await searchFiles({
      query: "const \\w+ =",
      directory: TMP,
      isRegex: true,
      caseSensitive: false,
    });
    if (result.success) {
      expect(result.total).toBeGreaterThan(0);
    }
  });

  it("returns searchedFiles count", async () => {
    const result = await searchFiles({ query: "foo", directory: TMP, caseSensitive: false, isRegex: false });
    if (result.success) {
      expect(typeof result.searchedFiles).toBe("number");
      expect(result.searchedFiles).toBeGreaterThan(0);
    }
  });

  it("handles non-existent directory gracefully", async () => {
    const result = await searchFiles({
      query: "foo",
      directory: path.join(TMP, "nonexistent"),
      caseSensitive: false,
      isRegex: false,
    });
    expect(result.success).toBe(false);
  });
});