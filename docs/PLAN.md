# JBIT plan

## Goal
Bring JBIT to Google Antigravity CLI (`agy`), as close to Claude Code as the host allows, beside the Copilot and Codex packages. `plugins/jbit/` stays the source. `node hosts/build.mjs antigravity` generates `plugins/jbit-antigravity/`, a native Antigravity plugin (root `plugin.json`, root `hooks.json`, `rules/AGENTS.md`, skills with paths rewritten, the capture script). The hook is ported to a Node command script on the shared core: the plan's `## Now` in context, the commit gate with its evidence and image checks, the secret guard, holds on edits and subagents, autopilot carry-on, and a guard on `~/.gemini/config`. Done when a headless `agy -p` run from a by-path install closes a UI stage with before and after screenshots, the gate and guard refuse what they refuse on Claude Code, the parity scenarios pass against the Antigravity hook, and the README lists what Antigravity can't do. The suite, docs check, host tests, parity, drift checks and validate stay green throughout, and pushing waits for the user.

## Baseline
2026-11-25 · at `68b9afd`: tests: 584 pass, 0 fail (`claude plugin test plugins/jbit`) · docs checks: 58 pass (`node --test plugins/jbit/tests/docs.check.mjs`) · host tests: 127 pass (`node --test hosts/build.test.mjs hosts/copilot/hook.test.mjs hosts/codex/hook.test.mjs`) · parity: 18 pass (`node --test hosts/parity/codex.test.mjs hosts/parity/copilot.test.mjs`) · validate: passes (`claude plugin validate .`)

## Now
Stage 1 of 3 · Spike: Antigravity CLI
Risk: external services, secrets (a copied sign-in token in a throwaway home)
Checks:
- [ ] A throwaway `HOME` holding only a copy of the sign-in token runs `agy -p`, and the user's `~/.gemini` is unchanged afterwards (proof: run the product, a test can't sign in)
- [ ] A throwaway plugin installed by path is listed by `agy -p /hooks`; its skill is invoked by its slash form (record the exact form) and by its description (proof: run the product, live host behaviour)
- [ ] The probe hook's `PreInvocation` context reaches the model on the first call of a prompt only, a `PreToolUse` deny stops `run_command`, `write_file`, `edit_file` and `invoke_subagent`, including calls inside a subagent, and a `Stop` "continue" keeps a `-p` run going until the host's cap (proof: run the product, live host behaviour)
- [ ] Every event's stdin is saved as a fixture under `hosts/antigravity/fixtures/`, and the note answers: `${...}` substitution in skills, a GitHub `tree/` install, `@path` includes of `CLAUDE.md` from `AGENTS.md`, the status line's stdin, and whether `--add-dir` or an allow rule lets a sandboxed command reach a local server (proof: run the product, live host behaviour)
Open: none
Agents: wide — confirmed 2026-11-25 09:16

## Stages
- [ ] 1. Spike: Antigravity CLI — throwaway home, install by path, skill forms, prompt context, denies inside subagents, Stop carry-on, event fixtures
- [ ] 2. Antigravity adapter + package — `hosts/antigravity/` on the core, a native-plugin format in the build, generated `plugins/jbit-antigravity/`, home guard, parity scenarios
- [ ] 3. Antigravity end to end — install by path; headless UI stage close with screenshots, refusals, carry-on; README "Antigravity CLI" with its gaps

