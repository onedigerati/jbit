# JBIT plan

## Goal
Bring JBIT to Google Antigravity CLI (`agy`), as close to Claude Code as the host allows, beside the Copilot and Codex packages. `plugins/jbit/` stays the source. `node hosts/build.mjs antigravity` generates `plugins/jbit-antigravity/`, a native Antigravity plugin (root `plugin.json`, root `hooks.json`, `rules/AGENTS.md`, skills with paths rewritten, the capture script). The hook is ported to a Node command script on the shared core: the plan's `## Now
All stages done.
Agents: wide — confirmed 2026-11-25 09:25

## Stages
- [x] 1. Spike: Antigravity CLI — throwaway home, install by path, skill forms, prompt context, denies inside subagents, Stop carry-on, event fixtures
- [x] 2. Antigravity adapter + package — `hosts/antigravity/` on the core, a native-plugin format in the build, generated `plugins/jbit-antigravity/`, home guard, parity scenarios
- [x] 3. Antigravity end to end — install by path; headless UI stage close with screenshots, refusals, carry-on; README "Antigravity CLI" with its gaps

## Decisions
- 2026-11-25 · Antigravity CLI is added as a host, as close to Claude Code's capabilities as reasonably possible; Gemini CLI stays out. It replaces the 2026-11-20 standing decision dropping Google hosts, struck in [decisions.md](decisions.md). Why: the user's choice.
- 2026-11-25 · The plugin review the user asked for is a survey for planning, not a findings review. Why: the user's choice.
- 2026-11-25 · Agents: wide, confirmed by the user in this session.
- 2026-11-25 · Agents: wide, named again in the user's own autopilot command ("jbit autopilot wide") this session; restamped.
- 2026-11-25 · (pm) Scale: three stages, one plan; no charter. Why: one host, well under eight stages.
- 2026-11-25 · (pm) The package is a native Antigravity plugin, not a Claude plugin left for `agy` to convert, and is installed by its path (`agy plugin install <clone>/plugins/jbit-antigravity`), never from the repo root. There is no marketplace file for now. Why: conversion leaves `${CLAUDE_*}` in the skills and doesn't port the TS-module hook; installing the repo root bulk-installs every `plugins/*` folder, and same-named ones replace each other; `agy` rejects both existing marketplace files ([antigravity-plugins-2026-11.md](research/antigravity-plugins-2026-11.md)).
- 2026-11-25 · (pm) The hook maps the per-prompt `## Now` to `PreInvocation` on the first call of a prompt only (`invocationNum === 0`), holds subagents on the `invoke_subagent` tool, and continues autopilot through `Stop` "continue". It prints an explicit allow on every pass, sets its own timeout and catches its errors into a deny with a reason. Why: there is no prompt-submit or subagent-start event; injected messages persist; a `PreToolUse` hook that prints `{}`, exits non-zero or times out blocks the tool, and one that prints nothing allows it, so a silent failure must never be possible ([antigravity-hooks-2026-11.md](research/antigravity-hooks-2026-11.md); corrected 2026-11-25 by the [spike](research/antigravity-spike-2026-11.md)).
- 2026-11-25 · (pm) Tool names come from probes, not the web docs: `run_command` (`CommandLine`), `write_file` (`Path`, `Content`), `edit_file` (`Path`, `Target`, `Replacement`). The edit matcher is broad, and a test pins the names to the spike's fixtures. Why: the docs list stale names ([antigravity-hooks-2026-11.md](research/antigravity-hooks-2026-11.md)).
- 2026-11-25 · (pm) Screenshots on Antigravity come only from the capture script; the host's browser tools aren't offered as a fallback. Why: `agy`'s browser needs a running Chrome with remote debugging and a person clicking Allow, so it can't run unattended ([antigravity-headless-2026-11.md](research/antigravity-headless-2026-11.md)).
- 2026-11-25 · (pm) The home guard protects `~/.gemini/config/` (plugins, agents, MCP) and `~/.gemini/antigravity-cli/settings.json`, and leaves the rest of `~/.gemini/antigravity-cli/` writable. Why: every run writes there, and plugin installs and settings live in the protected parts ([antigravity-headless-2026-11.md](research/antigravity-headless-2026-11.md)).
- 2026-11-25 · (pm) Live runs use a throwaway `HOME` holding only a copy of the sign-in token, pin a cheap model with `--model` (no `--effort`), and fail a scenario on a non-empty `denied_actions` or an `ERROR` tool step, not only on the exit code; never `--dangerously-skip-permissions`. Why: a `-p` run that is auto-denied still exits 0 with `SUCCESS`; parallel runs sharing `~/.gemini` interfered during research ([antigravity-headless-2026-11.md](research/antigravity-headless-2026-11.md)).
- 2026-11-25 · (pm) The shared core's host-specific text (`NODE_TOO_OLD` naming Copilot) is made host-neutral in stage 2. Why: a third host would otherwise need a third string patch (survey).
- 2026-11-25 · (pm) Per-role effort, a plugin-set status line, `CLAUDE.md` loaded at startup and the host's own browser are expected gaps, unless the spike proves otherwise. Why: agents take `model` as `inherit`, `flash` or `pro` only, with no effort; the status line is a user setting; `agy` reads `AGENTS.md` and `GEMINI.md`, not `CLAUDE.md` ([antigravity-plugins-2026-11.md](research/antigravity-plugins-2026-11.md), [antigravity-hooks-2026-11.md](research/antigravity-hooks-2026-11.md)).
- 2026-11-25 · (pm) Risk: stage 1 handles a sign-in token and runs a live host (secrets, external services); stage 2 changes the gate's adapter and reads tool input (user input); stage 3 installs and runs live (external services). All three get the security pass.

