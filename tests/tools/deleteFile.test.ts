import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { deleteFile, DeleteFileSchema } from "../../src/tools/deleteFile";

let TMP: string;

function setup() {
    TMP = fs.mkdtempSync(path.join(os.tmpdir(), "deleteFile-test-"));
}

function teardown() {
    if (TMP && fs.existsSync(TMP)) {
        fs.rmSync(TMP, { recursive: true, force: true });
    }
}

describe("DeleteFileSchema", () => {
    it("accepts a path", () => {
        const r = DeleteFileSchema.safeParse({ path: "foo.ts" });
        expect(r.success).toBe(true);
    });

    it("accepts recursive flag", () => {
        const r = DeleteFileSchema.safeParse({ path: "src/", recursive: true });
        expect(r.success).toBe(true);
    });

    it("accepts dryRun flag", () => {
        const r = DeleteFileSchema.safeParse({ path: "foo.ts", dryRun: true });
        expect(r.success).toBe(true);
    });

    it("rejects missing path", () => {
        const r = DeleteFileSchema.safeParse({});
        expect(r.success).toBe(false);
    });
});

describe("deleteFile", () => {
    beforeEach(setup);
    afterEach(teardown);

    it("deletes a file that exists", async () => {
        const filePath = path.join(TMP, "to_delete.txt");
        fs.writeFileSync(filePath, "content");

        const result = await deleteFile({ path: filePath, recursive: false, dryRun: false });
        expect(result.success).toBe(true);
        expect(fs.existsSync(filePath)).toBe(false);
    });

    it("returns error when file does not exist", async () => {
        const result = await deleteFile({
            path: path.join(TMP, "nonexistent.txt"),
            recursive: false,
            dryRun: false,
        });
        expect(result.success).toBe(false);
    });

    it("dry run does not delete the file", async () => {
        const filePath = path.join(TMP, "keep_me.txt");
        fs.writeFileSync(filePath, "content");

        const result = await deleteFile({ path: filePath, recursive: false, dryRun: true });
        expect(result.success).toBe(true);
        expect(fs.existsSync(filePath)).toBe(true);
    });

    it("blocks deletion of node_modules", async () => {
        const result = await deleteFile({ path: "node_modules", recursive: false, dryRun: false });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toMatch(/protected|blocked/i);
        }
    });

    it("blocks deletion of .git", async () => {
        const result = await deleteFile({ path: ".git", recursive: false, dryRun: false });
        expect(result.success).toBe(false);
    });

    it("deletes a directory with recursive true", async () => {
        const dirPath = path.join(TMP, "subdir");
        fs.mkdirSync(dirPath);
        fs.writeFileSync(path.join(dirPath, "file.txt"), "x");

        const result = await deleteFile({ path: dirPath, recursive: true, dryRun: false });
        expect(result.success).toBe(true);
        expect(fs.existsSync(dirPath)).toBe(false);
    });

    it("fails to delete non-empty directory without recursive", async () => {
        const dirPath = path.join(TMP, "nonempty");
        fs.mkdirSync(dirPath);
        fs.writeFileSync(path.join(dirPath, "file.txt"), "x");

        const result = await deleteFile({ path: dirPath, recursive: false, dryRun: false });
        expect(result.success).toBe(false);
    });
});