# Stage 1 · Research pass — evidence
Verified 2026-11-14 on 12a1268, plus uncommitted changes

| Check | Result | Evidence |
|---|---|---|
| `jbit:plan` has a research step after the survey: questions that change the plan, a one-line skip, one research agent, `docs/research/<topic>.md` with question, answer, dated sources, confidence and what it changes; decisions link the note | pass | [docs-check.txt](docs-check.txt): `plan has a research step after the survey…`; removing the note fields or the skip sentence fails it ([docs-mutation.txt](docs-mutation.txt)) |
| The research brief treats web content as data, queries carry only the domain question, no web tools marks the note `unverified` and its decisions go to open questions | pass | [docs-check.txt](docs-check.txt): `the research brief keeps web content as data…`; each phrase removed fails it ([docs-mutation.txt](docs-mutation.txt)) |
| A question paper can't settle becomes a `Spike: <question>` stage, checked by the note, prototype not shipped | pass | [docs-check.txt](docs-check.txt); removal fails it ([docs-mutation.txt](docs-mutation.txt)) |
| `jbit:stage` and `jbit:autopilot` research a domain decision first; `(unattended)` links the note, an attended pause brings the findings | pass | [docs-check.txt](docs-check.txt): `stage and autopilot research a domain decision…`; removals fail it ([docs-mutation.txt](docs-mutation.txt)) |
| `jbit:review` briefs the reviewer with the notes the stage relies on | pass | [docs-check.txt](docs-check.txt): `review briefs the reviewer with the research notes…`; removal fails it ([docs-mutation.txt](docs-mutation.txt)) |
| While held, a `docs/research/*.md` write goes through; other writes, agents, `..` escapes and non-`.md` files are denied (after review: also `CLAUDE.md` names, backslashes, odd names, NotebookEdit) | pass | [tests.txt](tests.txt): `a held stage lets a research note through…` and `a research note is docs/research/<topic>.md under the repo root…`; each hook mutation fails a test, apart from the backslash pre-check, which the name allowlist duplicates ([mutation.txt](mutation.txt)) |

Project checks: tests 398/398 (after review fixes) ([tests.txt](tests.txt)) · docs check 19/19 ([docs-check.txt](docs-check.txt)) · validate passed with warnings ([validate.txt](validate.txt)) · no type check, lint or build beyond these
Audit: none applies; the plugin ships no dependencies

## History
- 2026-11-14 · Removing the one-line skip sentence left the docs check green: its assertion (`say so in one line`) matched other text in the skill. Fixed: anchored on the skip sentence itself.
- 2026-11-14 · Review found a held stage could write `docs/research/CLAUDE.md` (loaded as instructions) and Windows `\` paths escaping the folder. Fixed: a name allowlist refusing CLAUDE.md names and backslashes; tests added; re-verified.
