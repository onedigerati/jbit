# Stage 1 · Spike: rules at submit — evidence
Verified 2026-11-14 on 58e0073, plus uncommitted changes (the research note, its runs, the plan)

| Check | Result | Evidence |
|---|---|---|
| `docs/research/hook-rules-at-submit.md` answers: when a hook first learns the prompt (`prompt.submit`), can it put text in front of the model for that same turn, and how — a submit handler changing or adding to the prompt, the system prompt composed again, a `turn.start` or first-tool hook, or none; with each option tried, its result, the engine docs or types read (dated), a confidence and what it changes in stages 2–3 | pass | [hook-rules-at-submit.md](../../research/hook-rules-at-submit.md): yes, via submit `context`; each route in its table with its result, types read 2026-11-14, confidence high (headless) / medium (interactive first turn), a section on stages 2–3. Backed by [runs.txt](../../research/hook-rules-at-submit/runs.txt) and [debug-register.ts](../../research/hook-rules-at-submit/debug-register.ts) beside it, and re-run at verify: [spike-rerun.txt](spike-rerun.txt) (control `NONE`, submit context `SUBMITCTXWORD`, recompose `NONE`) |

Project checks: tests 407/407 ([tests.txt](tests.txt)) · docs check 26/26 ([docs-check.txt](docs-check.txt)) · validate passed with warnings, as in the baseline ([validate.txt](validate.txt)) · no type check, lint or build step (the engine compiles the hook)
Audit: no dependencies (no `package.json`); none applies
