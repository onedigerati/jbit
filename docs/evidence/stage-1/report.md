# Stage 1 · Research role — evidence
Verified 2026-11-16 on b34c424, plus uncommitted changes

| Check | Result | Evidence |
|---|---|---|
| `Models: research sonnet/high` parses, round-trips through `modelsText`, and a `research` entry in the `CLAUDE.md` default is read the same way | pass | [tests.txt](tests.txt): `research: Models: research sonnet/high parses, round-trips through modelsText, and a CLAUDE.md default reads it the same way` |
| `JBIT models research sonnet/high` sets only that role and keeps the others; `research default` and `research none` work like the other roles; a bad value is refused with the valid forms, which now list `research` | pass | [tests.txt](tests.txt): `research: JBIT models research sonnet/high sets only that role; research default and none work like the other roles`, `research: a bad research value is refused with the valid forms, which list research` |
| The status line and the context hint show the research setting, and the hint tells Claude to pass it on research agents | pass | [tests.txt](tests.txt): `research: the status line and the context hint show the research setting and say to pass it on research agents`, `research: with no research setting, the hint names research among the roles left out` |
| An Agent call naming `sonnet/high` passes when `research` sets it and is denied, naming every role's setting, when no role does; a call naming neither still passes, so Explore agents run as the session | pass | [tests.txt](tests.txt): `research: an Agent call naming sonnet/high passes when research sets it`, `… is denied, naming every role's setting, research included, when no role sets it`, `research: with research set, a call naming neither still runs as the session, so Explore agents are unchanged` |
| A changed line that adds or changes `research` is honoured only once the user's own prompt names its settings, as for the other roles | pass | [tests.txt](tests.txt): `research: a changed line that adds research is ignored until the user names its settings`, `… is honoured once the user names its settings`, `research: a changed research setting is honoured once the user names it`, `research: changing only research is not honoured by a prompt naming only part of the new line`, `research: adding research opus/high is not honoured by a prompt that names the values but not "research"`, `research: adding research opus/high is honoured when the user names research with its values`, `research: changing review to values already on the line is not honoured without naming "review"` |
| `plan`, `stage` and `autopilot` say research agents get the `research` setting, and `stage` no longer calls research "no role" | pass | [docs-check.txt](docs-check.txt): `plan, stage and autopilot give research agents the research setting, and stage no longer calls research no role`; [skills-grep.txt](skills-grep.txt) ("no role" now names only Explore) |

Break check: with `research` removed from `MODEL_ROLES`, 11 tests fail, all ten `research:` cases among them ([break-check.txt](break-check.txt)); restored afterwards.

Project checks: type check n/a (Bun runs the TypeScript in the suite) · lint n/a · tests 514/514 ([tests.txt](tests.txt)) · docs checks 38/38 ([docs-check.txt](docs-check.txt)) · validate pass ([validate.txt](validate.txt))
Audit: no package manifest or lockfile in the repo (no dependencies); `npm audit` does not apply

## History
- 2026-11-16 · Check 5: the builder's "adds research … then honoured" test only proved the ignored half. Fixed: added `research: a changed line that adds research is honoured once the user names its settings`.
- 2026-11-16 · Review: a research entry reusing values already on the line (`research opus/high` beside `review opus/high`) was confirmed by a prompt naming only those values. Fixed: a changed line now also needs every added or changed role named as a word (`namedRoles`, `changedRoles` in register.ts); re-verified, 514/514.