## Decisions
- 2026-11-25 · Antigravity CLI is added as a host, as close to Claude Code's capabilities as reasonably possible; Gemini CLI stays out. It replaces the 2026-11-20 standing decision dropping Google hosts, struck in [decisions.md](decisions.md). Why: the user's choice.
- 2026-11-25 · The plugin review the user asked for is a survey for planning, not a findings review. Why: the user's choice.
- 2026-11-25 · Agents: wide, confirmed by the user in this session.
- 2026-11-25 · (pm) Scale: three stages, one plan; no charter. Why: one host, well under eight stages.
- 2026-11-25 · (pm) The package is a native Antigravity plugin, not a Claude plugin left for `agy` to convert, and is installed by its path (`agy plugin install <clone>/plugins/jbit-antigravity`), never from the repo root. There is no marketplace file for now. Why: conversion leaves `${CLAUDE_*}` in the skills and doesn't port the TS-module hook; installing the repo root bulk-installs every `plugins/*` folder, and same-named ones replace each other; `agy` rejects both existing marketplace files ([antigravity-plugins-2026-11.md](research/antigravity-plugins-2026-11.md)).
- 2026-11-25 · (pm) The hook maps the per-prompt `## Now` to `PreInvocation` on the first call of a prompt only (`invocationNum === 0`), holds subagents on the `invoke_subagent` tool, and continues autopilot through `Stop` "continue". It prints an explicit allow on every pass, sets its own timeout and catches its errors into a deny with a reason. Why: there is no prompt-submit or subagent-start event; injected messages persist; a `PreToolUse` hook that prints nothing, exits non-zero or times out blocks the tool ([antigravity-hooks-2026-11.md](research/antigravity-hooks-2026-11.md)).
- 2026-11-25 · (pm) Tool names come from probes, not the web docs: `run_command` (`CommandLine`), `write_file` (`Path`, `Content`), `edit_file` (`Path`, `Target`, `Replacement`). The edit matcher is broad, and a test pins the names to the spike's fixtures. Why: the docs list stale names ([antigravity-hooks-2026-11.md](research/antigravity-hooks-2026-11.md)).
- 2026-11-25 · (pm) Screenshots on Antigravity come only from the capture script; the host's browser tools aren't offered as a fallback. Why: `agy`'s browser needs a running Chrome with remote debugging and a person clicking Allow, so it can't run unattended ([antigravity-headless-2026-11.md](research/antigravity-headless-2026-11.md)).
- 2026-11-25 · (pm) The home guard protects `~/.gemini/config/` (plugins, agents, MCP) and `~/.gemini/antigravity-cli/settings.json`, and leaves the rest of `~/.gemini/antigravity-cli/` writable. Why: every run writes there, and plugin installs and settings live in the protected parts ([antigravity-headless-2026-11.md](research/antigravity-headless-2026-11.md)).
- 2026-11-25 · (pm) Live runs use a throwaway `HOME` holding only a copy of the sign-in token, pin a cheap model with `--model` (no `--effort`), and fail a scenario on a non-empty `denied_actions` or an `ERROR` tool step, not only on the exit code; never `--dangerously-skip-permissions`. Why: a `-p` run that is auto-denied still exits 0 with `SUCCESS`; parallel runs sharing `~/.gemini` interfered during research ([antigravity-headless-2026-11.md](research/antigravity-headless-2026-11.md)).
- 2026-11-25 · (pm) The shared core's host-specific text (`NODE_TOO_OLD` naming Copilot) is made host-neutral in stage 2. Why: a third host would otherwise need a third string patch (survey).
- 2026-11-25 · (pm) Per-role effort, a plugin-set status line, `CLAUDE.md` loaded at startup and the host's own browser are expected gaps, unless the spike proves otherwise. Why: agents take `model` as `inherit`, `flash` or `pro` only, with no effort; the status line is a user setting; `agy` reads `AGENTS.md` and `GEMINI.md`, not `CLAUDE.md` ([antigravity-plugins-2026-11.md](research/antigravity-plugins-2026-11.md), [antigravity-hooks-2026-11.md](research/antigravity-hooks-2026-11.md)).
- 2026-11-25 · (pm) Risk: stage 1 handles a sign-in token and runs a live host (secrets, external services); stage 2 changes the gate's adapter and reads tool input (user input); stage 3 installs and runs live (external services). All three get the security pass.

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
- On Antigravity, `jbit:charter` writes the project's locked decisions to `CLAUDE.md`, which `agy` doesn't load. Should the Antigravity package point the model at `CLAUDE.md` (as on Codex) or write `AGENTS.md`? Default: point at `CLAUDE.md`, as on Codex, unless the spike shows an `@` include works. For the user; it shapes stage 2.

## Standing decisions
- Standing decisions from earlier plans are in [decisions.md](decisions.md).

## Shipped
- 2026-11-07 · Verification evidence: verify saves a per-check report and its output to `docs/evidence/stage-<n>/`, stage and autopilot link it, archiving carries it along, and the commit guard refuses to close a stage without it (keel 0.5.0–0.5.2) — [plan](plans/2026-11-07-verification-evidence.md) · [evidence](plans/2026-11-07-verification-evidence/evidence/)
- 2026-11-17 · Fan-out limit: `stage`, `autopilot` and `plan` follow a `CLAUDE.md` limit on agents at once and worktrees; README "Slower machines" (1.1.0, pushed) — [plan](plans/2026-11-17-fan-out-limit.md) · [evidence](plans/2026-11-17-fan-out-limit/evidence/)
- 2026-11-17 · Handoff overflow: role agents hand back 20 lines at most and say what they cut; the reviewer saves `review.md`; the verifier hands back its table for the main session to write `report.md` (1.2.0, pushed) — [plan](plans/2026-11-17-handoff-overflow.md) · [evidence](plans/2026-11-17-handoff-overflow/evidence/)
- 2026-11-17 · Restore 0.18.1 as 2.0.0: 0.18.1's plugin back, unchanged in behaviour, with a "Moving from 1.x" note and 1.2.0's verifier handback (2.0.0, pushed) — [plan](plans/2026-11-17-restore-2-0-0.md) · [evidence](plans/2026-11-17-restore-2-0-0/evidence/)
- 2026-11-20 · Copilot and Codex hosts: `hosts/build.mjs` generates `plugins/jbit-copilot/` and `plugins/jbit-codex/` from the Claude plugin, with the hook ported to a Node command hook, parity scenarios, and each host proven end to end from an isolated install (not yet pushed) — [plan](plans/2026-11-20-copilot-codex-hosts.md) · [evidence](plans/2026-11-20-copilot-codex-hosts/evidence/)
- 2026-11-23 · Screenshot evidence: a capture script in the verify skill (project Playwright, then a pinned cache install after the user's yes), before and after shots described by the verifier, the commit gate refusing a missing linked image, and the same-line evidence rule, on Claude Code, Copilot CLI and Codex CLI — [plan](plans/2026-11-23-screenshot-evidence.md) · [evidence](plans/2026-11-23-screenshot-evidence/evidence/)
