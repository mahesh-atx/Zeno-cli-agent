import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { todoWrite, TodoWriteSchema } from "../../src/tools/todoWrite";

const TODO_FILE = path.join(process.cwd(), ".cli_agent_todos.json");

function cleanTodoFile() {
  if (fs.existsSync(TODO_FILE)) {
    fs.unlinkSync(TODO_FILE);
  }
}

describe("TodoWriteSchema", () => {
  it("accepts list action with no other fields", () => {
    const result = TodoWriteSchema.safeParse({ action: "list" });
    expect(result.success).toBe(true);
  });

  it("accepts add action with title", () => {
    const result = TodoWriteSchema.safeParse({
      action: "add",
      title: "Fix the bug",
    });
    expect(result.success).toBe(true);
  });

  it("accepts update action with id and status", () => {
    const result = TodoWriteSchema.safeParse({
      action: "update",
      id: "task_123",
      status: "completed",
    });
    expect(result.success).toBe(true);
  });

  it("accepts delete action with id", () => {
    const result = TodoWriteSchema.safeParse({
      action: "delete",
      id: "task_123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid action", () => {
    const result = TodoWriteSchema.safeParse({ action: "clear" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status", () => {
    const result = TodoWriteSchema.safeParse({
      action: "update",
      id: "task_1",
      status: "done",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    const statuses = ["pending", "in_progress", "completed"] as const;
    for (const status of statuses) {
      const result = TodoWriteSchema.safeParse({
        action: "update",
        id: "task_1",
        status,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("todoWrite — list", () => {
  beforeEach(cleanTodoFile);
  afterEach(cleanTodoFile);

  it("returns empty list when no file exists", async () => {
    const result = await todoWrite({ action: "list" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tasks).toEqual([]);
    }
  });

  it("returns hint when list is empty", async () => {
    const result = await todoWrite({ action: "list" });
    if (result.success) {
      expect(result.hints?.some((h) => h.includes("empty") || h.includes("add"))).toBe(true);
    }
  });

  it("returns all tasks after adding some", async () => {
    await todoWrite({ action: "add", title: "Task A" });
    await todoWrite({ action: "add", title: "Task B" });
    const result = await todoWrite({ action: "list" });
    if (result.success) {
      expect(result.tasks.length).toBe(2);
    }
  });
});

describe("todoWrite — add", () => {
  beforeEach(cleanTodoFile);
  afterEach(cleanTodoFile);

  it("adds a task and returns it", async () => {
    const result = await todoWrite({ action: "add", title: "Write tests" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tasks.length).toBe(1);
      expect(result.tasks[0].title).toBe("Write tests");
    }
  });

  it("new task starts with pending status", async () => {
    const result = await todoWrite({ action: "add", title: "New task" });
    if (result.success) {
      expect(result.tasks[0].status).toBe("pending");
    }
  });

  it("new task has an id", async () => {
    const result = await todoWrite({ action: "add", title: "New task" });
    if (result.success) {
      expect(result.tasks[0].id).toBeDefined();
      expect(typeof result.tasks[0].id).toBe("string");
    }
  });

  it("new task has a createdAt timestamp", async () => {
    const result = await todoWrite({ action: "add", title: "New task" });
    if (result.success) {
      expect(result.tasks[0].createdAt).toBeDefined();
      const date = new Date(result.tasks[0].createdAt);
      expect(isNaN(date.getTime())).toBe(false);
    }
  });

  it("fails when title is missing", async () => {
    const result = await todoWrite({ action: "add" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/title/i);
    }
  });

  it("persists tasks to disk", async () => {
    await todoWrite({ action: "add", title: "Persisted task" });
    expect(fs.existsSync(TODO_FILE)).toBe(true);
    const raw = JSON.parse(fs.readFileSync(TODO_FILE, "utf-8"));
    expect(raw[0].title).toBe("Persisted task");
  });

  it("multiple adds accumulate", async () => {
    await todoWrite({ action: "add", title: "A" });
    await todoWrite({ action: "add", title: "B" });
    await todoWrite({ action: "add", title: "C" });
    const result = await todoWrite({ action: "list" });
    if (result.success) {
      expect(result.tasks.length).toBe(3);
    }
  });

  it("returns error when at max capacity", async () => {
    // Fill up to MAX_TASKS (50)
    for (let i = 0; i < 50; i++) {
      await todoWrite({ action: "add", title: `Task ${i}` });
    }
    const result = await todoWrite({ action: "add", title: "One too many" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/full|max/i);
    }
  });
});

describe("todoWrite — update", () => {
  beforeEach(cleanTodoFile);
  afterEach(cleanTodoFile);

  it("updates task status", async () => {
    const addResult = await todoWrite({ action: "add", title: "Task" });
    if (!addResult.success) throw new Error("setup failed");
    const taskId = addResult.tasks[0].id;

    const result = await todoWrite({
      action: "update",
      id: taskId,
      status: "completed",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const updated = result.tasks.find((t) => t.id === taskId);
      expect(updated?.status).toBe("completed");
    }
  });

  it("updates task title", async () => {
    const addResult = await todoWrite({ action: "add", title: "Old title" });
    if (!addResult.success) throw new Error("setup failed");
    const taskId = addResult.tasks[0].id;

    const result = await todoWrite({
      action: "update",
      id: taskId,
      title: "New title",
    });
    if (result.success) {
      const updated = result.tasks.find((t) => t.id === taskId);
      expect(updated?.title).toBe("New title");
    }
  });

  it("fails when id is missing", async () => {
    const result = await todoWrite({ action: "update", status: "completed" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/id/i);
    }
  });

  it("fails when id does not exist", async () => {
    const result = await todoWrite({
      action: "update",
      id: "nonexistent_id",
      status: "completed",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/not found/i);
    }
  });

  it("persists status change to disk", async () => {
    const addResult = await todoWrite({ action: "add", title: "Task" });
    if (!addResult.success) throw new Error("setup failed");
    const taskId = addResult.tasks[0].id;

    await todoWrite({ action: "update", id: taskId, status: "in_progress" });

    const raw = JSON.parse(fs.readFileSync(TODO_FILE, "utf-8"));
    const saved = raw.find((t: any) => t.id === taskId);
    expect(saved.status).toBe("in_progress");
  });
});

describe("todoWrite — delete", () => {
  beforeEach(cleanTodoFile);
  afterEach(cleanTodoFile);

  it("deletes an existing task", async () => {
    const addResult = await todoWrite({ action: "add", title: "To delete" });
    if (!addResult.success) throw new Error("setup failed");
    const taskId = addResult.tasks[0].id;

    const result = await todoWrite({ action: "delete", id: taskId });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tasks.find((t) => t.id === taskId)).toBeUndefined();
    }
  });

  it("fails when id is missing", async () => {
    const result = await todoWrite({ action: "delete" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/id/i);
    }
  });

  it("fails when id does not exist", async () => {
    const result = await todoWrite({
      action: "delete",
      id: "ghost_id",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/not found/i);
    }
  });

  it("does not delete other tasks", async () => {
    await todoWrite({ action: "add", title: "Keep this" });
    const del = await todoWrite({ action: "add", title: "Delete this" });
    if (!del.success) throw new Error("setup failed");
    const deleteId = del.tasks[del.tasks.length - 1].id;

    await todoWrite({ action: "delete", id: deleteId });
    const list = await todoWrite({ action: "list" });
    if (list.success) {
      expect(list.tasks.length).toBe(1);
      expect(list.tasks[0].title).toBe("Keep this");
    }
  });
});