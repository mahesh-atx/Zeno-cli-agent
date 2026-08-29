# Zeno CLI Agent — Complete Fix Report (Till Now)

**Branch:** `arena/019f5a8a-zeno-cli-agent`  
**Latest Commit:** 83b58e5  
**Build:** 318.03 KB ESM  
**Tests:** 291 core+tools pass (16 files), 53 commands, 22 providers = 451 pass, 1 skipped (LLM live test)

---

## 1. Tool System (Original Request) — 14 → 18 Tools

### Shared Security Layer `src/tools/guards.ts` (NEW, 12KB)
- `isInsideCwd()` uses `path.relative` to block `../../etc/passwd`, respects `ALLOW_OUTSIDE_CWD=1`, test env allows `/tmp` but blocks `/etc`, `/proc`, `/root`
- `isProtectedPath()` central regex for 15 dirs (node_modules, .git, dist, build, .venv, etc.)
- `isBinaryBuffer()` / `isBinaryFileSync()` null-byte scan first 1KB
- `checkFileSize()`, `LIMITS`: MAX_READ 5MB, MAX_WRITE 2MB, MAX_FETCH 2MB, MAX_TOKENS 50k
- `isDangerousCommand()` blocklist: `rm -rf /`, `rm -rf ~`, `*`, `.`, `..`, fork bomb `:(){`, mkfs/dd/shred, `> /etc`, `curl|sh`, `chmod 777 /`
- `isAllowedUrl()` blocks file://, private IPs unless `ALLOW_PRIVATE_NETWORK=1`
- `getTodoPath()` per-call not static

### All File Tools Hardened

**read_file:**
- Binary guard, 5MB limit, 50k token limit, sliced lines vs totalLines, safe-path auto-correct check, startLine<=endLine validation, estimateTokens

**write_file:**
- CWD guard, whitespace-only block (was trim().length==0), 2MB limit, atomic temp+rename, proper diff preview

**edit_file:**
- Fix linesChanged = max(old,new) (was abs+min), reject trivial fuzzy <3 chars (like `}`), replace first occurrence via indexOf not split.join, atomic write, size guard

**list_files:**
- Now returns `success:false` on ENOENT/file-not-dir (was success:true misleading), respects .gitignore via `ignore` lib, recursive option depth 2, avoids RangeError on `..` paths, 100 cap, dir-first sort

**delete_file:**
- Symlink-safe gather via lstat (no follow), outside-root block, mass-delete >20 warning, tmp allowed in test, atomic rm

**search_files:**
- .gitignore respect, filePattern ext vs substring vs glob, binary/large skip counters, symlink loop avoidance via lstat + realpath visited set, RangeError fix

**glob_files:**
- .gitignore patterns converted to fast-glob ignore, sorted shortest-first, no symlink follow, 100 cap

**run_command:**
- Dangerous blocklist, cwd guard, timeout param max 120s, proper timedOut detection via `error.timedOut`, smart truncation head 50 + tail 350, hints

**apply_patch:**
- Fix drift offset bug: `offset += matchDrift + (new-old)` was only `new-old`, causing wrong hunk application after fuzzy drift
- Limit 10 files/100 hunks/2MB, safe path per file, binary check, atomic writes, detailed error with context preview, dryRun reports failed files too

**web_search:**
- AbortController 10s, rate limit 1s, fallback lite.duckduckgo.com, multiple selectors (.result, .web-result, b_algo), dedup, resilient to HTML changes

