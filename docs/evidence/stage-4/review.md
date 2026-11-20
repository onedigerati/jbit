# Stage 4 · Copilot end to end: review

2026-11-20. Two reviews ran, a fresh-eyes review with a security lens and the verifier's own audit of the evidence. The re-run after the fixes is in [21-review-fixes.txt](21-review-fixes.txt) and [v-recheck-after-review.txt](v-recheck-after-review.txt).

## Fixed (5)
- **Evidence scrubbed before the push.** The stage-1 and stage-4 evidence held about 170 encrypted reasoning blobs, Copilot credit and usage records, and local home and temp paths. Values were replaced with `<removed>` and paths with `$SCRATCH`, `$REPO` or `$HOME`. 79 files changed, and the 1,908 JSON records still parse.
- **Gap `subagent-hold-unproven` added.** Inside a `task` subagent, only the commit gate is proven. The model declined to delegate in runs 09–11.
- **README carry-on claim narrowed.** It now says the carry-on was proven by a run that was told to end its turn after stage 1.
- **README path checked.** The build now refuses a `readme.path` that is absolute or contains `..`.
- **Two weak tests strengthened.** The prose-outside-the-block test now asserts that its edit happened. The rebuild test now asserts the README text outside the block is byte-identical.

## Deferred (1), carried in the plan's Open questions
- In run 05, the model satisfied the commit gate by ticking a check in one commit and closing the stage in the next. That is how the gate works on Claude Code too: it trusts a tick it has seen. Whether ticks need proof of their own is a question for the user.

## Rejected (1)
- **"The 25-second watchdog was never exercised live."** The code exists, and the crash gap is recorded either way. A live test would need a hook that blocks its own event loop, which the shipped hook never does.
