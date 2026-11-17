---
name: verify
description: Verify work against the project's own checks (type check, lint, tests, build, dependency audit) and prove each acceptance check by driving the running product, saving a per-check report to docs/evidence/stage-<n>/ for a plan stage. Use before calling any stage done, when asked to verify or test something, or when unsure a change works. Also when a message opens with "JBIT verify" (any case, after a space, comma or colon, as in "JBit, verify"), which works as `/jbit:verify`.
---

# Verify

Verification proves the work does what the plan says, in the running product.

Run it here or in a fresh `verifier` agent that built nothing. Start a role agent by its bare name (`verifier`) when the session's agent list has it, else as `jbit:verifier`, and never pass `model` or `effort` on the Agent call: the user sets those in the role's agent file. Give it the stage number and this skill; tell it to read narrowly, stop when the brief is done, and hand back a report of 20 lines at most, then its full table under `## Report`. Never brief it to write `report.md`; Claude Code refuses that, so write it yourself. Started as the verifier, run it yourself.

## Honest gaps

A check that fails is reported as fail. A check you couldn't prove (app wouldn't start, state unreachable, no tool to drive it) is unproven, with the reason. Never round either up to pass, call a failure "mostly passing", or drop a row. A test that fails then passes on rerun is flaky: say so.

## 1. The project's own checks

Find how the project checks itself (`package.json` scripts, `Makefile`, `pyproject.toml`, CI config) and run whatever exists, in order: type check, lint, tests, build. All must pass, apart from `## Baseline` failures (report those as inherited). Any other failure belongs to this work unless it also fails on the last stage commit.

Never weaken or skip a test or loosen a lint rule to get green; if a test is wrong, say why and fix it openly.

## 2. Dependency audit

Run the stack's audit tool if it's available without installing (`npm audit --omit=dev`, `pip-audit`, `cargo audit`, `govulncheck ./...`). Report high and critical findings in shipped dependencies with the fixed version; propose upgrades, don't make them.

## 3. The acceptance checks, in the running product

Prove each check in `## Now` the way it names, against the real app:

- **Web UI**: start the app (reuse a running dev server; the built-in `run` skill can launch most projects), drive it with Playwright or the project's browser tooling, and screenshot and look at the states the check describes, the console for errors, and phone width when layout matters.
- **API or service**: real requests for success and at least one bad input.
- **CLI**: realistic arguments and a wrong one.
- **Library or logic**: the tests are the proof; confirm one covers the check and fails when the behaviour breaks (break it briefly if in doubt).

**At the plan's last stage, re-run earlier stages' hand-proven checks** (proven by a run, request or screenshot, not a test), found in each `docs/evidence/stage-<k>/report.md`, the way they were proven then. One that passed then and fails now is a regression: report it as fail.

## 4. Evidence

For a plan stage, save each check's proof in `docs/evidence/stage-<n>/` as you go (`<n>` is the stage in `## Now` unless asked about another), even when asked only for a report: raw output (test run, CLI run, request and response) as one text file per proof named for what it shows (`tests.txt`, `cli-bad-arg.txt`) with the command on its first line, plus screenshots, traces and videos.

If `docs/evidence/.gitignore` is missing, create it:

```
# Screenshots, traces and videos stay local. Delete the image lines to commit screenshots.
*.png
*.jpg
*.jpeg
*.webp
*.gif
*.zip
*.webm
*.mp4
*.trace
*.har
```

Before saving anything, mask secrets and personal data (tokens, API keys, passwords, cookies, `Authorization` headers, session IDs, JWTs, credentials in URLs, emails, names, addresses), keeping what the value was: `DATABASE_URL=postgres://[masked]@db:5432/app`. Mask the command line too. Screenshot test data, never real personal data.

## 5. Report

For a plan stage, write `docs/evidence/stage-<n>/report.md` (after a verifier, its `## Report` rows as they came, in this format, before any fix). It must exist before you name its path:

```
# Stage <n> · <name> — evidence
Verified <date> on <commit> (+ uncommitted, if any)

| Check | Result | Evidence |
|---|---|---|
| <check, as written in Now> | pass | [cli-sample.txt](cli-sample.txt) |
| <check> | fail | [tests.txt](tests.txt): expected 139, got 138 |
| <check> | unproven | needs a payment sandbox key |

Project checks: types pass · lint pass · tests 12/12 · build pass
Audit: 0 high, 0 critical

## History
- <date> · <check> failed: <one line>. Fixed: <one line>.
```

- One row per check in `## Now`; at the last stage, one more row per re-run: `Re-run of stage <k>: <check>`.
- Result is pass, fail or unproven; escape `|` as `\|`.
- Every link points to an existing file; mark git-ignored ones `(local)` (`git check-ignore -q <file>`).
- Re-verifying overwrites the report; keep earlier failures and fixes as one line each under History.

Then tick each passed check in `## Now`. Reply with the table, the project checks and audit in a line each, and the report's path. If anything failed, fix it and re-verify the affected checks (after a verifier, with a fresh one, not here; then rewrite the report from its table), reporting the failure and the fix, unless asked only for a report. It's verified only when every row passes.

## Outside a stage

With no plan stage involved, run the same steps and report the table in chat. Skip the evidence folder unless asked; keep captures in the scratchpad.