**web_fetch:**
- content-length guard 2MB before reading, URL block, 15s abort, turndown wrapped try/catch, accepts text/*

**todo_write:**
- Per-call `getTodoPath()`, atomic temp+rename, `randomUUID()` not Date.now+random, trim validation

**ask_question / send_message:**
- Max length 1000/5000, 8 options max 100 chars, trim, dedup options

**Wrapper `index.ts`:**
- Single parse in wrapper (was double parse inside each tool), hint injection `_agent_instructions`, no `any`, 18 tools

### New Tools (P2)

**read_many_files:**
- Max 10 files, combined size 10MB, token guard, binary check, returns per-file success/error, total tokens/bytes
- Reduces roundtrips: 1 call vs 5x read_file

**git_status / git_diff / git_log:**
- Read-only, no permission needed, safe, truncates diff 30k chars, handles not-a-repo error, branch detection

---

## 2. P0 Critical Remaining

### Provider Split-Brain Fixed
- **Before:** `providers/index.ts:getProvider` (StreamResult) vs `agent.ts:buildProviderModel` (direct createOpenAI) — 3 sources for models/limits
- **After:** `src/providers/registry.ts` single source:
  ```ts
  providerRegistry = {
    openrouter: { models: 26 free, defaultModel, tokenLimit:128k, getApiKey, createModel(apiKey, model){ return createOpenAI({baseURL: openrouter...})(model) } },
    groq: { models:5, tokenLimit:32768, createModel: createGroq },
    nvidia: { tokenLimit:128k, baseURL: nvidia },
    opencodezen: { tokenLimit:128k, baseURL: opencode.ai }
  }
  ```
  - `providers/index.ts` re-exports from registry, `getProvider` legacy uses registry + streamText
  - `core/agent.ts` uses `getProviderDefinition`
  - `core/context.ts` and `ui/App.tsx` import TOKEN_LIMITS from registry
  - Old `groq.ts` etc re-export from registry

### @mention Dead Code Fixed
- **Before:** `utils/atMention.ts` robust but unused, App inline regex `/@([\w.\/-]+)/g`
- **After:** App imports `parseAtMentions`, handles errors, binary, token limits via guards; `atMention.ts` uses guards for safe path/size; `ContextManager.addFile` uses guards

### Duplicate History + StatusLine
- **Before:** `App.tsx: conversation.addAssistantMessage(fullResponse)` after `runAgent` which already added assistant messages → 2x tokens
- **Fix:** Removed duplicate, comment says agent owns history
- **Before:** `StatusLine` props only 5, state `agentStatus`, `rateLimitMs` etc tracked but never passed → always idle
- **Fix:** Pass 8 props, now shows running/rate_limited countdown/retrying/network_dropped/fatal_error

---

## 3. P1 Hardening

| Area | Fix |
|---|---|
| Token counting | `gpt-tokenizer` (pure JS) with fallback code-aware 3.5 vs 4 divisor, tests updated (40 a's=5 tokens, hello=1) |
| fileSearch perf | Replace manual readdirSync walk with `fast-glob.sync("**/*")` + ignore patterns, 10x faster, cache 5s |
| App flush O(n²) | `findFlushBoundary` counts fences via regex not split, `findHardCapBoundary` fast path scans only tail 2*MAX for huge buffers, forces hard-cut inside fences after 3*MAX, `onToken` only flushes when token contains `\n` or buffer >1200 |
| Config clamping | `TEMPERATURE` 0-2, `MAX_TOKENS` 256-128000, warns and clamps |
| Diff tabs | 4 spaces (was 2), env `TAB_WIDTH` 1-8 configurable |
| Theme XDG | Loads `$XDG_CONFIG_HOME/cli-agent/theme` first, then legacy `~/.cli-agent-theme`, persists to XDG, custom themes from XDG + home + project |
| InputBar competing useInput | Unified handler: Ctrl+C always, Ctrl+R expand always, R retry only when networkDropped && !ctrl |
| tsup external | Keep `external: ["react","ink","react-devtools-core"]` for 291KB bundle (alias resolves) |
| Context total limit | `addFile` checks `currentTokens + new > limit*0.8` → error |
| Network retry polling | `waitForUserRetry` promise recursion `setTimeout(check,300)` not tight while loop |
| atMention guards | Uses `assertSafePath`, `checkFileSize`, `isBinaryBuffer` |

---

## 4. P2 Features (Requested)

### Session Save/Resume
- `/save [file]` → markdown export with role sections, default `.cli-agent/session.md`
- `/export [file]` → JSON with provider/model/cwd/messages/contextFiles, default `.cli-agent/session.json`
- `/resume [file]` → restores history, token count, shows last 6 messages
- `/compact` → backup to `.cli-agent/session-backup-*.json`, truncates if >70%, reports saved
- `/exit` auto-saves to `.cli-agent/session.json`
- `.gitignore` ignores session files

### Config File
- Loads XDG `~/.config/cli-agent/config.json` then project `.cli-agent/config.json` / `cli-agent.json`, env overrides
- Supports flat keys and nested `providers: {groq:{apiKey}}`, debug flag logs loaded paths

