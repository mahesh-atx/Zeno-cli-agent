// src/errors/base.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Typed event system — the entire app speaks these types.
// Nothing below this layer throws a generic JS Error to the console.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── Event Kinds ─────────────────────────────────────────────

export type AgentEventKind =
  | "rate_limit"
  | "auth_error"
  | "network_error"
  | "server_error"
  | "tool_error"
  | "unknown_error"
  | "agent_paused"
  | "agent_turn_end";

// ─── Base Typed Event ─────────────────────────────────────────

export interface BaseAgentEvent {
  kind: AgentEventKind;
  /** Human-readable message safe to show in UI */
  message: string;
  /** Original HTTP status code if available */
  statusCode?: number;
  /** Whether the agent loop can retry this automatically */
  retryable: boolean;
  /** Whether this requires user intervention to continue */
  requiresUserAction: boolean;
  /** Unix timestamp when this event occurred */
  timestamp: number;
}

// ─── Concrete Event Types ─────────────────────────────────────

export interface RateLimitEvent extends BaseAgentEvent {
  kind: "rate_limit";
  retryable: true;
  requiresUserAction: false;
  /** Milliseconds to wait before retrying (parsed from headers or default) */
  retryAfterMs: number;
  /** Which provider triggered this */
  provider: string;
}

export interface AuthEvent extends BaseAgentEvent {
  kind: "auth_error";
  retryable: false;
  requiresUserAction: true;
  provider: string;
}

export interface NetworkEvent extends BaseAgentEvent {
  kind: "network_error";
  retryable: true;
  requiresUserAction: true; // needs user to press R
  provider: string;
}

export interface ServerErrorEvent extends BaseAgentEvent {
  kind: "server_error";
  retryable: true;
  requiresUserAction: false;
  provider: string;
}

export interface ToolErrorEvent extends BaseAgentEvent {
  kind: "tool_error";
  retryable: false;       // tool errors feed back to LLM, not retried at HTTP level
  requiresUserAction: false;
  toolName: string;
  /** The clean string that gets fed back to the LLM */
  toolResultText: string;
}

export interface UnknownErrorEvent extends BaseAgentEvent {
  kind: "unknown_error";
  retryable: false;
  requiresUserAction: true;
}

export interface AgentPausedEvent extends BaseAgentEvent {
  kind: "agent_paused";
  retryable: false;
  requiresUserAction: true;
  question: string;
  options?: string[];
}

export interface AgentTurnEndEvent extends BaseAgentEvent {
  kind: "agent_turn_end";
  retryable: false;
  requiresUserAction: false;
  uiMessage: { title?: string; content: string; type: string };
}

// ─── Union ───────────────────────────────────────────────────

export type AgentEvent =
  | RateLimitEvent
  | AuthEvent
  | NetworkEvent
  | ServerErrorEvent
  | ToolErrorEvent
  | UnknownErrorEvent
  | AgentPausedEvent
  | AgentTurnEndEvent;

// ─── Type Guards ─────────────────────────────────────────────

export function isRateLimitEvent(e: AgentEvent): e is RateLimitEvent {
  return e.kind === "rate_limit";
}

export function isAuthEvent(e: AgentEvent): e is AuthEvent {
  return e.kind === "auth_error";
}

export function isNetworkEvent(e: AgentEvent): e is NetworkEvent {
  return e.kind === "network_error";
}

export function isServerErrorEvent(e: AgentEvent): e is ServerErrorEvent {
  return e.kind === "server_error";
}

export function isToolErrorEvent(e: AgentEvent): e is ToolErrorEvent {
  return e.kind === "tool_error";
}

export function isAgentPausedEvent(e: AgentEvent): e is AgentPausedEvent {
  return e.kind === "agent_paused";
}

export function isAgentTurnEndEvent(e: AgentEvent): e is AgentTurnEndEvent {
  return e.kind === "agent_turn_end";
}

// ─── Factory Helpers ─────────────────────────────────────────

export function makeRateLimitEvent(
  provider: string,
  retryAfterMs: number,
  statusCode = 429
): RateLimitEvent {
  return {
    kind: "rate_limit",
    message: `Rate limit hit on ${provider}. Retrying in ${Math.ceil(retryAfterMs / 1000)}s.`,
    statusCode,
    retryable: true,
    requiresUserAction: false,
    retryAfterMs,
    provider,
    timestamp: Date.now(),
  };
}

export function makeAuthEvent(
  provider: string,
  statusCode = 401
): AuthEvent {
  return {
    kind: "auth_error",
    message: `Authentication failed on ${provider} (${statusCode}). Check your API key.`,
    statusCode,
    retryable: false,
    requiresUserAction: true,
    provider,
    timestamp: Date.now(),
  };
}

export function makeNetworkEvent(
  provider: string,
  detail: string
): NetworkEvent {
  return {
    kind: "network_error",
    message: `Network error on ${provider}: ${detail}. Press R to retry.`,
    retryable: true,
    requiresUserAction: true,
    provider,
    timestamp: Date.now(),
  };
}

export function makeServerErrorEvent(
  provider: string,
  statusCode: number,
  attempt: number
): ServerErrorEvent {
  return {
    kind: "server_error",
    message: `Server error ${statusCode} on ${provider} (attempt ${attempt}).`,
    statusCode,
    retryable: true,
    requiresUserAction: false,
    provider,
    timestamp: Date.now(),
  };
}

export function makeToolErrorEvent(
  toolName: string,
  rawError: unknown
): ToolErrorEvent {
  const msg =
    rawError instanceof Error ? rawError.message : String(rawError ?? "Unknown error");
  return {
    kind: "tool_error",
    message: `Tool "${toolName}" failed: ${msg}`,
    retryable: false,
    requiresUserAction: false,
    toolName,
    toolResultText: `Tool "${toolName}" encountered an error: ${msg}`,
    timestamp: Date.now(),
  };
}

export function makeUnknownErrorEvent(rawError: unknown): UnknownErrorEvent {
  const msg =
    rawError instanceof Error ? rawError.message : String(rawError ?? "Unknown error");
  return {
    kind: "unknown_error",
    message: msg,
    retryable: false,
    requiresUserAction: true,
    timestamp: Date.now(),
  };
}