# Stage 3 · Proof, docs, 0.15.0 — evidence
Verified 2026-11-14 on 297e0a2, plus uncommitted changes (hook, tests, autopilot skill, READMEs, field guide, eval case, plugin.json, the plan)

| Check | Result | Evidence |
|---|---|---|
| A headless Sonnet run of `JBIT, just build it. Autopilot, lean.` on the `progress-note` scaffold (a two-stage plan) loads jbit:autopilot and writes the Mode line, and the hook's progress-note reminder reaches the model on stage 1's commit (narrowed: whether it writes the note is the model's) | pass | [proof-run-8.txt](proof-run-8.txt): Skill jbit:autopilot is the first call, `Mode: autopilot — unattended` at stage 1's commit, and the session transcript holds both entries, the command's rules and `JBIT: stage 1 of 2 (Total label) closed with this commit…`. No note between the stages, as in runs 1–7 ([1](proof-run-1.txt), [2](proof-run-2.txt), [3](proof-run-3.txt), [4](proof-run-4.txt), [5](proof-run-5.txt), [6](proof-run-6.txt), [7](proof-run-7.txt)); the narrowing is the user's decision |
| `progress-note`'s prompt is `JBIT, just build it. Autopilot, lean.`, its description and comment no longer say the JBIT wording fails headless | pass | `plugins/jbit/evals/progress-note/case.yaml` (prompt and comment); docs check `research and progress evals` asserts the prompt ([docs-check.txt](docs-check.txt)) |
| The root and plugin READMEs and the field guide say the user's JBIT command works in a headless run and on a session's first turn because its rules ride beside the prompt, with nothing left saying it doesn't | pass | [docs-grep.txt](docs-grep.txt): `README.md:31`, `plugins/jbit/README.md:52` and `:200`, `docs/field-guide.html:354`, each with the qualifier that headless Sonnet has left the progress note to the final report; no line saying the command fails headless |
| Version 0.15.0 in `plugin.json`, the field guide and the docs check; suite, docs check and validate green | pass | [docs-check.txt](docs-check.txt) `plugin.json and the field guide are version 0.15.0`; [tests.txt](tests.txt) 427/427 (reminder tests: `a main-session commit that closes a stage with one left carries the progress-note reminder, once`, `a line that ticks the plan and commits, invisible to the pre-run diff, still gets the reminder and the notice` and six more); [validate.txt](validate.txt) passed with warnings, as in the baseline |
| Re-run of stage 1: `docs/research/hook-rules-at-submit.md` answers … (a `prompt.submit` `context` entry reaches the model in that turn) | pass | [stage-1-rerun.txt](stage-1-rerun.txt): control `NONE`, submit context `SUBMITCTXWORD` |

Stage 2's checks are proven by tests, re-run in [tests.txt](tests.txt).

Project checks: tests 427/427 ([tests.txt](tests.txt)) · docs check 26/26 ([docs-check.txt](docs-check.txt)) · validate passed with warnings ([validate.txt](validate.txt)) · no type check, lint or build step
Audit: no dependencies (no `package.json`); none applies

## History
- 2026-11-14 · The headless proof gave no progress note after stage 1 (runs 1–2). Fix round 1 made the note's wording concrete in `PROGRESS_NOTE` and jbit:autopilot step 5: still none (run 3).
- 2026-11-14 · Fix round 2 put a reminder on the stage-closing commit's result: it never fired, since Sonnet ticks the plan and commits in one Bash line the pre-run diff can't see (run 4). Fix round 3 notices closes after the command runs: the reminder reached the model and still no note (runs 5–6).
- 2026-11-14 · Fix round 4 (the user's pick) refused the next tool call once until text was written: refused, and Sonnet went on without text (run 7). The user narrowed the Goal and round 4 was reverted; run 8 proves the narrowed check on the final code.

## Review
- 2026-11-14 · Fresh review: 2 fixed, 2 deferred, 1 rejected. Fixed: the docs claimed the headless run without saying the note is left to the final report (qualifier in both READMEs, the field guide, the eval line and the case); the reminder wasn't in the README's hook list. Deferred to the plan's open questions: a close found only after the run is announced though the gates never saw it; rare reminder misses (two stages on one line, HEAD moves that aren't commits, background commits, subagent closes). Rejected: stage names in the reminder are no new exposure, the plan already reaches the model. Re-verified: tests 427/427, docs check 26/26, validate.
