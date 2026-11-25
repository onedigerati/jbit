# Stage 2 review: Antigravity adapter + package

Reviewer: a fresh agent that built none of stage 2 (jbit:review, with the security pass). Date: 2026-11-25.

Scope: the uncommitted `git diff` (hosts/build.mjs, build.test.mjs, codex/hook.mjs, core/dispatch.mjs, the regenerated
codex/copilot copies), untracked `hosts/antigravity/`, `hosts/parity/antigravity.test.mjs` and `plugins/jbit-antigravity/`,
plus the PLAN.md diff and its 2026-11-25 decisions. Ground truth: `docs/research/antigravity-spike-2026-11.md`, plus
the live tool list in `docs/evidence/stage-1/hooks-deny/07-deny-write_file.txt` (`init.tools`).

How it was checked: read hook.mjs, handler.mjs, map.mjs, the build's antigravity paths and the core engine's state
handling; ran `mapTool` directly on crafted inputs (outputs quoted below); ran
`node --test hosts/antigravity/hook.test.mjs hosts/parity/antigravity.test.mjs hosts/build.test.mjs` (107 pass, 0 fail)
and `node hosts/build.mjs antigravity --check` (up to date, no leaks); rebuilt `plan` from SKILL.md + continued.md and
diffed it against the source (only the host substitutions differ, nothing lost or reordered). No live `agy` run.

Counts: fix now 4 · defer 6 · reject 3.

## Fix now

1. **`run_command`'s `Cwd` gets past the home guard.** `hosts/antigravity/map.mjs:262` resolves `args.Cwd` but
   `shell()` (`:242-246`) only passes it to `runsOwnCapture`; `writesProtected` looks at the command text alone. The
   guard already denies `cd <protected> && …`, so the same thing through `Cwd` is a gap, not a choice.
   Failing input: `{"name":"run_command","args":{"CommandLine":"echo {} > sessions/x.json","Cwd":"/home/u/.gemini/antigravity-cli/plugin_data/jbit"}}`
   → `{"kind":"calls",…Bash…}` (allowed; it overwrites the hook's session state, where armed, approvals and the Stop
   count live). Same with `{"CommandLine":"rm -rf plugins","Cwd":"~/.gemini/config"}`.
   Also: a `Cwd` that is present but unreadable (a number, a Windows path) makes `cwd` undefined and the call goes on
   as if none was given. Fix: deny when the resolved `Cwd` is a protected path or under a `.gemini` folder, and deny an
   unreadable `Cwd` (`unreadable(tool, 'no usable Cwd')`). Add both to hook.test.mjs.

2. **`multi_replace_file_content` drops its edits before the core sees them.** `map.mjs:277` builds one `Edit` with
   `old_string`/`new_string` from `Target`/`TargetContent` and `Replacement`/`ReplacementContent`. A multi-replace
   carries its edits in a chunk list, so the core gets `new_string: ''`, and the secret guard and evidence rules see
   no change. `multi_replace_file_content` is in agy's live tool list. Failing input:
   `{"name":"multi_replace_file_content","args":{"TargetFile":"src/a.ts","ReplacementChunks":[{"TargetContent":"a","ReplacementContent":"<AWS documentation example key, removed>"}]}}`
   → one Edit with an empty `new_string` (allowed). Fix: map each chunk to its own Edit call. When `ReplacementChunks`
   (or any array of chunks) is present but unreadable, deny it. The same fallback to `''` lets a `write_file` whose
   `Content` isn't a string through to the core with empty content; deny it as unreadable instead.

3. **Other ways to start an agent are allowed outright, so they get past the `invoke_subagent` hold.** The live
   `init.tools` list includes `browser_subagent`, `define_subagent`, `manage_subagents`, `run_workflow` and `schedule`.
   `map.mjs:285-288` allows any unknown tool whose arguments have no path-like key. Failing input:
   `mapTool('browser_subagent',{Task:'edit src/login.ts',TaskName:'x'})` → `{kind:'allow'}`, and the same for
   `define_subagent {Name,SystemPrompt}`, `schedule {Prompt,Cron}` and `run_workflow {Name}`. Fix: map these to an
   `Agent` call (prompt from the task or prompt field), or deny them by name. Pin the names with a test against
   `init.tools`.

