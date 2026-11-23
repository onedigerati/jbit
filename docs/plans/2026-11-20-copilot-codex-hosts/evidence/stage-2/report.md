# Stage 2 · Hook core + Copilot adapter: verification report

2026-11-20. Verified by a fresh agent that built none of this stage, against the code in `hosts/` as staged with commits `a195eb6` and `cf7bdda`.

| # | Check | Result | Proof |
|---|---|---|---|
| 1 | Shared parity scenarios pass against the Claude hook and the Copilot command hook | PASS | [v-parity-claude.txt](v-parity-claude.txt): 13 pass (12 scenarios plus a fixture test). [v-parity-copilot.txt](v-parity-copilot.txt): 12 pass. The 12 scenarios cover every item the check names. A mutation probe that made the Copilot hook allow everything failed 6 of the 12 scenarios ([v-mutation-allow-all.txt](v-mutation-allow-all.txt)). |
| 2 | The Copilot hook answers the stage-1 event shapes as the spike proved | PASS | [v-copilot-hook-subprocess.txt](v-copilot-hook-subprocess.txt) and [-2](v-copilot-hook-subprocess-2.txt) hold 26 subprocess runs against temp git repos, all as expected. They show `transformedPrompt` appended to; denies through `bash`, `apply_patch` (Add/Update/Delete, `Move to:` onto a guarded file, `..`, unparseable), `edit`, `create` and unknown tools carrying a path or command; `agentStop` blocking; no project dir failing closed; a crash denying. [v-hosts-tests.txt](v-hosts-tests.txt): 44 of 44 pass. |
| 3 | Guard and parsing tests came before the adapter code; `/code-review` and `/security-review` ran, with each finding triaged | PASS | [01-tests-red-before-adapter.txt](01-tests-red-before-adapter.txt) shows the test file red with no adapter modules yet. [04a-review-fixes-red.txt](04a-review-fixes-red.txt) shows each regression test failing before its fix. [review.md](review.md): 11 fixed, 2 deferred, 1 rejected. Every fix has a passing named test. |
| 4 | `plugins/jbit/` and `.claude-plugin/` unchanged; suite, docs check, validate and the `hosts/` tests green | PASS | [v-plugin-unchanged.txt](v-plugin-unchanged.txt): the diff against `c087d40` is empty. [Suite](v-suite.txt): 561 pass. [Docs check](v-docs-check.txt): 51 pass. [Validate](v-validate.txt): passed. Hosts tests: 44 of 44. `run-claude.mjs`: 13 of 13. |

No real secrets were found in `hosts/` or in this folder. The test fixtures build their fake keys at run time, or carry `jbit:allow-secret`. The repo has no `package.json`, so no dependency audit was run.
