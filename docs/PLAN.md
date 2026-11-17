# JBIT plan

## Goal
Give 1.0.0 back a way to narrow how widely work fans out to agents, for slower machines and tighter budgets, without bringing back the hook machinery. A limit the user writes in `CLAUDE.md` (theirs in `~/.claude/CLAUDE.md` for every repo on a machine, or the project's) on how many agents run at once or on worktrees is followed by `stage`, `autopilot` and `plan`'s research step. The README says how, with the blunt fallback of denying the Agent tool. Done when the skills carry the rule, a docs check holds it, a headless run shows a limited stage built by one builder at a time in the main tree, and the plugin is 1.1.0.

## Baseline
2026-11-17 · tests: 43 pass, 0 fail (`claude plugin test plugins/jbit`) · docs checks: 29 pass (`node --test plugins/jbit/tests/docs.check.mjs`) · validate: passes (`claude plugin validate .`)

## Now
All stages done: the goal is met. Next: a new plan (`jbit:plan`) if more is wanted.

## Stages
- [x] 1. Fan-out limit — skills honour a `CLAUDE.md` limit on agents and worktrees; README "Slower machines"; docs check; headless proof; 1.1.0 · 2026-11-17 · evidence: [docs/evidence/stage-1/report.md](evidence/stage-1/report.md)

## Decisions
- 2026-11-17 · Restore a fan-out limit as skill text read from `CLAUDE.md`, not a plan line or hook — the user's pick ("plan it"), after the 1.0.0 cut left no way to narrow fan-out on slower machines. A machine's limit belongs to the machine, so `~/.claude/CLAUDE.md` is the main place; a project's `CLAUDE.md` works too. It's an instruction Claude follows, not an enforced cap; `permissions.deny: ["Agent"]` is the enforced, blunt fallback.
- 2026-11-17 · Plain words, no fixed syntax: the skills follow any clear limit in `CLAUDE.md`, and the README gives example lines. Why: `CLAUDE.md` is read by Claude, not parsed, so a grammar would only add a way to get it wrong.
- 2026-11-17 · Version 1.1.0: a new option, nothing removed.
- 2026-11-17 · No Agents line in this plan: 1.0.0 ignores it. This session still runs the installed 0.18.1 hook, which reads no line as `balanced`.
- 2026-11-17 · Scale: one stage, no PRD; no signal fired, one plan. No research: nothing outside the repo changes this plan.
- 2026-11-17 · No control run without the limit: a small stage may not fan out anyway, so a control proves little for its cost.
- 2026-11-17 · (unattended) Skill wording trimmed elsewhere to fit the rule under 5,000 words (4,996): the repeated "the user sets those in the role's agent file" stays in `stage` and `verify` only, and a few asides went from `charter`, `plan`, `autopilot`, `resume` and `verify`; no rule or checked phrase dropped. Why: the cap was 27 words from full.
- 2026-11-17 · (unattended) The field guide's header and footer say JBIT 1.1.0, and the version docs check now asserts 1.1.0. Why: the existing check tied the guide to the manifest version.

## Open questions
- 2026-11-17 · Shipped: `main` pushed (1.0.0 and 1.1.0) and the installed plugin updated from 0.18.1 to 1.1.0; takes effect after a Claude Code restart.
- milestone-close-gap's `tal-04-stays-blank` and `m1-not-ticked` graders judge changed files only, so a run that rightly changes nothing fails them — for a later plan.
- Single-run eval drops outside 1.0.0's pass condition: charter-prd 0.92 → 0.64, regression-caught 1.0 → 0.60, research-spike 1.0 → 0.75 — worth a two-run check before shipping, for the user.
- A `/jbit:stage` run in a repo with a project `builder.md` hasn't been shown to pick `builder` over `jbit:builder` — for a later plan.
- The secret guard can't see commits made through config-file git aliases (`git ci`), `git $x`, or scripts; 0.18.1 couldn't either — for a later plan.
- `shell.ts` still exports parser details nothing reads (`DEEP`, `BUILT`, `STDIN`, `FROM_INPUT`, the git `alias` flag) — safe to trim later.
- At a plan's last stage, the committed plan keeps the ticked stage line but not its ticked checks; they live in the evidence report — for the user.
- `plugins/jbit/evals-ablation/` (untracked) holds the ablation's case copies and raw results; delete it once the user has looked — for the user.
- Leftover agent worktrees in `.claude/worktrees/` (five, from 1.0.0's stages 1–2, all merged) — remove with `git worktree remove` once the user has looked.

## Standing decisions
- Standing decisions from earlier plans are in [decisions.md](decisions.md).

## Shipped
- 2026-11-07 · Verification evidence: verify saves a per-check report and its output to `docs/evidence/stage-<n>/`, stage and autopilot link it, archiving carries it along, and the commit guard refuses to close a stage without it (keel 0.5.0–0.5.2) — [plan](2026-11-07-verification-evidence.md) · [evidence](2026-11-07-verification-evidence/evidence/)
- 2026-11-07 · Regression and security proof: plans prefer tests as proof, verify re-runs hand-proven checks at the end of a plan, stages recheck their risk line against the diff, and evals show a regression and a planted injection caught (keel 0.6.0) — [plan](2026-11-07-regression-security-proof.md) · [evidence](2026-11-07-regression-security-proof/evidence/)
- 2026-11-08 · Agents level: an `Agents: lean | balanced | wide` line in `## Now` that the skills follow, shown in the status line, `lean` capped at one running agent by the hook, and `wide` honoured only once the user confirms it in-session (keel 0.7.0) — [plan](2026-11-08-agents-level.md) · [evidence](2026-11-08-agents-level/evidence/)
- 2026-11-08 · Large projects: `keel:charter` turns a PRD into `docs/ROADMAP.md`, plans are cut one milestone at a time, the archive fills coverage from evidence, milestones close on suite, coverage and fit; standing decisions move to `docs/decisions.md` past ten; projects add hold words and outward commands in `CLAUDE.md` (keel 0.8.0, published) — [plan](2026-11-08-large-projects.md) · [evidence](2026-11-08-large-projects/evidence/)
- 2026-11-09 · Explicit approval and secret formats: a held risky stage is released only by an approval reply or `/keel:approve`, and the secret guard catches JWTs, bearer, GitLab, npm, PyPI and SendGrid tokens and unmasked credential headers in evidence (keel 0.9.0, published) — [plan](2026-11-09-explicit-approval-secret-formats.md) · [evidence](2026-11-09-explicit-approval-secret-formats/evidence/)
- 2026-11-10 · Quick-fix path: `keel:fix` lets a small, already-decided, low-risk change skip the stage, logged under `## Fixes` and committed alone (keel 0.10.0, published) — [plan](2026-11-10-quick-fix-path.md) · [evidence](2026-11-10-quick-fix-path/evidence/)
- 2026-11-13 · Unattended autopilot: `/keel:autopilot unattended [outward]`, typed by the user, runs a whole approved plan without the risky-stage hold, logging its own judgment calls; the commit gates, secret guard and security review stay (keel 0.11.0) — [plan](2026-11-13-unattended-autopilot.md) · [evidence](2026-11-13-unattended-autopilot/evidence/)
- 2026-11-13 · JBIT rename: the plugin is `jbit` 0.12.0 with `/jbit:*` skills, a `# JBIT` context header and `jbit` status line; legacy `keel:allow-secret` and `Keel risk:` / `Keel outward:` rules still honoured; READMEs and field guide tell the goal-to-done story with the tagline (pushed) — [plan](2026-11-13-jbit-rename.md) · [evidence](2026-11-13-jbit-rename/evidence/)
- 2026-11-14 · JBIT commands: the user's typed `/jbit:autopilot` or a whole-message "JBIT …" command sets the autopilot level (unattended by default, `attended`, `outward`) until their next command or a new Goal; plain words run at the level that stands, and "just build it" approves a held stage; animated README hero banner, field guide option D hero, evals (0.13.0, pushed) — [plan](2026-11-14-jbit-commands.md) · [evidence](2026-11-14-jbit-commands/evidence/)
- 2026-11-14 · Research pass and progress updates: `jbit:plan` researches the questions that change a plan into dated, sourced `docs/research/` notes the decisions link, a question paper can't settle becomes a `Spike:` stage, and autopilot gives a notice and a progress note after each stage and flags concerns as they happen (0.14.0, pushed) — [plan](2026-11-14-research-progress.md) · [evidence](2026-11-14-research-progress/evidence/)
- 2026-11-14 · Headless rules: the user's own JBIT command carries its working rules beside the prompt, so a headless run (`claude -p`) or a session's first turn loads jbit:autopilot and writes the Mode line; a stage-closing commit gets a progress-note reminder (headless Sonnet and Opus still leave the note to the final report) (0.15.0) — [plan](2026-11-14-headless-rules.md) · [evidence](2026-11-14-headless-rules/evidence/)
- 2026-11-14 · Headless progress and commit gate: the progress note between stages is for when someone reads along, a headless run leaves it to the final report; under autopilot a line that writes the plan and commits is refused, and a close found after the run is checked against its commit and flagged to reopen (0.16.0, pushed) — [plan](2026-11-14-headless-progress-commit-gate.md) · [evidence](2026-11-14-headless-progress-commit-gate/evidence/)
- 2026-11-15 · Models and research fetches: a `Models: build … · review … · verify …` line sets each delegated role's model and effort, by the user's words, `JBIT models …` or a `CLAUDE.md` default, shown in the status line and checked by the hook on each Agent call; read-only `curl`/`wget` GETs pass autopilot's outward check (0.17.0) — [plan](2026-11-15-models-research-fetches.md) · [evidence](2026-11-15-models-research-fetches/evidence/)
- 2026-11-16 · Research role, small agents, per-user default: `research` is a Models-line role, so research agents run on their own model and effort; skills brief every delegated agent small (a few items each, narrow reading, short handoff); `JBIT models … — my default` keeps a per-user default used in every repo, and a `CLAUDE.md` default waits for the user's word (0.18.0, pushed) — [plan](2026-11-16-research-role-small-agents.md) · [evidence](2026-11-16-research-role-small-agents/evidence/)
- 2026-11-16 · Worktree agents and state: a subagent's tool calls no longer move the main session's Goal, Mode, level, approvals or checks, and JBIT tells the user once when worktree agents start from the remote rather than local `HEAD` (0.18.1) — [plan](2026-11-16-worktree-agents-state.md) · [evidence](2026-11-16-worktree-agents-state/evidence/)
- 2026-11-17 · Cut JBIT down, 1.0.0: four role agents with model and effort set by the user's own agent files, six short skills (4,973 words, from 14,193), review via `/code-review` and `/security-review`, a hook of two jobs (`## Now` and the secret guard), evals and docs to match; the ablation's outcome cases hold after two fix rounds — [plan](plans/2026-11-17-cut-down-1-0-0.md) · [evidence](plans/2026-11-17-cut-down-1-0-0/evidence/)
