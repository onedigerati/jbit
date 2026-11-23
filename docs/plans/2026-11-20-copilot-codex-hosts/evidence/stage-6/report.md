# Stage 6 · Codex adapter + package: verification report

2026-11-20. Verified by a fresh agent that built none of this. Its outputs are in [checks/](checks/), each starting with its command, with paths scrubbed.

| # | Check | Result | Proof |
|---|---|---|---|
| 1 | The shared parity scenarios pass against the Claude hook, the Copilot hook and the Codex command hook | PASS | [Claude](checks/v-1a-parity-claude.txt): 13 pass, which is 12 scenarios plus a fixture test. [Copilot](checks/v-1b-parity-copilot.txt): 12 pass. [Codex](checks/v-1c-parity-codex.txt): all 12 scenarios pass through `runScenarios`. A mutation that made the Codex hook allow everything failed the 6 scenarios that expect a deny ([v-1d](checks/v-1d-parity-codex-mutation.txt)). |
| 2 | The Codex hook handles the spike's event shapes | PASS | [hook.test.mjs](checks/v-2a-codex-hook-tests.txt): 31 of 31. [45 subprocess runs](checks/v-2b-generated-hook-subprocess.txt) of the generated hook, from a copy of the package outside the repo, against temp git repos (detailed below). 44 behaved as expected, and the 45th is the shared limit below. No run exited 1. |
| 3 | `node hosts/build.mjs codex [--check]` is deterministic and generates `plugins/jbit-codex/` | PASS | [`--check`](checks/v-3a-build-codex-check.txt): up to date, 28 files. [Build tests](checks/v-3b-build-tests.txt): 49 of 49. [Two builds](checks/v-3c-build-twice.txt) are byte-identical and match the committed package. [Inspection](checks/v-3d-package-inspect.txt) (detailed below). |
| 4 | Guard and parsing tests came before the adapter code; `/code-review` and `/security-review` ran, with each finding triaged | PASS | [01](01-tests-red-before-adapter.txt) is red with no adapter modules yet. [04a](04a-review-fixes-red.txt) shows 13 of 13 regression tests red before the fixes. [review.md](review.md) has 14 rows, each with an outcome; the deferred ones are in the plan's Open questions. The verifier re-ran 4 of the fixed attacks through the generated hook ([v-4a](checks/v-4a-review-spotcheck.txt)). |
| 5 | `plugins/jbit/` and `.claude-plugin/` unchanged from `c087d40`; suite, docs check, validate, hosts tests, Claude parity and the copilot build check green | PASS | [The diff](checks/v-5a-unchanged-since-c087d40.txt) is empty. [Suite](checks/v-5b-plugin-test.txt): 561 pass. [Docs check](checks/v-5c-docs-check.txt): 51 pass. [Validate](checks/v-5d-validate.txt): passed. [Hosts tests](checks/v-5e-hosts-tests.txt): 125 of 125. [Copilot `--check`](checks/v-5f-copilot-check.txt): up to date. |

**What the 45 subprocess runs covered** (check 2):
- `## Now` in `additionalContext`.
- Denies in a held stage: `apply_patch` Add, Update, Delete and Move-to.
- A push under autopilot.
- Unknown tools carrying a path or a command.
- Writes under `$CODEX_HOME`.
- Stop blocking 8 times with `## Now` in the reason, then stopping, with the count reset on a new prompt.
- Bad stdin, no `cwd` and no `PLUGIN_DATA`, all denying with exit 0.

**What the inspection showed** (check 3):
- `.codex-plugin/plugin.json` is named `jbit`.
- 9 skills, each with a bare name and one "On Codex CLI" section that names `$jbit:` and `spawn_agent`.
- `hooks.json` uses `${PLUGIN_ROOT}`, with `additionalContextLimit` 16000.
- `.agents/plugins/marketplace.json` points at `./plugins/jbit-codex`.
- `approve/agents/openai.yaml` sets `allow_implicit_invocation: false`, and the gap is listed too.

**A limit shared by every host.** In a held stage, a shell write (`echo b > src/login.ts`) is allowed. Claude's hold covers Edit, Write, NotebookEdit and Agent only (`register.ts`), so the Codex hook matches Claude's behaviour here; it's not a Codex bug. It goes to the plan's Open questions.

**Secret scan** ([v-6](checks/v-6-secret-scan.txt)): clean apart from one fake test key marked `jbit:allow-secret`. [git status](checks/v-7-git-status.txt) shows no stray files; the three untracked files predate the plan. The repo has no `package.json`, so no dependency audit was run.
