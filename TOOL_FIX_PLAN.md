# Tool System Fix Plan — All 14 Tools

> Target: `src/tools/` + wrapper `src/tools/index.ts`
> Goal: security hardening, correct error handling, token/context protection, remove dead paths

---

## 0. Shared Foundations (Create First)

### 0.1 Create `src/tools/guards.ts`
Centralize all security & validation currently duplicated in 5 files with slightly different lists.

```ts
// Exports:
export const PROTECTED_DIRS = [...];
export function isProtectedPath(resolvedPath: string): boolean
export function isInsideCwd(resolvedPath: string, cwd = process.cwd()): boolean
export function assertSafePath(inputPath: string): { resolved: string, error?: string }
export function isBinaryBuffer(buf: Buffer): boolean
export function checkFileSizeLimits(filePath: string, maxBytes?: number): { ok, size }
export const LIMITS = { MAX_READ_BYTES, MAX_WRITE_BYTES, MAX_FILE_TOKENS }
export function isDangerousCommand(cmd: string): string[] // returns reasons
```

- `isInsideCwd`: `resolved === cwd || resolved.startsWith(cwd + sep)` — block `../` escapes and absolute `/etc` unless `ALLOW_OUTSIDE_CWD` env.
- `isProtectedPath`: use shared list + regex, plus check `isInsideCwd` first.
- Binary: null-byte scan first 1KB (reuse from `atMention.ts` but central).
- Move `.cli_agent_todos.json` logic to use `path.join(process.cwd(), ...)` per call, not static import.

**Files to edit:** all tools import from this.

### 0.2 Fix Wrapper `src/tools/index.ts`
Current `wrapExecute` does:
- hints injection
- ZodError → self-correcting message

Issues:
- Each tool does `Schema.parse` inside — double parse if wrapper also validates.
- No max tool-call token accounting.
- `any` types for results.
- No runaway tool call detection.

**Fix plan:**
1. Make wrapper responsible for parsing: `wrapExecute(name, schema, fn)` — fn receives already parsed input, no internal parse needed.
2. Remove inner `Schema.parse` from each tool (or keep but wrapper catches second time — decide). Proposal: wrapper parses, tool gets typed input.
3. Add structured logging: `console.debug` gated by `DEBUG_TOOLS` env.
4. Ensure returned object always has `success` boolean.
5. Add `toolCallId` tracing for concurrent calls (future).
6. Remove `any` — use `unknown[]` for results.

**Test:** `tests/tools/*` still pass.

---

## 1. File I/O Tools

### 1.1 `read_file` — `src/tools/readFile.ts`

**Current bugs:**
- No size limit → 200MB log can OOM context
- No binary check → PDF read as utf8 produces garbage tokens
- Fuzzy auto-correct may jump outside cwd (symlinked dir)
- `startLine`/`endLine` no validation (`start > end`, out-of-range)
- Returns `lines: totalLines` even when sliced → confusing for LLM
- No token count returned for context guard (contextManager has 50k token limit elsewhere)

**Fix steps:**
1. Import guards: `assertSafePath`, `isBinaryBuffer`
2. Add `MAX_READ_BYTES = 5MB`, `MAX_READ_TOKENS = 50k` constants.
3. Steps in execute:
   - Resolve & assert safe path (inside cwd + not protected)
   - `stat`, if dir → return dir listing (keep existing good UX)
   - If size > MAX_READ_BYTES → return error with suggestion to use `read_file` with line range or `search_files`
   - Read as Buffer first, check `isBinaryBuffer` → return error with hint
   - Then to string, apply line slicing
   - Validate `startLine <= endLine`, clamp to file length
   - Compute `lines` as sliced length, `totalLines` separate, `tokens` via `countTokens`
   - If tokens > MAX_FILE_TOKENS → return error or truncate hint
4. Auto-correct path: ensure corrected path also passes `assertSafePath`
5. Keep suggestions.

**Tests:** Add case for binary file, oversize, out-of-range lines.

### 1.2 `write_file` — `src/tools/writeFile.ts`

**Bugs:**
- Protected check regex only, no cwd boundary
- `!content.trim()` blocks whitespace-only valid files (e.g., empty `__init__.py`? Actually should allow but warn)
- Diff preview only shows `+ new lines`, not actual diff for overwrites
- No size limit
- `fs.mkdirSync` sync, no symlink loop guard on parent

