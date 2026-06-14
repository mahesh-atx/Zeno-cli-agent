import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

export const TodoWriteSchema = z.object({
  action: z.enum(["add", "update", "delete", "list"]).describe("The action to perform on the task list"),
  id: z.string().optional().describe("Task ID (required for update/delete)"),
  title: z.string().optional().describe("Task description (required for add)"),
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

const TODO_FILE = path.join(process.cwd(), ".cli_agent_todos.json");
const MAX_TASKS = 50;

function loadTasks(): TodoTask[] {
  try {
    if (fs.existsSync(TODO_FILE)) {
      const raw = fs.readFileSync(TODO_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch {}
  return [];
}

function saveTasks(tasks: TodoTask[]) {
  fs.writeFileSync(TODO_FILE, JSON.stringify(tasks, null, 2), "utf-8");
}

export async function todoWrite(input: TodoWriteInput): Promise<TodoWriteResult> {
  let tasks = loadTasks();

  if (input.action === "list") {
    return {
      success: true,
      tasks,
      message: `Found ${tasks.length} tasks.`,
      hints: tasks.length === 0 ? ["The task list is empty. Use 'add' to create your first task."] : []
    };
  }

  if (input.action === "add") {
    if (!input.title) return { success: false, error: "Title is required to add a task." };
    if (tasks.length >= MAX_TASKS) {
      return {
        success: false,
        error: `Task list is full (max ${MAX_TASKS}).`,
        hints: ["Delete completed tasks before adding new ones to protect the context window."],
      };
    }
    const newTask: TodoTask = {
      id: `task_${Date.now()}`,
      title: input.title,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    tasks.push(newTask);
    saveTasks(tasks);
    return { success: true, tasks, message: `Added task: ${input.title}` };
  }

  if (input.action === "update") {
    if (!input.id) return { success: false, error: "ID is required to update a task." };
    const task = tasks.find((t) => t.id === input.id);
    if (!task) return { success: false, error: `Task ${input.id} not found.` };
    
    if (input.status) task.status = input.status;
    if (input.title) task.title = input.title;
    
    saveTasks(tasks);
    return { success: true, tasks, message: `Updated task ${input.id}.` };
  }

  if (input.action === "delete") {
    if (!input.id) return { success: false, error: "ID is required to delete a task." };
    const initialLength = tasks.length;
    tasks = tasks.filter((t) => t.id !== input.id);
    if (tasks.length === initialLength) return { success: false, error: `Task ${input.id} not found.` };
    
    saveTasks(tasks);
    return { success: true, tasks, message: `Deleted task ${input.id}.` };
  }

  return { success: false, error: "Invalid action." };
}