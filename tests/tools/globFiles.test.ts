import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { globFiles, GlobFilesSchema } from "../../src/tools/globFiles";

let TMP: string;

function setup() {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), "globFiles-test-"));
  fs.mkdirSync(path.join(TMP, "src"), { recursive: true });
  fs.mkdirSync(path.join(TMP, "tests"), { recursive: true });
  fs.writeFileSync(path.join(TMP, "src", "index.ts"), "");
  fs.writeFileSync(path.join(TMP, "src", "utils.ts"), "");
  fs.writeFileSync(path.join(TMP, "tests", "index.test.ts"), "");
  fs.writeFileSync(path.join(TMP, "README.md"), "");
}

function teardown() {
  if (TMP && fs.existsSync(TMP)) {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
}

describe("GlobFilesSchema", () => {
  it("accepts a pattern", () => {
    const r = GlobFilesSchema.safeParse({ pattern: "**/*.ts" });
    expect(r.success).toBe(true);
  });

  it("accepts optional directory", () => {
    const r = GlobFilesSchema.safeParse({ pattern: "**/*.ts", directory: "src" });
    expect(r.success).toBe(true);
  });

  it("rejects missing pattern", () => {
    const r = GlobFilesSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("globFiles", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("finds all ts files", async () => {
    const result = await globFiles({ pattern: "**/*.ts", directory: TMP });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.total).toBe(3);
    }
  });

  it("finds only test files", async () => {
    const result = await globFiles({
      pattern: "**/*.test.ts",
      directory: TMP,
    });
    if (result.success) {
      expect(result.total).toBe(1);
    }
  });

  it("finds markdown files", async () => {
    const result = await globFiles({ pattern: "**/*.md", directory: TMP });
    if (result.success) {
      expect(result.total).toBe(1);
    }
  });

  it("returns zero for no match", async () => {
    const result = await globFiles({ pattern: "**/*.xyz", directory: TMP });
    if (result.success) {
      expect(result.total).toBe(0);
    }
  });

  it("returns file paths as strings", async () => {
    const result = await globFiles({ pattern: "**/*.ts", directory: TMP });
    if (result.success && result.files) {
      expect(result.files.every((f: any) => typeof f === "string")).toBe(true);
    }
  });

  it("returns truncated flag", async () => {
    const result = await globFiles({ pattern: "**/*.ts", directory: TMP });
    if (result.success) {
      expect(typeof result.truncated).toBe("boolean");
    }
  });
});