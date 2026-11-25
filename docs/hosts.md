# JBIT on other hosts

JBIT is authored for Claude Code in `plugins/jbit/`. `node hosts/build.mjs <host>` generates self-contained packages for three other CLI hosts—each with the same skills (plus a host-specific tool-mapping section) and the hook ported to a Node command script:

- `plugins/jbit-copilot/` — GitHub Copilot CLI
- `plugins/jbit-codex/` — OpenAI Codex CLI
- `plugins/jbit-antigravity/` — Google Antigravity CLI (`agy`)

## Shared requirements and limits

Because these three hosts run JBIT's hook as a per-event command rather than an in-process hook, they share a common set of differences from Claude Code:

- **Node 22.18 or later.** The hook executes the TypeScript modules from `plugins/jbit/hooks/` using Node's built-in type stripping; older Node versions can't load them and guarded tool calls fail closed.
- **No cross-event in-memory state.** Each hook event is a fresh process, so there is no in-memory stall counter, `lean` running-agent count, or background-agent list, and the reopen check runs before a commit lands rather than after. Autopilot carry-on is bounded at 8 continues per prompt instead.
- **No hook-driven compaction or worktree isolation.** These hosts manage their own context and don't provide per-subagent worktree isolation, so parallel builders must own separate files or run one at a time.
- **Reviews and hook wording.** `/code-review` and `/security-review` are Claude Code built-ins, so reviews run through subagents briefed with the same lenses. Hook messages still use Claude Code tool names (`Agent`, `Edit`, `Write`); each generated skill appends a mapping section translating them.

---

## GitHub Copilot CLI

### Install

```
copilot plugin marketplace add onedigerati/jbit
copilot plugin install jbit@jbit-local
```

From a local clone, use `copilot plugin marketplace add /path/to/jbit`. Copilot reads `.github/plugin/marketplace.json`, so it installs `plugins/jbit-copilot/` rather than the Claude package.

### Usage

- Invoke skills as `/jbit:plan`, `/jbit:stage`, `/jbit:autopilot`, and so on. Bare `/plan`, `/review`, and `/autopilot` are Copilot's own commands.
- For headless runs (`copilot -p`) that take screenshots, allow the plugin folder with `--add-dir <plugin folder>` so Copilot can run the verify skill's `capture.mjs`.

### Known gaps

<!-- copilot-gaps:start: generated from hosts/copilot/capability.json by node hosts/build.mjs copilot; don't edit -->
- **Stall detection.** Each hook event is a fresh process, so nothing counts repeated turn ends; Copilot's cap of 8 agentStop blocks per prompt bounds the loop instead.
- **Lean's count of agents already running.** The Claude hook keeps it in memory across events; a command hook has no running process to keep it in.
- **Tracking background agents.** Same reason: no in-memory agent list between events.
- **The reopen check after a commit.** It runs before the commit lands, since there's no in-memory state carried to the next event.
- **The guard on `edit` and `create`.** Covered on their documented shape with fixture tests only: no model this account offers writes through them, so no live run proved them. `bash` and `apply_patch` are proven.
- **Long unattended runs under `copilot -p`.** agentStop gets 8 blocks per prompt, so an unattended run stops quietly at its 9th turn end; use Copilot's --autopilot or prompt again.
- **Typed `/plan`, `/review`, `/autopilot`.** They are Copilot's own commands; type `/jbit:plan`, `/jbit:review`, `/jbit:autopilot`.
- **Node older than 22.18.** The hook runs the Claude hook's TypeScript through Node's type stripping; an older Node can't load it, so guarded tool calls are refused.
- **`/code-review` and `/security-review`.** They are Claude Code built-ins; on Copilot the review runs as a `task` agent (`code-review`, `security-review`) or a fresh agent with the same lenses.
- **Worktree isolation for parallel builders.** Copilot's `task` has none, so parallel builders must own separate files or run one at a time.
- **Compacting the context before autopilot carries on.** Copilot gives a command hook no context gauge and no compact call (the shim reports 0% and skips compaction); Copilot manages its own context.
- **The stage hold and the secret guard inside a `task` subagent.** Only the commit gate was proven inside a subagent; in the runs meant to test the hold and the secret guard there, the model declined to delegate, so those two are unproven in a subagent.
- **A hook that hangs or prints junk.** Copilot refuses a call when a preToolUse hook exits non-zero, but lets the call run when the hook prints something other than JSON or outlasts its 30-second timeout. The shipped hook prints only JSON and refuses by its own 25-second watchdog, so this bites only if the hook's event loop blocks.
- **The hook's own messages.** They are the Claude hook's words and name Claude tools (Agent, Edit, Write); each skill's mapping section translates them.
- **Running the screenshot script headless.** Skills name it as `<verify skill folder>/scripts/capture.mjs`; the model sees the skill's folder and runs the installed script, and a headless run (`copilot -p`) is denied running a file outside the project unless it allows the plugin's folder with `--add-dir <plugin folder>`. Per Copilot's docs, an interactive session asks for the path instead, and `--allow-all-paths` also allows it.
<!-- copilot-gaps:end -->