**Fix:**
1. Use `assertSafePath`
2. Change empty guard: `content.length === 0` → error, but allow whitespace with warning hint.
3. Add `MAX_WRITE_BYTES = 2MB`, if over → error suggest chunking or `apply_patch`.
4. Diff preview: reuse `getPatchFromContents` (already imported but uses preview of `+` lines only). Switch to structured diff for overwrites: show hunk summary.
5. Ensure parent mkdir: check each segment not a file (keep ENOTDIR handling) + ensure parent not symlink escaping cwd.
6. Keep permission prompt but include bytes + lines more accurate.

### 1.3 `edit_file` — `src/tools/editFile.ts`

**Bugs:**
- `linesChanged` formula: `Math.abs(old-new)+min(old,new)` → overcounts. Example: replace 3 lines with 3 lines → reports 3, should be 3. Replace 1 line with 5 → reports 5? Actually `abs(1-5)=4 +1=5` correct by accident but for 5→1 => 5 too. Need proper: `Math.max(oldLines, newLines)` or changed count.
- Fuzzy matching may match multiple identical trimmed lines (e.g., `}`) — needs stricter context.
- No binary check.
- `split().join()` replaces all occurrences after validation of 1 — but validation uses regex count which may differ from split count due to overlapping? Safer to replace first occurrence only.

**Fix:**
1. Use guards for safe path + binary.
2. Fix `linesChanged = Math.max(oldLines, newLines)` or compute diff hunk lines.
3. Improve fuzzy: require at least 2 lines context or non-trivial line >10 chars? Keep but add heuristic: if searchString is single char like `}` or trimmed length <3, reject fuzzy and require exact.
4. Replace using index: find index of `actualSearchString`, splice, not `split.join`. So only first.
5. Keep auto-correct flag but log.
6. Add token limit for new file size.

### 1.4 `list_files` — `src/tools/listFiles.ts`

**Bugs:**
- Returns `success:true` on ENOENT → misleads LLM into thinking empty dir.
- No recursion flag but agent may need to explore depth 1 only; spec says top-level but useful to allow `recursive` option.
- Doesn't respect `.gitignore` (fileSearch does via `ignore` lib, but list_files doesn't).
- No cwd check.

**Fix:**
1. Use `assertSafePath`, return `{success:false, error}` on ENOENT.
2. Add `recursive?: boolean, maxDepth?: number` optional schema (default false).
3. If existence check passes, if not directory → return error hint suggesting `read_file`.
4. Respect `ALWAYS_IGNORE` + `.gitignore` optionally; at least hide `node_modules/.git`.
5. Return `total` count even when truncated, so LLM knows there are more.
6. Keep dir-first sort.

### 1.5 `delete_file` — `src/tools/deleteFile.ts`

**Bugs:**
- `gatherPaths` recursive walk follows symlinked dirs → can delete outside cwd.
- Blocks exact cwd but `path.resolve('../repo')` from subfolder may still be parent of project that contains project? Should block any path outside cwd.
- No file count limit confirmation; deleting 500 files with recursive should need extra warning.

**Fix:**
1. Use `assertSafePath` + `isInsideCwd` strict.
2. `gatherPaths`: don't follow symlinks (check `lstat` not `stat` for dir, if symlink skip or include only link itself).
3. If `deletedPaths.length > 20`, add extra detail in permission prompt: list first 20 + count.
4. Keep dryRun logic but ensure gathered before permission.
5. Add to gitignore protection: never delete `.git/` subfolders even if not in protected? Actually protected list includes .git, but `a/.git/config` regex already blocks — keep.
6. After delete, clear fileSearch cache.

### 1.6 `apply_patch` — `src/tools/applyPatch.ts`

**Bugs:**
- `getRealPath` strips `a/`/`b/` but doesn't handle absolute `/` or Windows paths.
- Offset drift: after fuzzy match, offset should be adjusted by `(matchIndex - targetStart) + (newLines - oldLines)`, currently only `new-old`.
- No limit on number of files in one patch (could be 100 files).
- Permission details only show applied, not failed reasons.
- No binary check.

