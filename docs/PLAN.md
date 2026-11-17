# JBIT plan

## Goal
Release 0.18.1's plugin, unchanged in behaviour, as JBIT 2.0.0. The user chose this after comparing eval scores: 0.18.1 scored higher (0.88 against 1.0.0's 0.75, single runs) and its hook enforces the commit gates that 1.x only asks for. Anyone on 1.2.0 moves forward with a normal update, since 2.0.0 is above 1.2.0. A plan in progress under 1.x can still close its stage, and the README says what changes for them. Done when `plugins/jbit/` matches 0.18.1 apart from version strings and the migration note, its suite, docs check and validate are green, an isolated install updates from 1.2.0 to 2.0.0, a headless run shows a 1.x plan mid-stage closing under 2.0.0, and `docs/decisions.md` says which decisions stand again. Pushing is a separate step that waits for the user.

## Baseline
2026-11-17 · at 1.2.0 (`b132341` and later): tests: 43 pass, 0 fail (`claude plugin test plugins/jbit`) · docs checks: 33 pass (`node --test plugins/jbit/tests/docs.check.mjs`) · validate: passes (`claude plugin validate .`). At 0.18.1 (`bdd4c76`) its own record was 561 tests and 47 docs checks passing.

## Now
All stages done: the goal is met. Next: a new plan (`jbit:plan`) if more is wanted.

