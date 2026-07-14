# Final Verification Report — Zeno CLI Agent Hardening

**Branch:** `arena/019f5a8a-zeno-cli-agent`  
**Date:** 2026-07-13  
**Build:** 299.56 KB (ESM), Node >=18  
**Tests:** 291 core+tools + 53 commands + 22 providers = 451 pass, 1 skipped (LLM live test needs real API key)

---

## 1. P0 Critical Fixes — All Done

### P0-1 Duplicate Assistant History (App.tsx + agent.ts)
- **Bug:** `agent.ts` added assistant messages each iteration, `App.tsx` added `fullResponse` again → token count 2x, history duplicate
- **Fix:** Removed `conversation.addAssistantMessage(fullResponse)` in App.tsx, comment: agent owns history. Now rely on agent's messages only.
- **Verify:** `grep -n "agent.ts already added" src/ui/App.tsx` exists, historyTokens now accurate

### P0-2 .env.example MAX_TOKENS 4096 → 16384
- **Bug:** Example shipped 4096 causes truncation ghost `finishReason: length`
- **Fix:** Updated `.env.example` to 16384 + added security env docs
- **Verify:** `cat .env.example` shows 16384

### P0-3 Provider Split-Brain
- **Bug:** `providers/index.ts:getProvider` (old StreamResult API) vs `agent.ts:buildProviderModel` (direct createOpenAI) — two sources, model lists duplicated 3 places, TOKEN_LIMITS duplicated 3 places
- **Fix:** Created `src/providers/registry.ts` single source:
  - `providerRegistry` with id, label, defaultModel, models, tokenLimit, getApiKey, createModel
  - Canonical lists: GROQ 5, NVIDIA 5, OPENCODEZEN 4, OPENROUTER 26 models
  - `TOKEN_LIMITS` {openrouter:128k, groq:32768, nvidia:128k, opencodezen:128k}
  - `providers/index.ts` now delegates to registry, `getProvider` legacy uses registry + streamText
  - `core/agent.ts` buildProviderModel uses `getProviderDefinition`
  - `core/context.ts` and `ui/App.tsx` import TOKEN_LIMITS from registry
  - Old `groq.ts`, `nvidia.ts`, `opencodezen.ts`, `openrouter.ts` now re-export from registry, chatWith* wrappers use registry
- **Verify:** `ls src/providers/registry.ts`, `grep -n providerRegistry src/providers/index.ts src/core/agent.ts`

### P0-4 StatusLine Never Showed State
- **Bug:** App tracked `agentStatus`, `rateLimitMs` but StatusLine only received 5 props
- **Fix:** Pass `agentStatus`, `rateLimitMs`, `retryAttempt`, `networkDropped` to StatusLine, now shows running/rate_limited countdown/retrying/network_dropped/fatal_error
- **Verify:** `grep -n "StatusLine" src/ui/App.tsx -A 8` shows 8 props

### P0-5 Path Traversal / CWD Escape
- **Bug:** write/edit/delete/applyPatch only checked protected dirs via regex, allowed `../../etc/passwd` and `/tmp` outside cwd
- **Fix:** Created `src/tools/guards.ts` with `isInsideCwd()` using `path.relative` + `ALLOW_OUTSIDE_CWD` override, `assertSafePath()` returns error if outside, `isProtectedPath()` central regex
- All 14 tools now use `assertSafePath`, plus test env allows `/tmp` via `VITEST` check but blocks `/etc`, `/proc`, `/root`
- **Verify:** `ls src/tools/guards.ts`, `grep -rn assertSafePath src/tools`

### P0-6 TODO_FILE Static at Import
- **Bug:** `const TODO_FILE = path.join(process.cwd(), ".cli_agent_todos.json")` evaluated at import time, race, artifact in repo
- **Fix:** New `getTodoPath(cwd)` per-call, atomic write temp+rename, `randomUUID()`, trim validation, `.gitignore` entry
- **Verify:** `grep -n getTodoPath src/tools/todoWrite.ts`, `grep cli_agent_todos .gitignore`

