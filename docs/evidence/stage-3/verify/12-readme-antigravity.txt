$ sed -n "/^## Antigravity CLI/,/^## [A-Z]/p" README.md
## Antigravity CLI

JBIT also runs on Google Antigravity CLI (`agy`). `plugins/jbit-antigravity/` is the same plugin, version 2.0.0, generated from this one by `node hosts/build.mjs antigravity`: a native Antigravity plugin with the same skills, a note on Antigravity's tool names, and the hook ported to a Node script. It needs Node 22.18 or later.

```
agy plugin install /path/to/jbit/plugins/jbit-antigravity
```

Install it by the package's path, never the repo root: from the root, `agy` installs every `plugins/*` folder, and same-named ones replace each other. There is no marketplace file for Antigravity.

Type `/jbit:plan`, `/jbit:stage`, `/jbit:autopilot` and so on, or describe the task and let the model find the skill. A typed `/plan` isn't expanded. `JBIT …` command words work as on Claude Code.

Screenshots come from JBIT's capture script only. `agy`'s sandbox can't reach a local dev server, so run with `--mode accept-edits` and an allow rule for the capture command, or start the server inside the same command as the capture.
This closed a UI stage live: `agy --mode accept-edits --settings '{"permissions":{"allow":["command(node)","command(git)"]}}'`. `--settings` holds for that run only; to keep the rules, put the same `permissions.allow` list in `~/.gemini/antigravity-cli/settings.json`.

What Antigravity can't do:

<!-- antigravity-gaps:start: generated from hosts/antigravity/capability.json by node hosts/build.mjs antigravity; don't edit -->
- **A hook that prints nothing.** agy runs a tool call when its PreToolUse hook prints nothing (proven in the spike, hooks-deny/13, 14). The shipped hook prints an explicit allow or deny on every path, a crash, bad input, an unknown event and an old Node included, and its 25-second watchdog answers before agy's 30-second timeout.
- **A subagent's calls judged in its parent's session, when linked.** agy's payload marks no subagent and names no parent: the hook reads the parent from agy's own first message in the subagent's transcript (or its message files) and judges the subagent's calls in the parent's session, as Claude Code does. When it can't link one, it judges the calls as armed, attended, with no stage approved, the strictest any session could be. A held stage still refuses `invoke_subagent` itself, so no subagent starts while a stage is held.
- **Autopilot carry-on.** agy honours 10 Stop continues per prompt and never sets `continuationActive`, so the hook counts its own: at most 8 per prompt, reset by the next prompt, kept in its data folder, which the guard keeps tools from writing.
- **`## Now` copies in a long conversation.** agy keeps every injected step, so the plan's `## Now` is injected once per prompt (on its first model call) and the copies pile up one per prompt, and again on a resumed conversation.
- **The `~/.gemini` guard.** Writes to `~/.gemini/config/`, `~/.gemini/antigravity-cli/settings.json` and the plugins' data folders are refused through write_file, edit_file and shell commands that name them, but the shell check is best-effort: a command that reaches them without naming them isn't caught. The rest of `~/.gemini/antigravity-cli/` stays writable.
- **Case-insensitive file systems.** The guard compares paths case-sensitively, so on a case-insensitive file system a write to `.Gemini/config` can slip past it.
- **Writes through the shell in a held stage.** The hold refuses write_file, edit_file and `invoke_subagent`, but a file written by a shell command isn't held, on any host.
- **Node older than 22.18.** The hook runs the Claude hook's TypeScript through Node's type stripping; an older Node can't load it, so guarded tool calls are refused.
- **Lean's count of agents already running.** Each hook event is a fresh process, so no in-memory agent list carries between events.
- **The reopen check after a commit.** It runs before the commit lands, since there's no in-memory state carried to the next event.
- **Compacting the context before autopilot carries on.** agy gives a command hook no context gauge and no compact call.
- **Typed `/plan`, `/stage`, `/autopilot`.** agy expands a skill only as `/jbit:<name>`. A bare `/plan` reaches the model as plain text, which may still read the skill, as may a prompt that describes the task, with no guarantee.
- **A typed `/jbit:approve`.** agy hands the hook the skill's body wrapped around what the user typed, so the hook can't read it as the typed command and fails closed: the stage stays held. Answer the approval question with a plain `yes` instead.
- **Per-role effort.** An agy agent takes `model` as `inherit`, `flash` or `pro`, with no effort, so the Models line's model half applies and its effort half doesn't.
- **The status line.** A plugin can't set one in agy; it is a user setting, and its input carries the account's email, so a status line script should never log it whole.
- **`CLAUDE.md` loaded at startup.** agy loads `AGENTS.md` and `GEMINI.md`, not `CLAUDE.md`; the package's rules tell the model to read `CLAUDE.md` itself.
- **The host's own browser tools.** They need a running Chrome with remote debugging and a person clicking Allow, so screenshots come only from the capture script.
- **Host tools JBIT doesn't know.** The hook allows a tool only when it is read-only or on its list, so a tool a newer agy adds is refused until JBIT lists it.
- **Running notebook cells.** `notebook_execution` runs arbitrary code with no command line to judge, so the hook refuses it.
- **Commits and pushes from a script or alias.** The gates read the command line, as on every host, so a commit or push run inside a script, an interpreter or an alias defined elsewhere isn't seen.
<!-- antigravity-gaps:end -->

$ sed -n "/^## Antigravity CLI/,/^## [A-Z]/p" README.md | grep -ci "todo\|tbd\|fixme"
0
$ grep -n "approve-wrapped" hosts/antigravity/capability.json   # source of the README gap line on a typed /jbit:approve
145:    { "id": "approve-wrapped", "what": "A typed `/jbit:approve`", "why": "agy hands the hook the skill's body wrapped around what the user typed, so the hook can't read it as the typed command and fails closed: the stage stays held. Answer the approval question with a plain `yes` instead." },