---

## OpenAI Codex CLI

### Install

```
codex plugin marketplace add onedigerati/jbit
codex plugin add jbit@jbit-local
```

From a local clone, use `codex plugin marketplace add /path/to/jbit`. Codex reads `.agents/plugins/marketplace.json`, so it installs `plugins/jbit-codex/`.

### Trust the hooks first

Codex runs a plugin's hooks only once you trust them: at startup choose **Trust all** when prompted ("Hooks need review"), or review them in `/hooks`. Repeat this after every JBIT update, which silently clears trust. Until trusted, no plan context is injected and no gates run. Trusted hooks run outside Codex's sandbox.

### Usage

- Invoke skills as `$jbit:<name>` (`$jbit:plan`, `$jbit:stage`, `$jbit:autopilot`). A typed `/jbit:plan` is plain text to Codex. The hook treats a leading `$jbit:autopilot` or `$jbit:approve` as the typed command.
- Headless: run `codex exec "<prompt>" < /dev/null` from the project (without `< /dev/null`, it waits on stdin). Under `--sandbox workspace-write`, `.git` is read-only, so pass `-c 'sandbox_workspace_write.writable_roots=["<project>/.git"]'` to allow stage commits. Use `--dangerously-bypass-hook-trust` in CI only.

### Known gaps

