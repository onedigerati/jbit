# Stage 2 · Progress updates — evidence
Verified 2026-11-14 on 2826868, plus uncommitted changes

| Check | Result | Evidence |
|---|---|---|
| When a stage-closing commit lands under autopilot, one notification `Stage <n> of <total> done: <name>. Next: <next name>.` (or `All <total> stages done.`); none for a commit closing nothing, a failed commit or no autopilot; never twice for a stage | pass | [tests.txt](tests.txt): the progress-notice tests; each mutation of the notice, the HEAD check, the dedupe, the autopilot check, the end-of-turn reconciliation and the Goal reset fails a test, apart from one equivalent ([mutation.txt](mutation.txt)) |
| After each stage closes, `jbit:autopilot` gives a progress note: delivered, how proven (report linked), `(unattended)` decisions, what's left | pass | [docs-check.txt](docs-check.txt); each phrase removed fails it ([docs-mutation.txt](docs-mutation.txt)) |
| Concerns lead the note and are told when they happen as `Concern: <what> — <what you're doing about it>`, not a pause; `No concerns.` otherwise | pass | [docs-check.txt](docs-check.txt); each phrase removed fails it ([docs-mutation.txt](docs-mutation.txt)) |

Project checks: tests 405/405 ([tests.txt](tests.txt)) · docs check 21/21 ([docs-check.txt](docs-check.txt)) · validate passed with warnings ([validate.txt](validate.txt))
Audit: none applies; the plugin ships no dependencies

## History
- 2026-11-14 · Removing the new-Goal reset of the told stages left the suite green. Fixed: a test where a new Goal's stage 1 notifies again.
- 2026-11-14 · Removing "It isn't a pause" left the docs check green. Fixed: assertion added.