- 2026-11-25 · (unattended) Agents ran in the main tree, not worktrees, during the stage 1 spike: each wrote only its own evidence folder and fixture prefix and used its own throwaway home, and worktrees would have lacked the uncommitted probe kit. Why: disjoint outputs, no shared files edited.
- 2026-11-25 · (unattended) Autopilot carry-on on Antigravity counts its own continues per prompt (or reads `executionNum`), since the host honours 10 `Stop` continues and `continuationActive` stays `false`. Why: the [spike](research/antigravity-spike-2026-11.md).
- 2026-11-25 · (unattended) The open `CLAUDE.md` question is settled as its default: the Antigravity package's rules point the model at `CLAUDE.md`, as on Codex; JBIT doesn't write the project's `AGENTS.md`. Why: the spike shows `@CLAUDE.md` isn't inlined (only `@[label](CLAUDE.md)` is), and that works only from a project `AGENTS.md`, which is the user's file ([spike](research/antigravity-spike-2026-11.md)).
- 2026-11-25 · (unattended) Live runs set `AGY_CLI_DISABLE_AUTO_UPDATE=1`, and the guard's protected paths stay as decided; the `~/.local/bin/.update_test<n>` write `agy` makes outside `HOME` on every start is accepted as the host's. Why: the spike saw it created and removed, the binary unchanged ([spike](research/antigravity-spike-2026-11.md)).
- 2026-11-25 · Stage 1 closed: the spike's findings are in [antigravity-spike-2026-11.md](research/antigravity-spike-2026-11.md), evidence in [stage-1](evidence/stage-1/report.md).

- 2026-11-25 · (pm) Small calls in the Antigravity adapter and build:
  - The hook's own watchdog is 25 s under a 30 s host timeout, as on Codex, since the commit gate's git and secret scan can be slow.
  - `Stop` carry-on is capped at 8 per prompt, like Copilot and Codex, counted by the hook in its state under `PLUGIN_DATA` and reset on `PreInvocation` with `invocationNum` 0; `executionNum` isn't used, as the spike didn't prove it resets per prompt.
  - The guard also refuses writes into all of `~/.gemini/antigravity-cli/plugin_data/` (the hook's state lives there and a model could reset it) and `agy plugin|mcp|config|login|logout|update` commands except `plugin list` and `plugin validate`.
  - `send_message` is allowed, so a subagent can report back while a stage is held. Notices raised earlier are injected on any later `PreInvocation`.
  - `hooks.json` holds one named hook, `jbit`, for all six events; the skills keep their per-host mapping sections and `rules/AGENTS.md` stays small, as it counts toward `agy`'s rules budget.
  - Host tests now include `hosts/antigravity/hook.test.mjs`, and parity includes `hosts/parity/antigravity.test.mjs`.
- 2026-11-25 · (unattended) The Antigravity build cuts a skill over 24000 bytes at a `## ` heading into `continued.md`, with a pointer at the top and at the cut. Why: `agy` loads only a skill's first 24000 bytes, and `plan` is longer; the model reading the second file is proven live in stage 3.- 2026-11-25 · (unattended) Unknown `agy` tools are denied by default; a tool is allowed only when read-only or on the hook's explicit list, and `browser_subagent`, `define_subagent`, `manage_subagents`, `run_workflow` and `schedule` are judged as Agent calls. Why: the stage 2 review found unknown spawners skipping the hold; over-blocking fails safe and is fixed by listing a tool.
- 2026-11-25 · (unattended) A subagent is judged in its parent's session, found from `agy`'s own `sender=` system step in the subagent's transcript (or its cross-checked `messages/*.json`); a subagent that can't be linked is judged as armed, attended, nothing approved. Why: subagent payloads carry no parent link, and Claude Code subagents share the parent's session.

- 2026-11-25 · Stage 2 closed: evidence in [stage-2](evidence/stage-2/report.md), review in [review.md](evidence/stage-2/review.md) (4 fix-now fixed in two rounds, 6 deferred).

- 2026-11-25 · (unattended) On Antigravity a UI stage's report links the after shots and keeps the before shots in `before/` with a compare, as the verify skill does on every host; `plugins/jbit/` isn't changed to link both. Why: the goal keeps `plugins/jbit/` the source, and the check's intent is parity with Claude Code.
- 2026-11-25 · (unattended) The README's headless setting for `agy` is `--mode accept-edits` with a narrow per-run `--settings` allow list of plain first-word rules (the plugin's capture script, read-only and staging `git` subcommands, everyday read-only commands), not `command(git)`, `command(node)` or `regex:` rules. Why: `agy` auto-denies ordinary commands without rules, a broad rule lets `git push` and `node -e` run unprompted outside the sandbox, and `regex:` rules match the whole line, so a compound slips through ([probes](evidence/stage-3/fixes/03-readme-settings-01-rule-probes.txt)).
- 2026-11-25 · (unattended) The hook's `Stop` count resets only when `agy`'s transcript shows a new `USER_INPUT` step, falling back to a changed prompt text, and never on `invocationNum` 0 alone. Why: a finished subagent wakes the parent with `invocationNum` 0, which reset the cap live (18 continues for one prompt).
- 2026-11-25 · (unattended) The capture command is allowed in `&&`/`;` lists when every part naming a protected path is the plugin's own script, run by plain `node` or a `node` from a known install folder outside the project. Why: the verify skill chains `mkdir` and two captures; the review's `/./` and project-`node` bypasses are denied by tests.
- 2026-11-25 · Stage 3 closed: evidence in [stage-3](evidence/stage-3/report.md), review in [review.md](evidence/stage-3/review.md) (3 fix-now fixed in round 2; live findings fixed in round 1).