## Stages
- [x] 1. Restore 0.18.1 as 2.0.0 — plugin, root README and marketplace back to `bdd4c76`; version 2.0.0; suite and validate green · 2026-11-17 · evidence: [docs/evidence/stage-1/report.md](evidence/stage-1/report.md)
- [x] 2. Moving from 1.x — README "Moving from 1.x" note; decisions restored and 1.x's retired; isolated 1.2.0 → 2.0.0 update; headless proof that a 1.x plan mid-stage closes under 2.0.0; 1.2.0's verifier handback ported to `verify` · 2026-11-17 · evidence: [docs/evidence/stage-2/report.md](evidence/stage-2/report.md) (the stage-1 re-run row fails only because of stage 2's planned changes)

## Decisions
- 2026-11-17 · Release 0.18.1's code as 2.0.0, not as 0.18.1 — the user's choice. Why: a version below the installed 1.2.0 might never reach users through `claude plugin update`; 2.0.0 is a clean forward update, and a major number marks the change of approach.
- 2026-11-17 · (pm) "Unchanged in behaviour" means the files at `bdd4c76`, with only the version, the description and the README's migration note changed. A compatibility fix goes in only if stage 2's headless run shows a 1.x plan can't close its stage, and it gets logged as a decision. Why: the point is 0.18.1's proven behaviour, not a new mix.
- 2026-11-17 · (pm) The evals return to 0.18.1's set too. Why: they grade 0.18.1's behaviour (Agents levels, Models lines, approvals), and 1.x's evals would fail against it.
- 2026-11-17 · (pm) `docs/decisions.md`: 0.18.1's decisions under "Retired in 1.0.0" stand again, and the 1.x decisions move under "Retired in 2.0.0", struck through rather than deleted, as the plan rules ask. Why: the file has to say what's true for the code that ships.
- 2026-11-17 · (pm) Stage 1's diff against 0.18.1 is version strings only, so `/code-review` reviews that diff, not the restored code. Why: the restored code is 0.18.1's, already reviewed and shipped. Stage 2's `/security-review` covers any compatibility fix.
- 2026-11-17 · (pm) Scale: two stages, one plan. No outside research; the update path is tested directly with an isolated install.
- 2026-11-17 · The 1.2.0 plan was archived with check 4's report row still fail, as the verifier gave it, and the user's acceptance noted in its Goal line.
- 2026-11-17 · The field guide goes back to 0.18.1's at 2.0.0, and the user's uncommitted edits to it are dropped (the user's choice).
- 2026-11-17 · (autopilot) Check 3 corrected from 477 to 561 tests, plus 47 docs checks. Why: 477 was my count of `test(` lines, not the suite's recorded count; 0.18.1's own plan and the 1.0.0 plan's Baseline both record 561 and 47.
- 2026-11-17 · (autopilot) Stage 1 review: I read the version-only diff in full (8 lines) and found nothing. `/code-review` didn't run over the restored code, which is 0.18.1's as shipped (see the stage-1 review decision above).
- 2026-11-17 · The commit gate stays as 0.18.1 had it: a plan edit and commit in one shell command is guarded only under autopilot. Check 4 and the README were reworded to say so — the user's choice, after a headless run closed a stage with an unticked check that way outside autopilot. This is 0.18.1's accepted "a guardrail, not a sandbox" design.
- 2026-11-17 · 2.0.0 carries 1.2.0's verify fix: a verifier agent hands back its table under `## Report`, and the main session writes `report.md` — the user's choice, since Claude Code refuses a subagent's report file. This is the one rule in which 2.0.0 differs from 0.18.1; check 5 covers it.
- 2026-11-17 · (autopilot) decisions.md's restored lines use 0.18.1's wording, without the "Retired" notes 1.0.0 added to six of them; those notes stay in git history (`65e4047`). Why: they claimed things 2.0.0 contradicts. The dated-line count is unchanged (122).

- 2026-11-17 · (autopilot) At the last stage, the re-run of stage 1's diff check fails against stage 1's own wording, because the diff now includes stage 2's planned changes: the migration note, the ported verify rule and their docs-check tests. It's recorded as fail in the stage 2 report, with the reason, not rounded up.

## Open questions
- 2026-11-17 · Shipped: `main` pushed (2.0.0) and the installed plugin updated from 1.2.0 to 2.0.0; takes effect after a Claude Code restart.
- What users lose (they get 0.18.1's behaviour):
  - role agents and any `.claude/agents/<role>.md` overrides
  - 1.1.0's `CLAUDE.md` fan-out limit (back to the Agents line)
  - 1.2.0's handoff overflow rule and the reviewer's `review.md`
  - 0.18.1 still assumes the verifier subagent writes `report.md`, which Claude Code refuses (see the 1.2.0 plan); it worked around this by running verify in the main session

  The README note will say this; carrying any of it into 2.0.x is for a later plan.
- Single-run eval drops between 0.18.1 and 1.0.0 (charter-prd, regression-caught, research-spike) were never re-run with more runs, so the reason for this change rests on one run per case — for the user.
- The secret guard can't see commits made through config-file git aliases (`git ci`), `git $x`, or scripts — carried; 0.18.1 has the same gap.
- `plugins/jbit/evals-ablation/` (untracked) and five leftover worktrees in `.claude/worktrees/` — carried; for the user.

## Standing decisions
- Standing decisions from earlier plans are in [decisions.md](decisions.md).

## Shipped
- 2026-11-07 · Verification evidence: verify saves a per-check report and its output to `docs/evidence/stage-<n>/`, stage and autopilot link it, archiving carries it along, and the commit guard refuses to close a stage without it (keel 0.5.0–0.5.2) — [plan](plans/2026-11-07-verification-evidence.md) · [evidence](plans/2026-11-07-verification-evidence/evidence/)
- 2026-11-17 · Fan-out limit: `stage`, `autopilot` and `plan` follow a `CLAUDE.md` limit on agents at once and worktrees; README "Slower machines" (1.1.0, pushed) — [plan](plans/2026-11-17-fan-out-limit.md) · [evidence](plans/2026-11-17-fan-out-limit/evidence/)
- 2026-11-17 · Handoff overflow: role agents hand back 20 lines at most and say what they cut; the reviewer saves `review.md`; the verifier hands back its table for the main session to write `report.md` (1.2.0, pushed) — [plan](plans/2026-11-17-handoff-overflow.md) · [evidence](plans/2026-11-17-handoff-overflow/evidence/)
