# Zeno CLI Agent — Deep Dive Analysis

Date: 2026-07-13
Branch: arena/019f5a8a-zeno-cli-agent

## 1. Executive Summary

Zeno is a **Claude-Code style terminal agent**: Ink + React UI, tool-calling loop (Vercel AI SDK), multi-provider support (OpenRouter, Groq, NVIDIA, OpenCodeZen), fuzzy file resolution, and a polished theme system. 

**State**: ~85% feature-complete for an MVP. Core loop works, tool UX is surprisingly resilient (fuzzy path correction, whitespace-tolerant edits, Zod self-correction hints). But there is architectural split-brain, security gaps, and several silent failure modes.

**Verdict**: Great foundation, needs hardening before public release. 9 P0 fixes, 12 P1 improvements.

---

## 2. Functionalities Overview

### 2.1 Core Loop — `src/core/agent.ts`
- Builds provider model directly via `createOpenAI` / `createGroq` (16384 default maxTokens)
- Streams `text-delta` + `tool-call` via `ai` SDK
- 10-iteration loop, 4 retries, exponential backoff
- Handles rate-limit countdown, server error backoff, network drop (user presses R)
- Tool result summarizer for UI
- Detects `finishReason: length` ghost — when LLM output truncated mid-JSON

**Good**: typed `AgentEvent` system replaces generic errors. Rate-limit wait ticks every 1s.

### 2.2 Context Management — `src/core/context.ts`
- `/add`, `/remove`, `/files`, `/tokens`, `@mention`
- Injects file content block into system prompt on every run
- Auto-truncates oldest pairs at 85%, warns at 70%
- Limits: 50k token per file, provider-specific total (32k Groq, 128k others)

### 2.3 Tool System — `src/tools/`
14 tools registered in `index.ts` with Zod schemas and wrapper `wrapExecute`:
- `read_file`: auto-corrects typos via 0-dep fuzzy scoring, returns directory listing hints
- `write_file`: protected dir guard, ENOTDIR/Diff preview, size delta
- `edit_file`: whitespace-tolerant fuzzy match, mass-replace guard, closest-line hint
- `list_files`: ignores junk, dir-first sort, 100-entry cap
- `run_command`: 60s timeout, smart head/tail truncation (50 + 350 lines), hints for npm/tsc failures
- `search_files`: recursive walk, regex support, 1MB file cap, 50-match cap
- `glob_files`: fast-glob, ignores node_modules/.git
- `delete_file`: gathers nested paths, dry-run, blocks root deletion
- `apply_patch`: unified diff parser (`diff` pkg), 15-line drift tolerance, atomic validation before write, dryRun support
- `todo_write`: JSON file `.cli_agent_todos.json` persistence
- `ask_question`, `send_message`: pause loop with typed AgentEvents
- `web_search` (DuckDuckGo scraping), `web_fetch` (cheerio+turndown, 15k char cap)

Wrapper injects `_agent_instructions` and catches ZodErrors into self-correcting messages.

### 2.4 Providers — `src/providers/`
- **Two systems co-exist**: `providers/index.ts` exports `getProvider` returning `StreamResult | AgentEvent` (old), but `agent.ts` has its own `buildProviderModel` that directly returns AI SDK model. `getProvider` is **dead code** except for `PROVIDER_MODELS` list.
- Lists: Groq 5 models, NVIDIA 5, OpenRouter 26 (many `:free`), OpenCodeZen 4
- OpenRouter/NVIDIA/OpenCodeZen all use `createOpenAI` with custom baseURL

### 2.5 UI — `src/ui/App.tsx` (~843 lines)
- `<Static>` for history (welcome + messages), dynamic live region for streaming preview
- Paragraph flush logic: flush on `\n\n` outside code fences, hard-cap at 1200 chars, throttles at 60ms
- Permission + Question prompts
- InputBar: slash command fuzzy search (Fuse), @file fuzzy search, provider/model/theme menus (provider, model, theme are intercepted; `/context`, `/tokens`, `/status` open StatusMenu)
- 16 built-in themes + custom JSON loader from `~/.cli-agent/themes` + `.cli-agent/themes` (project-local wins)
- Markdown renderer: `marked` as lexer only, custom `formatToken` with `chalk` + `cli-highlight`, bypasses `marked-terminal` to keep Ink wrapping

