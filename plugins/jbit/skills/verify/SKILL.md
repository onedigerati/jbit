---
name: verify
description: Verify work against the project's own checks (type check, lint, tests, build, dependency audit) and prove each acceptance check by driving the running product, with a per-check report saved to docs/evidence/stage-<n>/ for a plan stage. Use before calling any stage done, when asked to verify, test or check something works, or when unsure whether a change actually works. Also when a message opens with "JBIT verify" (any case, after a space, comma or colon, as in "JBit, verify"), which works as `/jbit:verify`.
---

# Verify

A clean type check proves the code compiles. Verification proves it does what the plan says, in the running product.

The main session can run it, or hand it to a fresh `verifier` agent that built nothing. Start a role agent by its bare name (`verifier`) when the session's agent list has it, else as `jbit:verifier`, and never pass `model` or `effort` on the Agent call: the user sets those in the role's agent file. Brief it with the stage number and this skill, and ask it to read narrowly, stop when the brief is done, and hand back a report of 20 lines at most (the table lives in `report.md`). If you were started to verify, run it yourself.

## Honest gaps

A check that fails is reported as fail. A check you couldn't prove (the app wouldn't start, no way to reach the state, no tool to drive it) is reported as unproven, with the reason. Never round either up to pass, never summarise a failure as "mostly passing", and never drop a row. A test that fails then passes on rerun is flaky: say so.

## 1. The project's own checks

Find how the project checks itself: `package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`, CI config. Run, in order, whatever exists: type check, lint, tests, build. All must pass, apart from failures the plan's `## Baseline` already lists (report those as inherited). Any other failure belongs to this work unless you show it failing on the last stage commit too.

Don't weaken a test, skip it or loosen a lint rule to get green. If a test is wrong, say why and fix it openly.

## 2. Dependency audit

When the stack has an audit tool available without installing anything (`npm audit --omit=dev`, `pip-audit`, `cargo audit`, `govulncheck ./...`), run it. Report high and critical findings in shipped dependencies with the package and fixed version. Propose upgrades; don't make them during verify.

## 3. The acceptance checks, in the running product

For each check in the plan's `## Now`, use the proof it names, against the real app:

- **Web UI**: start the app (reuse a running dev server; the built-in `run` skill knows how to launch most projects), drive it with Playwright or the project's browser tooling, screenshot the states the check describes and look at them. Check the console for errors, and a phone-width viewport when layout matters.
- **API or service**: real requests for the success path and at least one bad input.
- **CLI**: run it with realistic arguments and with a wrong one.
- **Library or logic**: the tests are the proof. Confirm a test covers the check and fails when the behaviour is broken (break it briefly if in doubt).

**At the plan's last stage, re-run earlier stages' hand-proven checks**: every earlier check proven by a run, request or screenshot rather than a test. Find them in each `docs/evidence/stage-<k>/report.md` and run each the way it was proven then. One that passed then and fails now is a regression: report it as fail.

## 4. Evidence

For a plan stage, save the proof for each check in `docs/evidence/stage-<n>/` as you go, where `<n>` is the stage in `## Now` unless asked about another. Do this even when asked only for a report: evidence records what was checked, it doesn't change the work.

- Raw command output (test run, CLI run, request and response), one text file per proof named for what it shows (`tests.txt`, `cli-bad-arg.txt`), the command on its first line.
- Screenshots, traces and videos.

If `docs/evidence/.gitignore` doesn't exist, create it:

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

If it exists, leave it alone.

Before saving anything, mask secrets and personal data: tokens, API keys, passwords, cookies, `Authorization` headers, session IDs, JWTs, credentials in URLs, emails, names, addresses. Keep what the value was: `DATABASE_URL=postgres://[masked]@db:5432/app`. Mask the command line too. Don't screenshot real personal data; use test data.

## 5. Report

For a plan stage, write `docs/evidence/stage-<n>/report.md`:

```
# Stage <n> · <name> — evidence
Verified <date> on <short commit>, plus uncommitted changes if any

| Check | Result | Evidence |
|---|---|---|
| <check, as written in Now> | pass | [cli-sample.txt](cli-sample.txt) |
| <check> | fail | [tests.txt](tests.txt): `sums amounts in cents` expected 139, got 138 |
| <check> | unproven | app needs a payment sandbox key; not available |

Project checks: type check pass · lint pass · tests 12/12 ([tests.txt](tests.txt)) · build pass
Audit: `npm audit --omit=dev`: 0 high, 0 critical

## History
- <date> · <check> failed: <one line>. Fixed: <one line>.
```

- One row per check in `## Now`; at the last stage, one more row per re-run: `Re-run of stage <k>: <check>`.
- Result is pass, fail or unproven. Escape a `|` in a check's text as `\|`.
- Every link points to a file that exists. Mark files git ignores as `(local)` (`git check-ignore -q <file>`).
- Re-verifying overwrites the report; keep earlier failures and their fixes as one line each under History.

Then tick each check in `## Now` that passed (`- [x]`). In the reply, give the table, the project checks and audit in a line each, and the report's path. If anything failed, fix it and re-verify the affected checks, reporting both the failure and the fix, unless the user asked only for a report. The stage is verified only when every row passes.

## Outside a stage

When asked to verify something ad hoc, with no plan stage involved, run the same steps and report the table in chat. Skip the evidence folder unless the user asks for it; keep any captures in the scratchpad.