<!-- codex-gaps:start: generated from hosts/codex/capability.json by node hosts/build.mjs codex; don't edit -->
- **Hooks need trusting after every install and update.** Codex runs a plugin's hooks only once the user trusts them, at startup ("Hooks need review", then "Trust all") or through `/hooks`, and every JBIT update voids that trust silently. Until they're trusted again, JBIT has no `## Now` in context, no gates and no carry-on, and nothing says so; `codex exec` skips untrusted hooks without a warning. Trusted hooks run outside the sandbox.
- **A hook killed on timeout.** A PreToolUse hook that Codex kills on its 30-second timeout lets the call run. The shipped hook refuses by its own 25-second watchdog first, and refuses when its own modules fail to load, so this bites only if the hook's event loop blocks.
- **Stall detection and other in-memory state.** Each hook event is a fresh process, as on Copilot, so nothing counts repeated turn ends; the hook's own cap of 8 Stop blocks per prompt bounds the loop instead, and an unattended `codex exec` run stops quietly when it's reached. Prompt again to carry on.
- **Lean's count of agents already running.** The Claude hook keeps it in memory across events; a command hook has no running process to keep it in.
- **Tracking background agents.** Same reason: no in-memory agent list between events.
- **The reopen check after a commit.** It runs before the commit lands, since there's no in-memory state carried to the next event.
- **A `## Now` longer than 40 lines.** JBIT passes at most 40 lines of `## Now` into context, as on Claude Code: a longer one reaches the model cut at its 40th line. Keep `## Now` short.
- **The brief of a `spawn_agent` call.** Codex hands the hook the brief (`message`) encrypted, so no check can read it. The stage hold and the Models line still apply to the call; nothing that needs the brief's words does.
- **Some tool calls inside `spawn_agent` children.** The hooks fire for `Bash` and `apply_patch` calls a subagent makes, but whether they fire for its `write_stdin` and MCP tool calls is unproven.
- **Writes through the shell in a held stage.** The hold refuses `apply_patch` and builder agents, but a file written by a shell command (`echo > file`, `sed -i`) isn't held, on any host: the hook can't tell a build step from a read in a shell line.
- **The `$CODEX_HOME` guard.** Writes under `$CODEX_HOME` or a `.codex` folder are refused through `apply_patch` and through shell commands that name the folder, but the shell check is best-effort: a command that reaches the folder without naming it isn't caught.
- **Case-insensitive file systems.** The guard compares paths case-sensitively, so on a case-insensitive file system (macOS, Windows) a write to `.Codex/` or to `$CODEX_HOME` spelled in another case can slip past it.
- **No role agents.** A Codex plugin can't register agents, so the package ships none; builders, verifiers and reviewers are plain `spawn_agent` calls briefed with the role.
- **`CLAUDE.md` loaded at startup.** Codex loads `AGENTS.md`, not `CLAUDE.md`; the skills tell the model to read `CLAUDE.md` itself.
- **Typing `/jbit:<name>`.** Codex recognises a skill only as `$jbit:<name>` (for example `$jbit:autopilot`). A typed `/jbit:plan` or `$plan` reaches the model as plain text, which may still find the skill from its description, with no guarantee. The hook reads a leading `$jbit:autopilot` or `$jbit:approve` as the typed command.
- **Node older than 22.18.** The hook runs the Claude hook's TypeScript through Node's type stripping; an older Node can't load it, so guarded tool calls are refused.
- **`/code-review` and `/security-review`.** They are Claude Code built-ins; on Codex the review runs as a fresh `spawn_agent` briefed with the same lenses.
- **Worktree isolation for parallel builders.** Codex's `spawn_agent` has none, so parallel builders must own separate files or run one at a time.
- **Compacting the context before autopilot carries on.** Codex gives a command hook no context gauge and no compact call; Codex manages its own context.
- **The hook's own messages.** They are the Claude hook's words and name Claude tools (Agent, Edit, Write); each skill's mapping section translates them.
- **Screenshots inside the workspace-write sandbox.** In a `codex exec` run under `--sandbox workspace-write`, Chromium could not start (it aborted at launch with `shutdown: Operation not permitted`), so `capture.mjs` stopped with "The browser would not launch"; with the sandbox off (`--dangerously-bypass-approvals-and-sandbox`) the same script took the screenshot. So run it outside the workspace-write sandbox (with Codex's approval, or a full-access sandbox such as `--sandbox danger-full-access`). Finding the script works: the model fills `<verify skill folder>/scripts/capture.mjs` from the `SKILL.md` path Codex lists for the skill.
<!-- codex-gaps:end -->

---

## Google Antigravity CLI

### Install

```
agy plugin install /path/to/jbit/plugins/jbit-antigravity
```

Install by the package path, **never** the repo root: from the root, `agy` bulk-installs every `plugins/*` folder and same-named packages overwrite each other. There is no marketplace file for Antigravity.

### Usage

- Invoke skills as `/jbit:plan`, `/jbit:stage`, `/jbit:autopilot`, and so on, or use `JBIT …` command words as on Claude Code. Bare `/plan` isn't expanded.
- Screenshots come from JBIT's capture script only (Antigravity's browser tools need an interactive Chrome remote-debugging approval).

### Headless runs and allow rules

`agy`'s sandbox can't reach a local dev server, so run with `--mode accept-edits`, where every shell command prompts for approval. A headless run (`agy -p`) can't prompt and denies any command not covered by an allow rule. Pass a narrow per-run allow list with `--settings` (replacing `/home/you` with your home directory):

```
agy -p "/jbit:stage" --mode accept-edits --settings jbit-agy.json
```

```json
{"permissions":{"allow":[
  "command(node /home/you/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs)",
  "command(git status)","command(git diff)","command(git log)","command(git show)","command(git add)",
  "command(git commit)","command(git check-ignore)","command(git rev-parse)",
  "command(ls)","command(cat)","command(head)","command(tail)","command(wc)","command(find)","command(grep)",
  "command(mkdir)","command(test)","command(echo)","command(pwd)","command(date)"
]}}
```

Each rule matches only the command's leading words; `agy` checks each segment of `a && b` separately and still prompts before file redirects or `$(…)`, so `git push` and `node -e '…'` stay blocked in headless runs. Avoid broad rules like `command(git)` or `command(node)` (which allow `git push` and `node -e` unprompted outside the sandbox) and avoid `regex:` rules (which match the whole line and can let chained commands through). `--settings` applies to one run; placing the same list in `~/.gemini/antigravity-cli/settings.json` applies globally.

