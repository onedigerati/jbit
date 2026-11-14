# Stage 3 · Docs, evals, 0.14.0 — evidence
Verified 2026-11-14 on f60c630, plus uncommitted changes

| Check | Result | Evidence |
|---|---|---|
| Both READMEs and the field guide describe the research step, spike stages and progress updates; the hold descriptions name the `docs/research/` note exception, and the outward check is described as covering shell commands, not web searches | pass | [docs-check.txt](docs-check.txt): the README and field-guide checks; removing each phrase fails them ([docs-mutation.txt](docs-mutation.txt)) |
| Eval cases `research-domain`, `research-none`, `research-spike` and `progress-note` exist with graders | pass | [docs-check.txt](docs-check.txt): `the research and progress eval cases exist with a case.yaml, scaffold and graders…`; graded by hand from headless runs, since the eval tool refuses the moved plugin directory without `--trust-plugin`: [headless-research.txt](headless-research.txt), [headless-research-none.txt](headless-research-none.txt), [headless-research-spike.txt](headless-research-spike.txt), [headless-progress.txt](headless-progress.txt) |
| A headless `JBIT plan …` run on a domain-heavy goal in a scratch repo writes a `docs/research/` note with dated sources and a plan decision linking it | pass | [headless-research.txt](headless-research.txt): a research agent ran 5 WebSearch and 3 WebFetch (CNIL, ICO, EDPB); the note has dated sources and a confidence; both retention decisions link it |
| Version 0.14.0 in the manifest and field guide; tests, docs check and validate green | pass | [tests.txt](tests.txt) 407/407 · [docs-check.txt](docs-check.txt) 26/26 · [validate.txt](validate.txt) passed with warnings (TS warnings in the test file, the same kinds as the baseline) |
| Re-run of stages 1 and 2: every check was proven by a test or the docs check | pass | [tests.txt](tests.txt), [docs-check.txt](docs-check.txt): the suites those rows name, all green |

Project checks: type check: validate's warnings only · tests 407/407 ([tests.txt](tests.txt)) · docs check 26/26 ([docs-check.txt](docs-check.txt)) · validate passed ([validate.txt](validate.txt))
Audit: no dependencies to audit (the plugin ships TypeScript and Markdown only; no lockfile)

## History
- 2026-11-14 · Research proof failed on run 1: the main session wrote an `unverified` note from memory with no web search ([headless-research-run1.txt](headless-research-run1.txt)). Fixed: jbit:plan says research means reading sources, by a research agent; `unverified` only without web tools or when unreachable; a decision on an unverified note becomes an open question.
- 2026-11-14 · `research-none` and `research-spike` with plain prompts didn't load jbit:plan headless. Proven with the `JBIT plan:` prefix, the documented command.
- 2026-11-14 · Progress-note proof failed three times under "JBIT, just build it. Autopilot, lean." ([run 1](headless-progress-run1.txt), [run 2](headless-progress-run2.txt), [run 3](headless-progress-run3.txt)): jbit:autopilot never ran. Fix rounds added the progress note and then a run-autopilot rule to the hook's working rules; neither reached the model. The run paused, and the user chose a diagnostic. [headless-diagnostic.txt](headless-diagnostic.txt) showed `claude -p` composes the rules once, before the prompt is read. Fixed: the case runs under a typed `/jbit:autopilot lean`, which passed ([headless-progress.txt](headless-progress.txt)); the headless gap is an open question.
- 2026-11-14 · Review: the run-autopilot rule outlived a run with no Mode line and spoke for the user about a plan Claude wrote; it is removed with its tests. The README misnamed the progress-note prompt, and a hard WebSearch grader failed a correct `unverified` note; both are fixed.