**Fix:**
1. Use guards for safe path per file.
2. Limit: max 10 files per patch, max 100 hunks.
3. Fix offset: newOffset = oldOffset + (matchIndex - targetStart) + (newLines - oldLines)
4. Better error messages: include expected line preview when match fails.
5. Validate patch not empty.
6. Ensure creation path parent dirs created inside cwd.
7. Add checksum: read file content before write to ensure not changed between validation and write (TOCTOU).
8. Keep dryRun but return full file list with errors.

---

## 2. Search / Discovery Tools

### 2.1 `search_files` — `src/tools/searchFiles.ts`

**Bugs:**
- Sync recursive walk blocking UI thread.
- No symlink loop detection.
- `filePattern` uses `includes` — `".ts"` matches `".test.txt"` incorrectly.
- No respect for `.gitignore` beyond IGNORED_DIRS.
- No binary skip hint count.
- Regex escape manual but incomplete.

**Fix:**
1. Make walk async? For now keep sync but use iterative stack + `lstat` to avoid symlink dirs.
2. Fix `filePattern`: if starts with `.` treat as extension via `extname`, else glob via `minimatch` or simple `includes` but documented.
3. Load `.gitignore` using `ignore` lib like `fileSearch.ts` does.
4. Track skipped binary/oversized files count, add to hints.
5. Use proper escape: import `escapeRegExp` util.
6. Add `maxResults` configurable default 50, but expose in output.
7. Ensure searched dir inside cwd via `assertSafePath`.

### 2.2 `glob_files` — `src/tools/globFiles.ts`

**Bugs:**
- Uses `fast-glob` async (good) but others sync → inconsistent API still Promise.
- Ignores only hardcoded list, not `.gitignore`.
- MAX_FILES 100 but no sorting; results random order.

**Fix:**
1. Use shared `ALWAYS_IGNORE` + `.gitignore` patterns, merge with fast-glob `ignore`.
2. Ensure cwd validated.
3. Sort results alphabetical, shortest path first (like fileSearch).
4. Keep total count.

---

## 3. Execution Tool

### 3.1 `run_command` — `src/tools/runCommand.ts`

**Bugs:**
- `shell: "/bin/sh"` allows `; rm -rf /`
- Timeout detection via string includes fragile.
- No cwd validation.
- No env isolation.
- Hints detection lowercased but may miss.

**Fix:**
1. Add `isDangerousCommand` in guards: blocklist regexes:
   - `rm -rf /`, `rm -rf ~`, `:(){`, `mkfs`, `dd if=`, `>.*\/etc`, `curl.*|.*sh`, `wget.*|.*sh`
   - Return error with hint: "Command looks destructive. Rephrase or use safer alternative."
2. Validate cwd via `assertSafePath`.
3. Make timeout configurable: add optional `timeout` schema field default 60000 max 120000.
4. Use `execa` `timeout` correctly: catch `isTimeout` property.
5. Improve truncation: keep first 20 lines + last 400? Current 50+350 good but make sure error lines (stderr) kept.
6. Move hints logic to separate file `commandHints.ts`.
7. Add `stdout`/`stderr` combined length limit.

---

## 4. Web Tools

### 4.1 `web_search` — `src/tools/webSearch.ts`

**Bugs:**
- Hardcoded DuckDuckGo HTML selectors fragile
- No timeout / abort
- No retry

**Fix:**
1. Add AbortController 10s.
2. Add fallback parsing: try multiple selectors `.result`, `.web-result`, fallback to regex.
3. Add second source via `https://lite.duckduckgo.com/lite/?q=` as fallback if first fails.
4. Ensure query length limit 200 chars.
5. Rate limit: debounce 1s between searches (in-memory lastSearch time).
6. Return hints on 0 results.

### 4.2 `web_fetch` — `src/tools/webFetch.ts`

**Bugs:**
- Reads entire body before content-type check could OOM
- Turndown may throw
- Strips `header` which may contain useful article title
- No size limit pre-download (stream?)

**Fix:**
1. Check `content-length` header first, reject if > 2MB.
2. Use `response.text()` but with size guard after fetch; if too large truncate with warning.
3. Wrap cheerio + turndown in try/catch.
4. Accept `text/*` and `application/json`, not just html.
5. Keep current main content heuristics but add fallback to `body` if main empty.
6. Add abort 15s already exists — keep.
7. Validate URL: block `file://`, `localhost`, private IP ranges optionally.

---

## 5. Coordination Tools