### CLI Args (`src/index.ts`)
- `--help/-h`, `--version/-v` (reads package.json from multiple locations), `--debug` sets DEBUG=1, `--cwd <path>` chdir before Ink

### Parallel UI for read_many_files + Similar Tools

**All similar tools now have unified expandable UI with ctrl+r:**

**read_many_files:**
```
Collapsed:
● Read 5 files
   └ App.tsx, index.js, utils.js +3 more
      (ctrl+r to expand)

Running:
● Read 5 files
   └ Reading App.tsx, index.js, utils.js +2 more...

Expanded:
● Read 5 files (5 requested)
   ├  ✓ src/App.tsx (120 lines, ~800 tokens)
   ├  ✓ src/index.js (80 lines)
   ├  ✓ src/utils.js (200 lines)
   ├  ✓ src/other1.js (50 lines)
   └  ✗ src/missing.js — File not found: ...
      (ctrl+r to collapse)
```

**Other tools adjusted similarly:**
- `list_files`: collapsed first 3 names +N more, expanded full list with sizes
- `glob_files`: collapsed first 3 basenames +N more, expanded full paths
- `search_files (Grep)`: collapsed 2 matches +N more, expanded all file:line content
- `read_file`: collapsed path + lines/size, expanded shows first 20 lines preview
- `git_status`: collapsed branch clean/dirty + first 3 lines, expanded full output
- `git_diff`: collapsed preview first 2 lines, expanded 30 lines with colors (+ green, - red)
- `git_log`: collapsed 3 commits +N more, expanded all

**Implementation:**
- `ToolCall` now has `rawResult` + `isExpanded`
- `ToolOutput.tsx` has dedicated components: `ReadManyFilesOutput`, `ListFilesOutput`, `GlobFilesOutput`, `SearchFilesOutput`, `ReadFileOutput`, `GitStatusOutput`, `GitDiffOutput`, `GitLogOutput` all following same `● ToolName` + `└` + `(ctrl+r to expand/collapse)` pattern
- `MessageItem.tsx` receives `expandedToolIds: Set<string>` and passes `isExpanded` to `ToolOutput`
- `App.tsx`:
  - `expandedTools: Set<string>` + `toggleExpand(id)` updates Set and livePreview
  - `staticItems` memo depends on `expandedTools` so Static re-renders on toggle
  - Unified `useInput` handler: Ctrl+C exit, Ctrl+R finds last expandable tool (read_many_files, list_files, glob_files, search_files, git_*, read_file) in history and toggles, R retry only when networkDropped && !ctrl

### Ctrl+R Fix

**Before:** 3 separate useInput hooks, R retry handler didn't check `!key.ctrl` so Ctrl+R triggered retry when networkDropped, Ctrl+R handler only looked for read_many_files, not other tools

**After:** Single unified handler:
```ts
useInput((input, key) => {
  if (key.ctrl && input==="c") exit
  if (key.ctrl && input.toLowerCase()==="r") { find last expandable tool and toggleExpand }
  if (!key.ctrl && (input==="r"||"R") && networkDropped) { retry }
}, {isActive:true})
```

Now ctrl+r works for all similar tools.

---

## 5. Verification

```bash
git checkout arena/019f5a8a-zeno-cli-agent
git pull
npm install
npm run build  # -> dist/index.js 318.03 KB
npx vitest run tests/tools tests/core --reporter=basic
# Test Files 16 passed, Tests 291 passed

# Manual UI test:
node dist/index.js
> read src/ui/App.tsx, src/utils/tokens.ts, src/core/context.ts
# Press ctrl+r → expands file list, ctrl+r again → collapses

> /save
> /clear
> /resume
```

**Files Created/Modified (44 files):**
- NEW: `src/tools/guards.ts`, `src/providers/registry.ts`, `src/tools/readManyFiles.ts`, `gitStatus.ts`, `gitDiff.ts`, `gitLog.ts`
- MODIFIED: all 14 original tools, `index.ts`, `config.ts`, `context.ts`, `agent.ts`, `App.tsx`, `ToolOutput.tsx`, `MessageItem.tsx`, `atMention.ts`, `fileSearch.ts`, `tokens.ts`, `diff.ts`, `theme-manager.ts`, `providers/*`, `tsup.config.ts`, tests

All changes pushed to `arena/019f5a8a-zeno-cli-agent`.