4. **Subagents run as unarmed sessions, so outward and hold rules don't reach them.** The handler keys the session on
   the subagent's own `conversationId` (`handler.mjs:135`). The spike says a subagent's payload gives no parent link
   (finding 4). The core's outward deny needs `driving()`, which needs `s.armed` (`register.ts:2715`, `:1305`), and
   `held()` needs `s.armed` too (`:1318`). So in an attended or non-`outward` autopilot run, a subagent's
   `run_command {"CommandLine":"git push origin main"}` is allowed, and its edits in a held stage aren't held. On
   Claude Code a subagent shares the parent's session, so this misses the acceptance check "refuses what the Claude
   Code hook refuses … inside subagents". The send_message decision makes it reachable: the parent can message an
   existing subagent to do the work while held. Fix (PM's call on the approach): resolve the parent conversation from
   the subagent transcript's first system message (spike: the only place it appears) and use its session, or fail
   closed on outward commands and held paths when a session has no user input and isn't armed. Add a parity test with
   a second `conversationId`.

## Defer (add to the plan's open questions)

- **Shell obfuscation gets past the guard,** as already deferred for Codex: `rm -rf ~/.gem''ini/antigravity-cli/plugin_data`,
  `~/.gemin?/…` and `D=~/.gem; rm -rf ${D}ini/config` are all allowed (checked with `mapTool`). The acceptance check
  says the Stop count is "kept where an allowed tool can't write it", which is stronger than the guard delivers. The
  same file also holds `armed`, `cleared` and `unattended`. Reword the check, or move the hook's state out of reach
  (for example, outside `$HOME` with no shell-reachable name). Note: holds are already Bash-bypassable on every host.
- **Case on a case-insensitive FS:** `write_file {"Path":"/Users/u/.GEMINI/config/x"}` is allowed (`map.mjs:63`
  regex is case-sensitive). It matches the deferred Codex `~/.CODEX` item. Adding an `i` flag to `protectedPath` and
  `shellNames` would fix it cheaply.
- **Code-running tools in the live list are allowed when their arguments have no path-like key:** `notebook_execution`,
  `execute_browser_javascript`, and `call_mcp_tool` with keys like `source`/`destination`
  (`call_mcp_tool {Arguments:{source:'a',destination:'/home/u/.gemini/config/x'}}` → allow). This is the same family
  as the deferred "commits through scripts" gap. Consider a deny list, or adding `destination|target|dest|uri|location`
  to `PATHY`.
- **Stop cap reset is unproven live:** `stopBlocks` resets on any `PreInvocation` with `invocationNum` 0
  (`handler.mjs:179-181`). If agy restarts `invocationNum` at 0 after a Stop continue, the hook's cap of 8 never binds
  and only agy's own 10 does. Prove this in stage 3 from the hooks-stop transcript.
- **Concurrent hook calls lose updates:** engine `jsonFile` is read-modify-write, then rename, with no lock
  (`hosts/core/engine.mjs:27-31`). Parallel tool calls can drop a notice or a `stopBlocks` increment. Low impact.
- **`/jbit:<skill>` expansion lands in `lastUserInput`:** the spike says the slash form expands the skill body into
  the user input. Typed approvals (`/jbit:approve`) and `/jbit:autopilot …` arrive wrapped in the `<SKILL>` block, so
  the prompt handlers may not read them as the user's command. Verify in stage 3. It fails closed (no approval), not open.

## Reject

- **A fail-open in hook.mjs.** Every PreToolUse path prints an explicit allow or deny. Reasons: `line()` forces a deny
  for anything not `allow`; the write callback exits only after the flush; the watchdog timer keeps the event loop
  alive (a stuck await can't end in silence); `uncaughtException` and `unhandledRejection` deny; and the import of
  the handler sits inside the try. Nothing in core or register writes to stdout or calls `process.exit`.
- **`~`/`$HOME`/relative/`..`/symlink spellings in write_file/edit_file.** `resolveInProject` follows symlinks and
  `..`, and the regex matches any `/.gemini/config`, so `~/.gemini/config/x` relative to the project is denied too.
  Checked with `mapTool`.
- **Skill split losing content.** `plan` rebuilt from SKILL.md (between the two pointers) plus continued.md equals
  the source body apart from the host substitutions. The cut is outside fences at a `## ` heading, and the leak scan
  covers continued.md.