### 5.1 `todo_write` — `src/tools/todoWrite.ts`

**Bugs:**
- Static TODO_FILE path
- Sync read/write no lock → corruption if parallel tool calls
- ID collides

**Fix:**
1. Function `getTodoPath()` calling `process.cwd()` each time.
2. Use `crypto.randomUUID()` instead of Date.now+random.
3. Use `fs.readFileSync` inside try but on write use atomic: write to temp then rename.
4. Add file lock simple: if file being written, retry 3 times with 50ms delay.
5. Add max title length 200, validate.
6. Ensure file in `.gitignore`.
7. Add schema for `clear` action? Keep list/add/update/delete but make `list` default if no action? Existing requires action.

### 5.2 `ask_question` + `send_message`

**Bugs:**
- No length limits
- `ask_question` returns hints instructing LLM not to call tools — but LLM may still call; agent.ts correctly pauses but relies on flag. Need ensure App handles pause even if extra tool calls sneaked before pause? Agent already breaks immediately after detecting flag, but if LLM emits `ask_question` + other tools same turn, other tools executed? Current code: tool loop iterates sequentially; after ask_question detected it returns immediately without executing remaining tools. Good but should warn.
- `send_message` with `ends_turn:true` also breaks loop but similar.

**Fix:**
1. Add `MAX_QUESTION_LENGTH = 1000`, `MAX_MESSAGE_LENGTH = 5000` validation in schema via `.max()`.
2. Ensure `options` max 8, each max 100 chars.
3. In `agent.ts`, when `ask_question` found, discard remaining pendingToolCalls and return — already does but add log.
4. Ensure conversation history gets question as assistant message? Currently agent returns and App shows pendingQuestion UI; need to add assistant message containing question to history?
5. Add dedup: if question same as last asked, error.

---

## 6. Implementation Order (Suggested PR Breakdown)

**PR 0: Shared Guards**
- Create `src/tools/guards.ts` with `assertSafePath`, `isProtected`, `isBinary`, `isDangerous`
- Update `.gitignore` add ` .cli_agent_todos.json`, ` .cli-agent/`
- Add tests for guards

**PR 1: Wrapper & Registry**
- Refactor `wrapExecute` signature
- Remove inner `Schema.parse` duplication
- Add tests

**PR 2: File I/O**
- read_file, write_file, edit_file, list_files fixes
- Add size limits tests

**PR 3: Delete & Patch**
- delete_file symlink safe
- apply_patch offset fix + file limit

**PR 4: Search**
- search_files + glob_files .gitignore respect + filePattern fix

**PR 5: Run & Web**
- run_command dangerous check + timeout field
- web_search timeout + fallback
- web_fetch content-length guard

**PR 6: Coordination**
- todo_write atomic + uuid
- ask_question/send_message length limits

**Each PR:** run `npm run test:unit` + manual `node dist/index.js` smoke with `/add` and tool calls.

---

## 7. Testing Strategy per Tool

- Unit tests exist in `tests/tools/*.test.ts` — extend them.
- Add new test files: `guards.test.ts`
- For each tool:
  - happy path
  - protected path blocked
  - outside cwd blocked
  - binary file rejected
  - oversize rejected
  - symlink handling
- For `run_command`: dangerous command blocked
- For web: mock fetch with undici mock or msw, test timeout fallback

---

## 8. Definition of Done for This Milestone

- [ ] `guards.ts` exists with 100% coverage of path checks
- [ ] All 14 tools pass `assertSafePath`
- [ ] No tool allows writing outside cwd unless `ALLOW_OUTSIDE_CWD=1`
- [ ] Binary files never read as utf8
- [ ] Size limits enforced (5MB read, 2MB write)
- [ ] `list_files` returns error on ENOENT not success
- [ ] `edit_file` linesChanged accurate
- [ ] `apply_patch` offset fixed
- [ ] `search_files` respects `.gitignore`, filePattern ext handled
- [ ] `run_command` blocks destructive patterns
- [ ] web tools have timeouts
- [ ] `todo_write` atomic + uuid, no static path
- [ ] Wrapper no longer double-parses
- [ ] `npm run test:unit` passes
- [ ] Manual E2E: create file, edit file, search, glob, run command, delete, patch all work in built CLI

---

Want me to start with PR 0 — shared guards?