### Known gaps

<!-- antigravity-gaps:start: generated from hosts/antigravity/capability.json by node hosts/build.mjs antigravity; don't edit -->
- **A hook that prints nothing.** agy runs a tool call when its PreToolUse hook prints nothing. The shipped hook prints an explicit allow or deny on every path, a crash, bad input, an unknown event and an old Node included, and its 25-second watchdog answers before agy's 30-second timeout.
- **A subagent's calls judged in its parent's session, when linked.** agy's payload marks no subagent and names no parent: the hook reads the parent from agy's own first message in the subagent's transcript (or its message files) and judges the subagent's calls in the parent's session, as Claude Code does. When it can't link one, it judges the calls as armed, attended, with no stage approved, the strictest any session could be. A held stage still refuses `invoke_subagent` itself, so no subagent starts while a stage is held.
- **Autopilot carry-on.** agy honours 10 Stop continues per prompt and never sets `continuationActive`, so the hook counts its own: at most 8 continues per user prompt, reset only by the user's next prompt (not by a subagent waking the session), kept in its data folder, which the guard keeps tools from writing.
- **`## Now` copies in a long conversation.** agy keeps every injected step, so the plan's `## Now` is injected once per prompt (on its first model call) and the copies pile up one per prompt, and again on a resumed conversation.
- **The `~/.gemini` guard.** Writes to `~/.gemini/config/`, `~/.gemini/antigravity-cli/settings.json` and the plugins' data folders are refused through write_file, edit_file and shell commands that name them, but the shell check is best-effort: a command that reaches them without naming them isn't caught. The rest of `~/.gemini/antigravity-cli/` stays writable.
- **Case-insensitive file systems.** The guard compares paths case-sensitively, so on a case-insensitive file system a write to `.Gemini/config` can slip past it.
- **Writes through the shell in a held stage.** The hold refuses write_file, edit_file and `invoke_subagent`, but a file written by a shell command isn't held, on any host.
- **Node older than 22.18.** The hook runs the Claude hook's TypeScript through Node's type stripping; an older Node can't load it, so guarded tool calls are refused.
- **Lean's count of agents already running.** Each hook event is a fresh process, so no in-memory agent list carries between events.
- **The reopen check after a commit.** It runs before the commit lands, since there's no in-memory state carried to the next event.
- **Compacting the context before autopilot carries on.** agy gives a command hook no context gauge and no compact call.
- **Typed `/plan`, `/stage`, `/autopilot`.** agy expands a skill only as `/jbit:<name>`. A bare `/plan` reaches the model as plain text, which may still read the skill, as may a prompt that describes the task, with no guarantee.
- **A headless run without allow rules.** In `--mode accept-edits` every shell command asks, and `agy -p` can't ask, so it denies any command no `permissions.allow` rule covers (exit 0, `denied_actions`) and the stage stops there (such as `ls`, `echo` or `date`). Pass the narrow rules above with `--settings`; a broad `command(git)` or `command(node)` lets `git push` and `node -e` run unprompted.
- **Per-role effort.** An agy agent takes `model` as `inherit`, `flash` or `pro`, with no effort, so the Models line's model half applies and its effort half doesn't.
- **The status line.** A plugin can't set one in agy; it is a user setting, and its input carries the account's email, so a status line script should never log it whole.
- **`CLAUDE.md` loaded at startup.** agy loads `AGENTS.md` and `GEMINI.md`, not `CLAUDE.md`; the package's rules tell the model to read `CLAUDE.md` itself.
- **The host's own browser tools.** They need a running Chrome with remote debugging and a person clicking Allow, so screenshots come only from the capture script.
- **Host tools JBIT doesn't know.** The hook allows a tool only when it is read-only or on its list, so a tool a newer agy adds is refused until JBIT lists it.
- **Running notebook cells.** `notebook_execution` runs arbitrary code with no command line to judge, so the hook refuses it.
- **Commits and pushes from a script or alias.** The gates read the command line, as on every host, so a commit or push run inside a script, an interpreter or an alias defined elsewhere isn't seen.
<!-- antigravity-gaps:end -->
