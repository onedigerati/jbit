# Stage 1 · Fan-out limit — evidence
Verified 2026-11-17 on be15d2f, plus uncommitted changes (the stage's work)

| Check | Result | Evidence |
|---|---|---|
| `stage`, `autopilot` and `plan` say that a limit in `CLAUDE.md` on how many agents run at once, or on worktrees, is followed: at most that many agents at a time (leaves then go one after another), no `isolation: "worktree"` when worktrees are off (builders work in the main tree on separate files), and with agents off, the work runs in the main session; the six skills stay within 5,000 words (proof: docs check) | pass | [docs-check.txt](docs-check.txt): `stage, autopilot and plan follow a CLAUDE.md limit on agents at once or worktrees` and `the six skills together are at most 5,000 words` pass (4,996 words); the test fails when the rule is cut from `stage`: [docs-check-mutated.txt](docs-check-mutated.txt) |
| The plugin README has a "Slower machines" section with example `CLAUDE.md` lines for every repo on a machine (`~/.claude/CLAUDE.md`) and for one project, and the `permissions.deny: ["Agent"]` fallback with what it costs (proof: docs check) | pass | [docs-check.txt](docs-check.txt): the `## Slower machines` test passes; the section was also read by hand (both example lines, the JSON snippet, the cost paragraph) |
| In a scratch repo whose `CLAUDE.md` says "at most one agent at a time, no worktrees", headless `/jbit:stage` on a stage of two independent leaves starts no Agent call with `isolation: "worktree"` and never has two agents running at once, and the stage still builds, verifies and commits (proof: saved run, a test can't start Claude Code) | pass | [stage-run.jsonl.txt](stage-run.jsonl.txt) (ids masked), [agent-calls.txt](agent-calls.txt): builder slugify → builder titleCase → verifier, each foreground with no `isolation`, each ending before the next starts, max 1 at once, 0 worktree calls; [scratch-repo.txt](scratch-repo.txt): commit `f1c4766` with both modules, tests and the run's own evidence report, no worktree or extra branch, tree clean |
| `plugin.json` says `1.1.0`; `claude plugin validate .`, `claude plugin test plugins/jbit` and the docs check are green (proof: test run) | pass | [validate.txt](validate.txt) passes; [tests.txt](tests.txt) 43/43; [docs-check.txt](docs-check.txt) 31/31, including `plugin.json is 1.1.0` |

Project checks: type check n/a · lint n/a · tests 43/43 ([tests.txt](tests.txt)) · docs check 31/31 ([docs-check.txt](docs-check.txt)) · validate pass ([validate.txt](validate.txt))
Audit: no package manifest in the repo, nothing to audit (`npm audit` would apply if one were added)

Plan's last stage, and its only one: there are no earlier hand-proven checks to re-run.