### 2.6 Commands — `src/commands/index.ts`
Single source for slash commands: help, model, provider, theme, add, remove, context/files, tokens, status, retry, clear, exit/quit/q

### 2.7 Error System — `src/errors/`
- `base.ts`: 8 event kinds, factories, type guards
- `apiErrors.ts`: parses retry-after header (seconds vs timestamp), maps 401/403→auth, 429→rate_limit, 5xx→server_error, network strings→network_error
- `toolErrors.ts`: OS code mapping (ENOENT etc.)

---

## 3. What Works Really Well

1. **Self-correcting tools**: Zod schema violation returns instruction, not crash. Hints field fed explicitly to LLM.
2. **Fuzzy resilience**: read_file auto-correct, edit_file whitespace tolerance, list_files fallback on file-not-found.
3. **Typed error pipeline**: from provider HTTP → typed event → UI state (rateLimited countdown, R retry). No silent `console.log` failures.
4. **Markdown rendering**: lexer-only + Ansi parsing keeps Ink width math correct; code fence protection in flush avoids split leak.
5. **Patch tool**: drift-tolerant, dry-run, atomic — far beyond simple edit_file; essential for refactors.
6. **Theme system**: live preview, custom JSON, persisted dotfile, semantic colors.
7. **Token UX**: warning at 70%, truncation at 85%, formatTokenCount, status line token colors.
8. **Safety rails**: blocked dirs (node_modules, .git, dist...), timeout, truncation to protect context window.

---

## 4. Critical Bugs — P0 Fixes Required

### P0-1 Duplicate Assistant History (App.tsx + agent.ts)
`agent.ts:495` does `conversation.addMessage({role:"assistant"})` each iteration with tool-calls. `App.tsx:780` after loop does `conversation.addAssistantMessage(fullResponseRef.current)` again. Result: **last assistant text duplicated**, history grows 2x. Breaks token counting and may confuse LLM on retry.

**Fix**: App should not add final message if agent already added it, or agent should return raw and App owns final add. Choose one owner.

### P0-2 .env.example MAX_TOKENS=4096 contradicts code default 16384
Comment in `config.ts:81` explains 4096 causes truncation ghost. But `.env.example` ships 4096, so new users will hit silent failure. `finishReason: length` handler exists but returns empty response.

**Fix**: Update `.env.example` to `16384`, add note; clamp maxTokens < 8000 warning.

### P0-3 Provider Split-Brain / Dead Code
`providers/index.ts` exports `getProvider`, `isStreamResult`, `chatWithOpenRouter` etc; `agent.ts` ignores all and builds its own client. Tests `providers/index.test.ts` likely test dead path. Confusing for contributors; model lists diverge.

**Fix**: Delete old `chatWith*` functions or make `agent.ts` use `getProvider`. Single source: `buildProviderModel` should live in providers/index.

### P0-4 StatusLine Never Shows Agent Status
`App.tsx:656` renders `<StatusLine provider={...} model={...} tokenCount...>` but never passes `agentStatus`, `rateLimitMs`, `retryAttempt`, `networkDropped`. Even though state exists, UI always shows `idle/ready`.

**Fix**: Wire props: `agentStatus={agentStatus} rateLimitMs={rateLimitMs} retryAttempt={retryAttempt} networkDropped={networkDropped}`

### P0-5 Path Traversal / CWD Escape
`write_file`, `edit_file`, `delete_file`, `apply_patch` check `PROTECTED_DIRS` via regex but not whether resolved path is inside `process.cwd()`. `../../etc/passwd` or `/tmp/evil` passes.

**Fix**: Add `isInsideCwd(resolved)` check: `resolved.startsWith(cwd + sep) || resolved === cwd`. Block absolute external writes unless flag.