## Open questions
- Screenshot evidence, from the last plan's reviews, for the user:
  - A python heredoc that edits only `docs/PLAN.md`, on the same line as a commit, is now refused by the cautious evidence rule (it names `docs`); harmless, but one extra command ([stage 3 report](plans/2026-11-23-screenshot-evidence/evidence/stage-3/report.md)).
  - The plan-file same-line rule applies only under autopilot; outside it, a check after the commit catches a stage closed that way. Extending it is a scope call.
  - On Codex, screenshots need the sandbox off for the capture command, and the allowed command still loads Playwright from the project's `node_modules`.
  - A symlink or a folder named like an image in the stage folder counts as a present screenshot.
- Carried from [Copilot and Codex hosts](plans/2026-11-20-copilot-codex-hosts.md), all for the user:
  - What 2.0.0 users lose from 1.x (role agents and their overrides, the `CLAUDE.md` fan-out limit, the handoff overflow rule and `review.md`, the verifier `report.md` workaround); carrying any of it into 2.0.x is for a later plan.
  - Single-run eval drops between 0.18.1 and 1.0.0 (charter-prd, regression-caught, research-spike) were never re-run with more runs.
  - The secret guard can't see commits made through config-file git aliases (`git ci`), `git $x`, or scripts.
  - `hosts/parity/claude.test.ts` sends a prompt before composing it; settle Claude Code's real order when a scenario judges an arming prompt's context.
  - On Claude Code, the commit guard steps aside when git fails (huge diff, timeout); Copilot's shim fails closed ([review](plans/2026-11-20-copilot-codex-hosts/evidence/stage-2/review.md)).
  - The commit gate trusts any tick it has seen, so a check can be ticked in one commit and the stage closed in the next ([review](plans/2026-11-20-copilot-codex-hosts/evidence/stage-4/review.md)).
  - Codex: `~/.CODEX/…` on a case-insensitive file system gets past the `$CODEX_HOME` guard; a missing `node` or failed import likely fails open; the guard is best-effort against shell obfuscation ([review](plans/2026-11-20-copilot-codex-hosts/evidence/stage-6/review.md)).
  - In a held stage, a shell write gets through on every host; the hold covers edit tools and Agent, not Bash ([report](plans/2026-11-20-copilot-codex-hosts/evidence/stage-6/report.md)).
  - A model can write "User approved stage <n>" into the plan's text; the hold doesn't read it ([review](plans/2026-11-20-copilot-codex-hosts/evidence/stage-7/review.md)).
  - `plugins/jbit/evals-ablation/` and the root `CLAUDE.md` are untracked; commit or drop.