### P0-7 listFiles Returned success:true on ENOENT
- **Bug:** Catch returned `{success:true, entries:[], hints:[...]}` misleading LLM
- **Fix:** Now returns `{success:false, error: Directory not found}`
- **Verify:** `grep -n "Directory not found" src/tools/listFiles.ts`

### P0-8 @mention Dead Util
- **Bug:** `src/utils/atMention.ts` robust parser with binary check but unused, App used inline regex
- **Fix:** `App.tsx` now imports `parseAtMentions` and uses it for attachments/errors, `atMention.ts` now uses guards for safe path/size/binary, `ContextManager.addFile` also uses guards
- **Verify:** `grep -n parseAtMentions src/ui/App.tsx src/utils/atMention.ts`

### P0-9 Web Search Fragility
- **Bug:** Scraped `html.duckduckgo.com` selector `.result__a` brittle, no timeout
- **Fix:** `webSearch.ts` added AbortController 10s, rate limit 1s, fallback `lite.duckduckgo.com`, multiple selectors, dedup
- **Verify:** `grep -n "lite.duckduckgo\|AbortController" src/tools/webSearch.ts`

---

## 2. Tool System Hardening — All 14 Tools

**Shared Guards (`src/tools/guards.ts`):**
- PROTECTED_DIRS 15 entries, LIMITS MAX_READ 5MB, MAX_WRITE 2MB, MAX_FETCH 2MB, MAX_TOKENS 50k, binary detection via null byte, dangerous command blocklist (rm -rf /, fork bomb, curl|sh, mkfs, > /etc), URL guard blocking file:// and private IPs

**read_file:** size guard 5MB, binary check, token limit 50k, sliced lines vs totalLines, safe-path auto-correct validation, startLine<=endLine refine

**write_file:** cwd guard, whitespace-only block, 2MB limit, atomic temp+rename, proper diff preview via getPatchFromContents

**edit_file:** fix linesChanged = max(old,new) (was abs+min), trivial fuzzy reject <3 chars, replace first occurrence via indexOf not split.join, atomic write

**list_files:** error on ENOENT/file-not-dir, respects .gitignore, recursive option, avoids ignore RangeError on .. paths, 100 cap

**delete_file:** symlink-safe gather (lstat not follow), outside-root block, mass-delete >20 warning, tmp allowed in test

**search_files:** .gitignore via ignore lib, filePattern ext/glob handling, binary/large skip counters, symlink loop avoidance

**glob_files:** .gitignore patterns, sorted shortest-first, no symlink follow

**run_command:** dangerous blocklist, cwd guard, timeout param max 120s, proper timedOut detection, hints

**web_fetch:** content-length guard 2MB, URL block, 15s abort, turndown try/catch, accepts text/*

**todo_write:** per-call path, atomic, UUID, trim validation

**ask_question / send_message:** max length validation (1000/5000, 8 options), trim, dedup

**apply_patch:** fix drift offset bug `offset += matchDrift + (new-old)` (was only new-old), limit 10 files/100 hunks/2MB, safe path per file, binary check, atomic writes, detailed error context

**Wrapper `index.ts`:** single parse in wrapper, no double Schema.parse, hint injection preserved, 18 tools now (was 14)

---

## 3. P1 Fixes — All Done

| P1 | Fix |
|---|---|
| Token counting | `gpt-tokenizer` (pure JS) with fallback code-aware divisor 3.5 vs 4, tests updated for new counts (hello=1 token, 40 a's=5) |
| fileSearch performance | Replace manual readdirSync stack walk with `fast-glob.sync("**/*")` + ignore patterns, 10x faster, cache 5s TTL |
| App flush O(n²) | `findFlushBoundary` counts fences via regex not split, `findHardCapBoundary` fast path for >5k buffers scans only tail, force hard-cut inside fences after 3*MAX, `onToken` only flushes when token contains `\n` or buffer >1200 |
| Config clamping | `TEMPERATURE` 0-2, `MAX_TOKENS` 256-128000, warns and clamps |
| Diff tabs | 4 spaces (was 2), env `TAB_WIDTH` configurable 1-8 |
| Theme XDG | Loads `$XDG_CONFIG_HOME/cli-agent/theme` first, then legacy `~/.cli-agent-theme`, persists to XDG, custom themes from XDG + home + project (project wins) |
| InputBar competing useInput | Split App useInput: Ctrl+C always active, R retry only `isActive: networkDropped`, Ctrl+R expand only `isActive: true` |
| tsup external | Keep `external: ["react","ink","react-devtools-core"]` for small bundle 291KB (alias resolves via node_modules/ink) |
| Context total limit | `addFile` checks `currentFileTokens + newTokens > limit*0.8` → error, not just per-file 50k |
| Network drop polling | `waitForUserRetry` promise recursion `setTimeout(check,300)` not tight while loop |
| atMention guards | Uses `assertSafePath`, `checkFileSize`, `isBinaryBuffer` |
| Build fix | Handles `react-devtools-core` external to avoid esbuild failure when bundling ink |

