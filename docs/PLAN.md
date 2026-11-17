# JBIT plan

## Goal
Make sure the 20-line handoff never loses findings without anyone knowing. Each role agent (`builder`, `verifier`, `reviewer`, `researcher`) still hands back a report of 20 lines at most. When the detail doesn't fit, the agent writes all of it to a file, puts the path in the report, and says how much it left out. The reviewer gets the Write tool for this, saves its full review to `docs/evidence/stage-<n>/review.md` with fix-now findings first, and still edits no project files. Done when the four agent files carry the rule, a docs check holds it, a headless run shows a reviewer with more findings than 20 lines can hold saving all of them to `review.md` while handing back a short report with the path, the same run settles whether a subagent can write its own `.md` report today, and the plugin is 1.2.0.

## Baseline
2026-11-17 · tests: 43 pass, 0 fail (`claude plugin test plugins/jbit`) · docs checks: 31 pass (`node --test plugins/jbit/tests/docs.check.mjs`) · validate: passes (`claude plugin validate .`)

## Now
Stage 1 of 1 · Handoff overflow
Risk: agent permissions (the `reviewer` gains Write); otherwise prompt text and docs
Checks:
- [ ] `builder.md`, `verifier.md`, `reviewer.md` and `researcher.md` each say: a report of 20 lines at most; when the detail doesn't fit, write it all to the role's file (builder `docs/evidence/stage-<n>/build-<part>.md`, verifier `report.md`, reviewer `review.md`, researcher its note), give the path, and say how much was left out. The reviewer's file lists fix-now findings first (proof: docs check, and a mutation showing it fails when the rule is cut from one file)
- [ ] `reviewer.md` lists `Write` in its tools, limits its writes to the review file, and its description no longer says JBIT's skills start it (proof: docs check)
- [ ] In a scratch repo with a stage whose diff holds 12 or more seeded problems, a headless run that starts `jbit:reviewer` gets back a report of 20 lines at most with the `review.md` path; the file holds every seeded problem the reviewer found, fix-now first, and nothing outside the review file changed (proof: saved run, a test can't start Claude Code)
- [ ] In the same scratch repo, a headless `jbit:verifier` run writes `docs/evidence/stage-1/report.md` with its own Write call. Either result settles the 2026-11-08 question and is logged as a decision (proof: saved run)
- [ ] `plugin.json` and the field guide say 1.2.0, the README describes the overflow rule and the reviewer's file, and `claude plugin validate .`, `claude plugin test plugins/jbit` and the docs check are green (proof: test run)
Open: none

## Stages
- [ ] 1. Handoff overflow — overflow rule in the four agent files, reviewer gets Write and `review.md`, docs check, headless proof, 1.2.0

## Decisions
- 2026-11-17 · The reviewer gets the Write tool and saves its full review to `docs/evidence/stage-<n>/review.md`. The user chose this over keeping it read-only and having it report a count of what it cut. Why: the report is the only copy of a review's findings, unlike a builder's diff, a verifier's `report.md` or a researcher's note.
- 2026-11-17 · (pm) The overflow rule goes in the four agent files, not the skills. Why: the six skills are at 4,996 of their 5,000-word cap, and every skill already starts these roles by name, so the agent file always reaches them.
- 2026-11-17 · (pm) Each role overflows into a file it already owns or one next to it: the builder to `build-<part>.md` in the stage's evidence folder, the verifier to `report.md`, the reviewer to `review.md`, the researcher to its note. Outside a plan stage, the reviewer writes `docs/reviews/<date>-<topic>.md`. Why: the detail lands where archiving already carries it, with no new place to look.
- 2026-11-17 · (pm) Every overflowing report says how much it left out. Why: a silent cut is the failure this plan is about.
- 2026-11-17 · (pm) Version 1.2.0: new behaviour, nothing removed.
- 2026-11-17 · (pm) Scale: one stage, no PRD, so one plan. No research: everything this plan depends on is inside the repo, and the subagent-write question is tested directly.
- 2026-11-17 · (pm) The 2026-11-08 finding that subagents can't write report `.md` files looks out of date. In 1.1.0's headless run ([run](plans/2026-11-17-fan-out-limit/evidence/stage-1/stage-run.jsonl.txt)) the verifier subagent wrote `report.md` itself; only shell redirection was blocked, and the main session then rewrote the file. The fourth check confirms it in a clean run instead of resting on that one sighting.

## Open questions
- `docs/field-guide.html` has your uncommitted changes. The version bump edits only its version line, and the commit stages that hunk alone, leaving the rest uncommitted — for the user, before the stage commits.
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
- 2026-11-07 · Verification evidence: verify saves a per-check report and its output to `docs/evidence/stage-<n>/`, stage and autopilot link it, archiving carries it along, and the commit guard refuses to close a stage without it (keel 0.5.0–0.5.2) — [plan](plans/2026-11-07-verification-evidence.md) · [evidence](plans/2026-11-07-verification-evidence/evidence/)
- 2026-11-17 · Fan-out limit: `stage`, `autopilot` and `plan` follow a `CLAUDE.md` limit on agents at once and worktrees; README "Slower machines" (1.1.0, pushed) — [plan](plans/2026-11-17-fan-out-limit.md) · [evidence](plans/2026-11-17-fan-out-limit/evidence/)
