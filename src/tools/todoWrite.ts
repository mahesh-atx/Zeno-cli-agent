import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { getTodoPath, LIMITS } from "./guards";

export const TodoWriteSchema = z.object({
  action: z.enum(["add", "update", "delete", "list"]).describe("The action to perform on the task list"),
  id: z.string().optional().describe("Task ID (required for update/delete)"),
  title: z.string().max(LIMITS.MAX_TASK_TITLE_LENGTH).optional().describe("Task description (required for add)"),
  status: z.enum(["pending", "in_progress", "completed"]).optional().describe("Task status (for update)"),
});

export type TodoWriteInput = z.infer<typeof TodoWriteSchema>;

export interface TodoTask {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
  createdAt: string;
}

export interface TodoWriteOutput {
  success: true;
  tasks: TodoTask[];
  message: string;
  hints?: string[];
}

export interface TodoWriteError {
  success: false;
  error: string;
  hints?: string[];
}

export type TodoWriteResult = TodoWriteOutput | TodoWriteError;

const MAX_TASKS = 50;

function loadTasks(cwd: string = process.cwd()): TodoTask[] {
  const file = getTodoPath(cwd);
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // corrupted file, return empty but don't delete yet - will overwrite on save
  }
  return [];
}

function saveTasks(tasks: TodoTask[], cwd: string = process.cwd()) {
  const file = getTodoPath(cwd);
  // Atomic write: temp + rename
  const tmp = `${file}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

export async function todoWrite(input: TodoWriteInput): Promise<TodoWriteResult> {
  const cwd = process.cwd();
  let tasks = loadTasks(cwd);

  if (input.action === "list") {
    return {
      success: true,
      tasks,
      message: `Found ${tasks.length} tasks.`,
      hints: tasks.length === 0 ? ["Task list empty. Use 'add' to create first task."] : [],
    };
  }

  if (input.action === "add") {
    if (!input.title || input.title.trim().length === 0) {
      return { success: false, error: "Title is required and must be non-empty to add a task." };
    }
    if (tasks.length >= MAX_TASKS) {
      return {
        success: false,
        error: `Task list is full (max ${MAX_TASKS}).`,
        hints: ["Delete completed tasks before adding new ones."],
      };
    }
    const newTask: TodoTask = {
      id: `task_${randomUUID()}`,
      title: input.title.trim(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    tasks.push(newTask);
    try {
      saveTasks(tasks, cwd);
    } catch (e: any) {
      return { success: false, error: `Failed to save tasks: ${e.message}` };
    }
    return { success: true, tasks, message: `Added task: ${input.title}` };
  }

  if (input.action === "update") {
    if (!input.id) return { success: false, error: "ID is required to update a task." };
    const task = tasks.find((t) => t.id === input.id);
    if (!task) return { success: false, error: `Task ${input.id} not found.` };

    if (input.status) task.status = input.status;
    if (input.title) {
      if (input.title.length > LIMITS.MAX_TASK_TITLE_LENGTH) {
        return { success: false, error: `Title too long, max ${LIMITS.MAX_TASK_TITLE_LENGTH} chars` };
      }
      task.title = input.title.trim();
    }

    try {
      saveTasks(tasks, cwd);
    } catch (e: any) {
      return { success: false, error: `Failed to save tasks: ${e.message}` };
    }
    return { success: true, tasks, message: `Updated task ${input.id}.` };
  }

  if (input.action === "delete") {
    if (!input.id) return { success: false, error: "ID is required to delete a task." };
    const initialLength = tasks.length;
    tasks = tasks.filter((t) => t.id !== input.id);
    if (tasks.length === initialLength) return { success: false, error: `Task ${input.id} not found.` };

    try {
      saveTasks(tasks, cwd);
    } catch (e: any) {
      return { success: false, error: `Failed to save tasks: ${e.message}` };
    }
    return { success: true, tasks, message: `Deleted task ${input.id}.` };
  }

  return { success: false, error: "Invalid action." };
}