- Antigravity, from the spike: in `-p` auto mode the model ran `run_command` (`find`, `ls`, `ps`) without a prompt while the probe hook allowed it; whether the host's own permission check ran is unsettled. Stage 2's hook must not assume the host stops anything it allows.
- Antigravity, deferred from the stage 2 review ([review](evidence/stage-2/review.md)), for stage 3 or later:
  - Shell obfuscation (`~/.gem''ini/…`, globs, `${D}ini`) and an upper-case `.GEMINI` on a case-insensitive file system get past the home guard; the guard is best-effort, as on Codex.
  - `notebook_execution` stays denied (no command line to judge), and `call_mcp_tool`/browser JavaScript are allowed unless their arguments look like paths or commands.
  - Whether `invocationNum` 0 after a `Stop` continue resets the hook's cap of 8 is unproven live; concurrent hook calls can lose a state update; `/jbit:approve` typed by the user arrives wrapped in the skill body (fails closed). Stage 3 checks these live.
  - Unknown tools are denied by default, so a host tool seen live but not yet listed is over-blocked: `update_steps` was denied in a verifier's run ([live-held-subagent.txt](evidence/stage-2/verify-fixes2/live-held-subagent.txt)). Stage 3's end-to-end run adds any it meets.
- Antigravity, from stage 3 ([report](evidence/stage-3/report.md), [review](evidence/stage-3/review.md)):
  - A file planted under a trusted `node` folder (`~/.nvm/versions/node/<v>/bin/node`) runs as Node with the plugin's path; like any script that reaches `~/.gemini/config` without naming it, it is inside the home guard's best-effort gap. The gap text doesn't name globs either.
  - The transcript folder (`~/.gemini/antigravity-cli/brain/`) isn't guarded, so a model that writes a fake `USER_INPUT` line could reset its own `Stop` count.
  - A finished subagent's wake-up gives the parent model turns past the cap, so a run can finish more stages than 8 continues would; JBIT sends no continue past 8.
  - The commit gate checks a report's form, not that the work was done: a model closed stages without making the change. True on every host.
  - In default (auto) mode, one allowed commit didn't land (likely `agy`'s sandbox); the README's accept-edits setting avoided it.
  - Copilot and Codex likely inject the same stale "held" text on an approving prompt, as Antigravity did before its fix; not changed, outside this plan.
  - A builder once ran `agy --version` and `--help` under the real home; `~/.gemini` was unchanged ([verify-2/10](evidence/stage-3/verify-2/10-real-gemini-and-cleanup.txt)).

## Standing decisions
- Standing decisions from earlier plans are in [decisions.md](decisions.md).

## Shipped
- 2026-11-07 · Verification evidence: verify saves a per-check report and its output to `docs/evidence/stage-<n>/`, stage and autopilot link it, archiving carries it along, and the commit guard refuses to close a stage without it (keel 0.5.0–0.5.2) — [plan](plans/2026-11-07-verification-evidence.md) · [evidence](plans/2026-11-07-verification-evidence/evidence/)
- 2026-11-17 · Fan-out limit: `stage`, `autopilot` and `plan` follow a `CLAUDE.md` limit on agents at once and worktrees; README "Slower machines" (1.1.0, pushed) — [plan](plans/2026-11-17-fan-out-limit.md) · [evidence](plans/2026-11-17-fan-out-limit/evidence/)
- 2026-11-17 · Handoff overflow: role agents hand back 20 lines at most and say what they cut; the reviewer saves `review.md`; the verifier hands back its table for the main session to write `report.md` (1.2.0, pushed) — [plan](plans/2026-11-17-handoff-overflow.md) · [evidence](plans/2026-11-17-handoff-overflow/evidence/)
- 2026-11-17 · Restore 0.18.1 as 2.0.0: 0.18.1's plugin back, unchanged in behaviour, with a "Moving from 1.x" note and 1.2.0's verifier handback (2.0.0, pushed) — [plan](plans/2026-11-17-restore-2-0-0.md) · [evidence](plans/2026-11-17-restore-2-0-0/evidence/)
- 2026-11-20 · Copilot and Codex hosts: `hosts/build.mjs` generates `plugins/jbit-copilot/` and `plugins/jbit-codex/` from the Claude plugin, with the hook ported to a Node command hook, parity scenarios, and each host proven end to end from an isolated install (not yet pushed) — [plan](plans/2026-11-20-copilot-codex-hosts.md) · [evidence](plans/2026-11-20-copilot-codex-hosts/evidence/)
- 2026-11-23 · Screenshot evidence: a capture script in the verify skill (project Playwright, then a pinned cache install after the user's yes), before and after shots described by the verifier, the commit gate refusing a missing linked image, and the same-line evidence rule, on Claude Code, Copilot CLI and Codex CLI — [plan](plans/2026-11-23-screenshot-evidence.md) · [evidence](plans/2026-11-23-screenshot-evidence/evidence/)