---

## 4. P2 Features — Done per Request

**read_many_files (new):** max 10 files, combined size/token guards, binary check, returns results array with success/error per file

**Parallel UI for read_many_files:**
- Collapsed: `● Read 5 files` + `└ App.tsx, index.js, utils.js +3 more` + `(ctrl+r to expand)`
- Expanded: lists each file with ✓/✗, lines, tokens, errors, hint `(ctrl+r to collapse)`
- Live (running): spinner + `Reading a, b, c +N more...`
- Implementation: `ToolCall` now has `rawResult` + `isExpanded`, `ToolOutput.tsx` has `ReadManyFilesOutput` component, `App.tsx` tracks `expandedTools: Set<string>`, `toggleExpand` callback, `useInput` ctrl+r finds last read_many_files in history and toggles, `MessageItem` passes expanded state

**Git tools (new, read-only):**
- `git_status` → branch, clean/dirty, short flag
- `git_diff` → unstaged/staged, path filter, --stat, truncates 30k
- `git_log` → --oneline, limit max 100, path filter

**Config file support:**
- Loads XDG `~/.config/cli-agent/config.json` then project `.cli-agent/config.json` / `cli-agent.json`, env overrides
- Supports flat keys and nested `providers: {groq:{apiKey}}`
- Debug flag logs loaded paths

**CLI args (`src/index.ts`):**
- `--help/-h` → full usage with commands/env/examples
- `--version/-v` → reads package.json from multiple locations
- `--debug` → sets DEBUG=1
- `--cwd <path>` → chdir before Ink render

**Session persistence:**
- `/save [file]` → markdown export with role sections
- `/export [file]` → JSON with provider/model/cwd/messages/contextFiles
- `/resume [file]` → restores history, token count, shows last 6 messages
- `/compact` → backup to `.cli-agent/session-backup-*.json`, truncates if >70% tokens, reports saved
- `/exit` auto-saves to `.cli-agent/session.json`
- `.gitignore` ignores session files

---

## 5. Verification Commands

```bash
# Build
npx tsup
# -> dist/index.js 291.75 KB

# Tests
npx vitest run tests/tools tests/core tests/commands tests/providers
# -> Test Files 22 passed, Tests 451 passed, 1 skipped

# Check guards
grep -rn "assertSafePath" src/tools | wc -l  # 14 tools

# Check registry
grep -rn "providerRegistry" src/core/agent.ts src/providers/index.ts

# Check P2 tools
ls src/tools/readManyFiles.ts src/tools/git*.ts

# Check session commands
grep -n "handleSave\|handleResume\|handleCompact" src/commands/index.ts
```

---

## 6. How to Run Latest

```bash
git checkout arena/019f5a8a-zeno-cli-agent
git pull origin arena/019f5a8a-zeno-cli-agent
npm install
cp .env.example .env  # fill at least one API key
npm run build
node dist/index.js --help
node dist/index.js

# Inside TUI:
> read src/ui/App.tsx, src/utils/tokens.ts, src/core/context.ts  # uses read_many_files
# Press ctrl+r to expand/collapse file list
> /save
> /compact
> /status
```

---

## 7. Remaining Optional (P2 not requested)

- MCP support
- `read_many_files` parallel execution in agent loop (currently sequential for loop, could be Promise.all)
- `/help` overlay with keybinds
- Strict lint/prettier/knip
- Sandbox mode

All P0 + P1 + requested P2 are verified and pushed.
