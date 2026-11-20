# JBIT plan

## Goal
Bring as much of JBIT as each host can carry to GitHub Copilot CLI, then OpenAI Codex CLI, with no change at all to the Claude Code plugin. `plugins/jbit/` stays the source, untouched; a build step generates `plugins/jbit-copilot/` and `plugins/jbit-codex/` from it, each with its own capability file, its own marketplace entry, and the hook ported to a Node command-hook script. Done when, for each host, an isolated install from this repo runs a plan through a stage close headlessly, the commit gate and secret guard refuse what they refuse on Claude Code, and the README lists what that host can't do; and throughout, `plugins/jbit/` and `.claude-plugin/` are byte-identical to `c087d40`, with the suite, docs check and validate green. Pushing is a separate step that waits for the user.

## Baseline
2026-11-20 · at `c087d40`: tests: 561 pass, 0 fail (`claude plugin test plugins/jbit`) · docs checks: 51 pass (`node --test plugins/jbit/tests/docs.check.mjs`) · validate: passes (`claude plugin validate .`) · Copilot CLI and Codex CLI not installed on this machine (only a VS Code `copilot` shim)

## Now
Stage 5 of 7 · Spike: Codex CLI
Risk: external services (installs the Codex CLI, needs the user's sign-in, runs on their account); no product code
Mode: autopilot — unattended
Agents: wide — confirmed 2026-11-20 10:45
Scope: install `@openai/codex` with npm and get the user's sign-in. Then prove, on a throwaway plugin in the scratchpad with an isolated `CODEX_HOME` and `HOME`, each "Open for the spike" item in [codex-cli-2026-11.md](research/codex-cli-2026-11.md). Prototypes stay in the scratchpad.
Checks:
- [ ] The Codex CLI is installed here, signed in, and `codex exec` answers a prompt headlessly (proof: run)
- [ ] `docs/research/codex-spike-2026-11.md` answers each "Open for the spike" item from what a throwaway plugin showed: plugin hooks in the CLI and their trust, marketplace precedence over `.claude-plugin/`, skill naming and invocation, `spawn_agent` and agent files, the Stop block loop under `codex exec`, UserPromptSubmit and PreToolUse firing under `codex exec`, `tool_input` for `apply_patch` and shell, and the 2,500-token context cap (proof: the note, with commands and output saved under `docs/evidence/stage-5/`, scrubbed as stage 4's was)
- [ ] The note ends with what it changes for stages 6–7, and settles the open question on Codex plugin hooks; the prototype is not in the repo (proof: `git status`)
- [ ] `plugins/jbit/` and `.claude-plugin/` unchanged from `c087d40`; suite, docs check, validate, hosts tests, Claude parity and `node hosts/build.mjs copilot --check` green (proof: test)
Open: the user's Codex sign-in

## Stages
- [x] 1. Spike: Copilot CLI — install, sign in, and prove on a throwaway plugin what the docs leave open
- [x] 2. Hook core + Copilot adapter — a host-neutral Node command hook (the plan's `## Now` in context, commit gate, secret guard, holds, autopilot continuation) with shared parity scenarios run against the Claude hook too
- [x] 3. Copilot package — build script, `hosts/copilot/capability.json`, generated `plugins/jbit-copilot/`, `.github/plugin/marketplace.json`, drift and leak checks
- [x] 4. Copilot end to end — isolated install from the marketplace; headless stage close, gate and guard refusals, autopilot carry-on; README "Copilot CLI" with its gaps
- [ ] 5. Spike: Codex CLI — install, sign in, prove plugin hooks in the CLI, `apply_patch` paths, `spawn_agent`, skill naming, the 2,500-token context cap
- [ ] 6. Codex adapter + package — Codex adapter on the core, generated `plugins/jbit-codex/`, `.agents/plugins/marketplace.json`, parity scenarios
- [ ] 7. Codex end to end — isolated install; headless stage close, refusals, carry-on; README "Codex CLI" with its gaps

## Decisions
- 2026-11-20 · Copilot CLI then Codex CLI; Google (Gemini CLI, Antigravity) dropped — the user's choice.
- 2026-11-20 · No change or degradation on Claude Code: `plugins/jbit/` and `.claude-plugin/` stay byte-identical to `c087d40`, checked in every stage, and anything for the other hosts lives beside them — the user's goal ("keep the full capability … no degradation there").
- 2026-11-20 · Agents: wide — the user's choice, confirmed in this session.
- 2026-11-20 · Agents: wide, restated in the user's autopilot command ("jbit Autopilot wide") and restamped.
- 2026-11-20 · I install each host CLI with npm when its spike starts; the user signs in — the user's choice.
- 2026-11-20 · (pm) Claude's plugin is the source and the other hosts get generated packages, committed in the repo and shipped through each host's own plugin marketplace, not an installer that writes into users' config. Why: GSD does the same conversion but from a 15,800-line installer whose bugs were mostly config rewrites ([gsd-multi-host-2026-11.md](research/gsd-multi-host-2026-11.md)); Copilot and Codex now have native plugins ([copilot-cli-2026-11.md](research/copilot-cli-2026-11.md), [codex-cli-2026-11.md](research/codex-cli-2026-11.md)).
- 2026-11-20 · (pm) Each host has a `hosts/<host>/capability.json` that the build reads: tool and event names, paths, and the features it can't carry, which the README's gap list is generated from. Why: GSD's descriptors keep host differences in data and out of branching code ([gsd-multi-host-2026-11.md](research/gsd-multi-host-2026-11.md)).
- 2026-11-20 · (pm) Claude-specific skill text is adapted with a short per-host mapping section added to each generated skill plus a few tested substitutions, not a hand-maintained second copy. Why: GSD's mapping-section approach, and a drift check can then fail a generated copy that falls behind its source ([gsd-multi-host-2026-11.md](research/gsd-multi-host-2026-11.md)).
- 2026-11-20 · (pm) The hook is ported as a Node command script reading the host's event on stdin; the hook's pure modules are copied into each package at build, since an installed plugin can't import across plugin folders. The Claude hook keeps its in-process module. Why: both hosts run command hooks with a deny decision and a stop-block ([copilot-cli-2026-11.md](research/copilot-cli-2026-11.md), [codex-cli-2026-11.md](research/codex-cli-2026-11.md)).
- 2026-11-20 · (pm) Shared parity scenarios (a commit closing a stage with an unticked check, a secret in a commit, an edit in a held stage, autopilot at turn end, …) run against the Claude hook and each command hook, from outside `plugins/jbit/`. If the Claude side can only run from inside it, stage 2 stops for the user. Why: two copies of the gate logic must not drift, and the Claude plugin stays untouched.
- 2026-11-20 · (pm) Generated packages carry the version of the source they were built from (2.0.0 now). Why: one release line; the drift check ties each package to its source.
- 2026-11-20 · (pm) Each host gets its own marketplace file where that host looks first (`.github/plugin/marketplace.json`, `.agents/plugins/marketplace.json`), so neither falls back to `.claude-plugin/` and loads the Claude package, whose `hooks.json` it can't run. Why: both hosts fall back to `.claude-plugin/` ([copilot-cli-2026-11.md](research/copilot-cli-2026-11.md), [codex-cli-2026-11.md](research/codex-cli-2026-11.md)).
- 2026-11-20 · (pm) Spikes before builds, one per host, with prototypes kept in the scratchpad. Why: the notes leave the load-bearing questions (per-prompt context on Copilot, plugin hooks in the Codex CLI) to a real run.
- 2026-11-20 · (pm) Scale: seven stages, one plan; no charter. Why: under eight stages and one goal.
- 2026-11-20 · (pm) Risk: stages 2 and 6 touch secrets and user input (the secret guard and shell parsing move to a new hook), so they get tests first, `/code-review` and `/security-review`; the spikes and end-to-end stages touch external services.
- 2026-11-20 · (unattended) The hook core is the Claude hook itself: `hosts/core/` gives `plugins/jbit/hooks/register.ts` a shim engine (state in a JSON file under the plugin data folder, `fs`, `session.cwd` from the event, `git` through `child_process`, notices dropped or turned into context) and maps each host event to its handlers (`prompt.submit`/`prompt.compose`, `tool.call` with the host's tool names mapped to `Bash`/`Edit`/`Write`/`Agent`/`Skill`, `turn.complete`). Why: the handlers use a small engine surface (`state`, `fs`, `session.cwd`/`usage`/`compact`, `ui`, `process.run`, `clock`, `agent.list`, `store`, `settings`), so the gate logic stays in one copy, which is what the parity scenarios guard; a second copy would drift.
- 2026-11-20 · (unattended) The Claude parity runner (`node hosts/parity/run-claude.mjs`) runs from outside `plugins/jbit/` on a byte-checked copy of its `hooks/` and `types/`, made into `hosts/parity/` (gitignored) just before `claude plugin test hosts/parity`. This settles the "stops for the user" condition in the parity decision: `claude plugin test` loads only files inside the folder it tests, the copy is checked identical first, and `plugins/jbit/` is never written.
- 2026-11-20 · (unattended) Some of what the Claude hook keeps in memory can't carry to Copilot, since each event there is a fresh process. Lost: stall detection (Copilot's cap of 8 blocks per prompt bounds the loop instead), lean's count of agents already running, background agents, and the reopen check after a commit (it runs before the commit lands). They go into the README's Copilot gap list at stage 4.
- 2026-11-20 · (pm) Small calls the adapter makes:
  - `write_bash` is judged as Bash;
  - `str_replace_editor` maps to Edit/Write;
  - an allowed call prints nothing, so Copilot's own permission prompts still apply;
  - a prompt that repeats the hook's last block reason counts as the plugin's, so it can't set an autopilot level or approve a stage.
- 2026-11-20 · (pm) The Copilot build makes three small calls:
  - It quotes skill frontmatter values that hold `: `, because Copilot rejected three skills over it ([evidence](evidence/stage-3/06-skill-list-before-frontmatter-fix.txt)).
  - For reviews, the mapping section points at Copilot's `code-review` agent type (seen working), and at `security-review` with a `general-purpose` fallback (listed, never seen called).
  - Parallel builders on Copilot each own separate files, since there are no worktrees.
- 2026-11-20 · (unattended) Copilot: `## Now` rides on `userPromptTransformed` every turn, continuations included — settles the open question; the spike showed it honoured ([copilot-spike-2026-11.md](research/copilot-spike-2026-11.md)).
- 2026-11-20 · (unattended) Copilot skills keep bare names (`name: plan`) under a plugin and marketplace entry named `jbit`, reversing the research note's `name: jbit:<skill>`. Why: Copilot prefixes plugin skills itself and `jbit:plan` came out double-prefixed ([copilot-spike-2026-11.md](research/copilot-spike-2026-11.md)).
- 2026-11-20 · (unattended) The Copilot guard covers `edit` and `create` on their documented shape with fixture tests only, and the README says so. Why: no model this account offers writes through them, so a live run can't prove them; `bash` and `apply_patch` are proven ([copilot-spike-2026-11.md](research/copilot-spike-2026-11.md)).

## Open questions
- Does the Codex CLI run hooks bundled in a plugin? The docs conflict ([codex-cli-2026-11.md](research/codex-cli-2026-11.md) §2). If not, Codex gets the skills without the gates, and the README says so — the user decides at stage 5; that's the default I'd pick.
- What users lose (they get 0.18.1's behaviour):
  - role agents and any `.claude/agents/<role>.md` overrides
  - 1.1.0's `CLAUDE.md` fan-out limit (back to the Agents line)
  - 1.2.0's handoff overflow rule and the reviewer's `review.md`
  - 0.18.1 still assumes the verifier subagent writes `report.md`, which Claude Code refuses (see the 1.2.0 plan); it worked around this by running verify in the main session

  The README note will say this; carrying any of it into 2.0.x is for a later plan. (carried)
- Single-run eval drops between 0.18.1 and 1.0.0 (charter-prd, regression-caught, research-spike) were never re-run with more runs, so the reason for this change rests on one run per case — for the user. (carried)
- The secret guard can't see commits made through config-file git aliases (`git ci`), `git $x`, or scripts — carried; 0.18.1 has the same gap, and the ported hook will too.
- Stage 2 review, deferred:
  - `hosts/parity/claude.test.ts` sends a prompt before composing it. No current scenario depends on that order, so settle Claude Code's real order when a scenario judges an arming prompt's context.
  - On Claude Code, `register.ts`'s commit guard also steps aside when git fails (a huge diff, a timeout). Copilot's shim now fails closed. Fixing the Claude side means changing `plugins/jbit/`, which is for the user ([review](evidence/stage-2/review.md)).
- Stage 4 review, deferred: the commit gate trusts any tick it has seen, so a model can tick a check in one commit and close the stage in the next (Copilot run 05; Claude Code behaves the same). Whether a tick needs its own proof is for the user ([review](evidence/stage-4/review.md)).
- `plugins/jbit/evals-ablation/` (untracked) — carried; for the user.
- `CLAUDE.md` (untracked, in the repo root before this plan's stage 1) — left alone; for the user to commit or drop.

## Standing decisions
- Standing decisions from earlier plans are in [decisions.md](decisions.md).

## Shipped
- 2026-11-07 · Verification evidence: verify saves a per-check report and its output to `docs/evidence/stage-<n>/`, stage and autopilot link it, archiving carries it along, and the commit guard refuses to close a stage without it (keel 0.5.0–0.5.2) — [plan](plans/2026-11-07-verification-evidence.md) · [evidence](plans/2026-11-07-verification-evidence/evidence/)
- 2026-11-17 · Fan-out limit: `stage`, `autopilot` and `plan` follow a `CLAUDE.md` limit on agents at once and worktrees; README "Slower machines" (1.1.0, pushed) — [plan](plans/2026-11-17-fan-out-limit.md) · [evidence](plans/2026-11-17-fan-out-limit/evidence/)
- 2026-11-17 · Handoff overflow: role agents hand back 20 lines at most and say what they cut; the reviewer saves `review.md`; the verifier hands back its table for the main session to write `report.md` (1.2.0, pushed) — [plan](plans/2026-11-17-handoff-overflow.md) · [evidence](plans/2026-11-17-handoff-overflow/evidence/)
- 2026-11-17 · Restore 0.18.1 as 2.0.0: 0.18.1's plugin back, unchanged in behaviour, with a "Moving from 1.x" note and 1.2.0's verifier handback (2.0.0, pushed) — [plan](plans/2026-11-17-restore-2-0-0.md) · [evidence](plans/2026-11-17-restore-2-0-0/evidence/)
