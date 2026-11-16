# Stage 4 · Proof, docs, 0.17.0 — evidence
Verified 2026-11-15 on c0c2343, plus uncommitted changes (the stage's work)

| Check | Result | Evidence |
|---|---|---|
| A headless autopilot run (`claude -p`) on a scaffold plan with `Models: build sonnet/medium · review opus/high` starts its builder with `model: sonnet, effort: medium` and its reviewer with `model: opus, effort: high`, shown by the hook's view of each Agent call in the run's transcript (proof: run the product, a test can't show what a model passes) | pass | [headless-run.txt](headless-run.txt): two runs; in run 2 the hook-side log shows "Build slugify" sonnet/medium, "Review slugify" opus/high, "Fix review findings" sonnet/medium, no denials, and each agent's messages ran on that model; run 1 the same on the first try |
| Evals: a case for the Models line (agents started with the role's settings, none with an effort the line doesn't name) and one for a research fetch under autopilot (a read passes, a send is held with the WebFetch pointer) (proof: the case files and the headless run above graded by hand against them, the eval tool can't commit in its sandbox here) | pass | `plugins/jbit/evals/models-line/`, `plugins/jbit/evals/research-fetch/`; [eval-grading.md](eval-grading.md): models-line 6/6, research-fetch 5/5; [headless-fetch-run.txt](headless-fetch-run.txt): the GET ran, the POST was held with the WebFetch pointer (run 3 of 3) |
| The plugin README, the root README and the field guide describe the Models line, `JBIT models …`, the `CLAUDE.md` default, what can't be set (planning and project management), and the research-fetch rule (proof: docs check) | pass | [docs-check.txt](docs-check.txt): checks 35, 36, 37 |
| Version 0.17.0 in the plugin manifest and wherever the docs name the current version (no changelog file; proof: docs check) | pass | [docs-check.txt](docs-check.txt): check 1; [version.txt](version.txt) |
| Suite, docs check and validate green, and earlier stages' hand-proven checks re-run (proof: command) | pass | [tests.txt](tests.txt) 499/499 · [docs-check.txt](docs-check.txt) 37/37 · [validate.txt](validate.txt) passes with warnings; re-runs below |
| Re-run of stage 1: The engine's Agent event carries the call's `model` and `effort`, shown by a hook log from a real session | pass | [headless-run.txt](headless-run.txt): the observer log's event keys include `model` and `effort` |
| Re-run of stage 3: outward samples (proof: run of `outwardReason` over real command lines) | pass | [rerun-stage-3-samples.txt](rerun-stage-3-samples.txt): identical to stage 3's |
| Re-run of stage 3: security review probes all blocked | pass | [rerun-stage-3-probes.txt](rerun-stage-3-probes.txt): identical to stage 3's, 120 blocked |

Project checks: validate pass with warnings ([validate.txt](validate.txt)) · tests 499/499 ([tests.txt](tests.txt)) · docs checks 37/37 ([docs-check.txt](docs-check.txt)) · no build step
Audit: no lockfile or dependencies; nothing to audit

## History
- 2026-11-15 · Research-fetch run 1 paused before the POST (check reworded); run 2's POST was refused by Claude Code's auto-mode permission check before JBIT's hook saw it; run 3, with permissions bypassed as stage 1's proof was, showed JBIT's hold.