### P0-6 TODO_FILE static at import time, race in tests
`todoWrite.ts:36` `const TODO_FILE = path.join(process.cwd(), ".cli_agent_todos.json")` evaluated once at import. If cwd changes (tests use custom cwd) or parallel runs, collides. Also leaves artifact in real project; should be in temp or gitignored.

**Fix**: Compute per-call `path.join(process.cwd(), ...)`, add to `.gitignore`, or use `os.tmpdir()` + hash or `.cli-agent/` dir.

### P0-7 listFiles returns success on ENOENT
`listFiles.ts:85` catch returns `{success:true, entries:[], hints:[Directory does not exist]}`. Callers think directory empty, not error.

**Fix**: Return `{success:false, error:...}` or at least success:true but distinguish in hints check? Better error.

### P0-8 @mention Duplicate Impl, Unused util
`src/utils/atMention.ts` has robust parser (`parseAtMentions`) with binary detection, MAX_FILE_TOKENS, but `App.tsx` re-implements inline regex `/@([\w.\/\-]+)/` with `contextManager.addFile`. The util is dead, and inline version misses stripping punctuation correctly, no binary check.

**Fix**: Use util consistently or delete file. Wire it in App.

### P0-9 Web Search Fragility + No Timeout
`webSearch` scrapes `html.duckduckgo.com` class `.result__a` — DuckDuckGo frequently changes layout, no abort controller, no rate limit handling. Could return 0 results silently.

**Fix**: Add AbortController 10s, fallback to `https://duckduckgo.com/html/` alternative, or use API (DDG still free). Add user-agent rotation and retries.

---

## 5. Medium Severity — P1 Should Fix

