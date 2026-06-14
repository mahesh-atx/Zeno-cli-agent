import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { todoWrite, TodoWriteSchema } from "../../src/tools/todoWrite";
import { ZodError } from "zod";

describe("todoWrite tool", () => {
  const todoFilePath = path.join(process.cwd(), ".cli_agent_todos.json");

  beforeEach(() => {
    if (fs.existsSync(todoFilePath)) {
      fs.rmSync(todoFilePath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(todoFilePath)) {
      fs.rmSync(todoFilePath);
    }
  });

  it("should list empty tasks initially", async () => {
    const result = await todoWrite({ action: "list" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tasks).toEqual([]);
      expect(result.message).toContain("Found 0 tasks");
    }
  });

  it("should add a new task", async () => {
    const result = await todoWrite({ action: "add", title: "Test task 1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tasks.length).toBe(1);
      expect(result.tasks[0].title).toBe("Test task 1");
      expect(result.tasks[0].status).toBe("pending");
      expect(result.tasks[0].id).toBeDefined();
    }
  });

  it("should list existing tasks", async () => {
    await todoWrite({ action: "add", title: "Task 1" });
    await todoWrite({ action: "add", title: "Task 2" });
    
    const result = await todoWrite({ action: "list" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tasks.length).toBe(2);
      expect(result.tasks[0].title).toBe("Task 1");
      expect(result.tasks[1].title).toBe("Task 2");
    }
  });

  it("should update a task", async () => {
    const addResult = await todoWrite({ action: "add", title: "Old task" });
    if (!addResult.success) throw new Error("Add failed");
    
    const taskId = addResult.tasks[0].id;
    
    const updateResult = await todoWrite({ action: "update", id: taskId, title: "New task", status: "completed" });
    expect(updateResult.success).toBe(true);
    if (updateResult.success) {
      expect(updateResult.tasks[0].title).toBe("New task");
      expect(updateResult.tasks[0].status).toBe("completed");
    }
  });

  it("should delete a task", async () => {
    const addResult = await todoWrite({ action: "add", title: "To be deleted" });
    if (!addResult.success) throw new Error("Add failed");
    
    const taskId = addResult.tasks[0].id;
    
    const deleteResult = await todoWrite({ action: "delete", id: taskId });
    expect(deleteResult.success).toBe(true);
    if (deleteResult.success) {
      expect(deleteResult.tasks.length).toBe(0);
    }
  });

  it("should return an error for invalid input", async () => {
    const noTitleResult = await todoWrite({ action: "add" });
    expect(noTitleResult.success).toBe(false);
    
    const noIdUpdateResult = await todoWrite({ action: "update", title: "Hmm" });
    expect(noIdUpdateResult.success).toBe(false);

    const wrongIdResult = await todoWrite({ action: "update", id: "nonexistent", status: "completed" });
    expect(wrongIdResult.success).toBe(false);
  });

  describe("schema validation", () => {
    it("should parse valid input", () => {
      const addInput = { action: "add", title: "T" };
      expect(TodoWriteSchema.parse(addInput)).toEqual(addInput);
      
      const updateInput = { action: "update", id: "123", status: "completed" };
      expect(TodoWriteSchema.parse(updateInput)).toEqual(updateInput);
    });

    it("should throw on missing action", () => {
      expect(() => TodoWriteSchema.parse({ title: "T" })).toThrow(ZodError);
    });

    it("should throw on invalid action", () => {
      expect(() => TodoWriteSchema.parse({ action: "invalid" })).toThrow(ZodError);
    });
  });
});