| Area | Issue | Fix |
|------|-------|-----|
| **Security** | `run_command` shells via `execa` with `shell: "/bin/sh"` — injection risk if LLM passes `; rm -rf`. Permission prompt exists but --yes bypasses. | Consider allowlist or dry-run preview for dangerous commands (`rm -rf`, `chmod`, `curl | sh`). |
| **Performance** | `fileSearch.ts` walks sync with `readdirSync` on UI thread; 5000 files * every 5s. Blocks Ink rendering. | Make async, cache with watcher, or debounce longer. Use worker? |
| **Performance** | `App.flushParagraphs` called per token (`onToken`) does `split("\n")` over growing buffer — O(n²). | Throttle flush + only check near end. |
| **Token Counting** | `countTokens = ceil(len/4)` is very rough (off 30-50% for code). Groq 32k limit calculations inaccurate. | Integrate `js-tiktoken` or `gpt-tokenizer` (light) for better estimate; at least provider-specific multiplier. |
| **Context Injection** | `buildContextBlock` dumps full file content with ``` ext fences but no truncation per file — if many files added, exceeds limit and LLM still sees all. | Pre-check total and reject or summarize. |
| **Config** | `config.ts` does `process.exit(1)` in library code, kills tests and Ink without graceful message. | Throw custom `ConfigError` and handle in `index.ts`. |
| **Provider Config** | `TEMPERATURE` and `MAX_TOKENS` from env are read as float but not validated (negative, >1 for temp for some providers). | Clamp 0-2 temp, >0 tokens, warn. |
| **Diff Rendering** | `convertLeadingTabsToSpaces` replaces `\t` with 2 spaces, but original file may use 4; diff UI may show false changes. | Make configurable or preserve. |
| **Theme Persistence** | `ThemeManager` loads `.cli-agent-theme` from home dir synchronously at import time — blocks startup if NFS/home slow, no XDG compliance. | Use `~/.config/cli-agent/theme` with fallback, async. |
| **InputBar** | Two `useInput` hooks (App for R retry + InputBar for typing) compete. Ink calls them in order; if InputBar disabled during loading, R may not fire. | Centralize input handling or set priority. |
| **Error Tests** | Network drop polling `while(!shouldRetry()) sleep(200)` — cheap but busy loop; if App unmounts, interval stays? | Use promise resolver not poll. |
| **Build** | `tsup.config.ts` externalizes `react` and `ink` — but `ink` is forked from `@jrichman/ink` via npm alias, may not resolve at runtime in packaged bin. | Bundle ink, externalize only react? Or set `noExternal: [/@jrichman\/ink/]`. |
| **Testing** | No e2e for permission flow, theme switching, context truncation. `apply_patch` has unit but not fuzzy drift edge. | Add vitest for those. |

---

## 6. Architectural Improvements — P2

### 6.1 Unified Provider Registry
Create single `providers/registry.ts`:
```ts
interface ProviderDef {
  id: ProviderName
  createModel(apiKey:string, model:string)
  defaultModel: string
  tokenLimit: number
  models: string[]
}
```
Then `agent.ts` consumes registry; `ModelMenu` reads from registry, not duplicated lists.

### 6.2 Session Persistence / Checkpoints
- Save conversation to `.cli-agent/session.json` on exit, restore on `/resume`.
- Add `/compact` command to summarize history via LLM (reduce tokens, not just delete).
- Add `/save <file>` to export markdown log.

### 6.3 Better Tooling
Missing tools many agents have:
- `read_many_files` (parallel) — reduces roundtrips
- `git_status`, `git_diff`, `git_log` wrappers (safer than raw run_command)
- `grep` already search_files but `readMany` would help

### 6.4 Config file
Support `~/.cli-agent/config.json` + project `.cli-agent.json` overriding env. Allow `DEFAULT_PROVIDER` per-project.

### 6.5 Structured Output / Plans
`todo_write` is file-based JSON; should live in memory + persist, support hierarchy.

### 6.6 Performance
- Convert fs sync → async/promises with cache.
- Use `tiny` token estimator but lazy-load tiktoken wasm.
- Stream markdown rendering: avoid re-lex entire buffer each token.

### 6.7 Observability
Add `--debug` flag logging full LLM requests/responses to `.cli-agent/debug.log`. Add OpenTelemetry span?

### 6.8 Security Hardening
- `--sandbox` mode using `isolated-vm` or Docker.
- Blocklist dangerous commands central.
- `YES_TO_ALL` env should still warn for destructive actions.

### 6.9 UX Polish
- Help screen with keybinds (Ctrl+U clear line already works but undocumented at runtime? Add status hint).
- Welcome banner shows provider/model but not token limit, cwd.
- `/help` output static — auto-generate from COMMANDS.meta with colors.
- Auto-complete for `/add` paths (use FileMenu but for slash args).
- Show tool execution duration in ToolOutput header.

### 6.10 Code Quality
- Strict lint: no `any` (found 4 any in agent.ts). Use proper `ToolCallContent` types.
- Add `knip` to find dead files (`atMention` util, old provider functions).
- Add `prettier` + pre-commit hook.
- Replace `console.clear()` in `/clear` with Ink native clear — currently bypasses Ink buffer leaving artifact.
- `StatusLine.tsx` missing memoization; re-renders each token.

---

## 7. Feature Roadmap Suggestion

**Week 1 — Hardening (P0)**
- Fix duplicate history, StatusLine wiring
- Add cwd boundary checks
- Update .env.example MAX_TOKENS
- Use util atMentions or delete
- Handle ENOENT as error in list_files
- Re-compute TODO_FILE path per call + gitignore

**Week 2 — DX (P1)**
- Unified provider registry, delete dead chatWith* functions
- Wrap config load in try/catch, not process.exit
- Add timeout to web_search + abort controller
- Async fileSearch + token counting with tiktoken lite
- Improve run_command security checklist

**Week 3 — Features (P2)**
- `/compact`, `/resume`, session export
- `read_many_files` tool
- git tools
- Readme badges, --version flag, man page

---

## 8. Bottom Line

Strengths to keep: fuzzy auto-correct, Zod self-correction injections, drift-tolerant apply_patch, typed error events, live theme preview.

Weak spots: dual provider system, security CWD escape, duplicate conversation history, status line dead props, fragile web scrapers, sync fs walks on UI thread.

If you fix P0s, this is already better than many open-source CLI agents. P1s make it production-grade.

Want me to implement the P0 fixes in this branch?

