# Stage 7 · Codex end to end: review

2026-11-20. Two live runners on the user's Codex account ([live-a/](live-a/), [live-b/](live-b/)) turned up the first set of findings; a builder fixed them with tests written first ([01-fixes-red.txt](01-fixes-red.txt): 6 of 7 red, plus the old package exiting 1 on a corrupted module). A fresh reviewer then ran `/code-review` and `/security-review` over the fixes. The main session fixed its small items, with tests written first ([02-review-fixes-red.txt](02-review-fixes-red.txt)). A live re-check confirmed the fixes ([live-c/](live-c/)).

## Found live

| # | Finding | Evidence | Outcome |
|---|---|---|---|
| L1 | `$jbit:autopilot`, the form the README tells Codex users to type, didn't arm autopilot, so a push went through | live-b/03b, 00 | Fixed: the hook reads a leading `$jbit:<name>` in the user's prompt as `/jbit:<name>`. Live: the push is held ([live-c/01](live-c/01-push-dollar-autopilot.txt)) |
| L2 | Codex names its agent tools `collaborationspawn_agent` and so on, so a spawn in a held stage wasn't held | live-b/06c | Fixed: the prefixed names are mapped. Live: the spawn is denied ([live-c/02](live-c/02-held-spawn.txt)) |
| L3 | A module failing to load made Node exit 1 and the guarded call ran (fail open) | live-b/07 | Fixed: `hook.mjs` is a bootstrap that imports the handler in try/catch and denies. Live: the commit is refused ([live-c/03](live-c/03-crash-import.txt)) |
| L4 | A hook Codex kills on its timeout fails open | live-b/07b | Can't be fixed in the hook. The 25 s watchdog sits under the 30 s timeout, and it's a README gap |
| L5 | Codex rejects `additionalContextLimit` on Stop and logs an error item every run | live-a, live-b | Fixed: it's set on UserPromptSubmit only. Live: no error ([live-c/04](live-c/04-no-stop-limit-error.txt)) |
| L6 | A `Mode: autopilot` line from an earlier session seemed to arm autopilot | live-a/08 | No bug: that run's prompt was the user's own `JBIT autopilot` command. A new parity scenario (all three hooks) proves a leftover Mode line arms nothing |
| L7 | The stall check doesn't carry to Codex (in-memory) | live-a/08 | As on Copilot. The cap of 8 bounds the loop, and it's a README gap |
| L8 | `## Now` past 40 lines is cut by JBIT itself | live-b/09, 09b | Matches Claude Code. README gap |

## Review of the fixes

| # | Finding | Severity | Outcome |
|---|---|---|---|
| R1 | A spawned agent's brief might reach UserPromptSubmit as the user's prompt, letting the model approve or arm | defer → settled | Settled live: UserPromptSubmit doesn't fire inside a `spawn_agent` child ([live-c/05](live-c/05-ups-in-child.txt)). A child did write an "approved" line into the plan text, but the hook's hold lives in its own state, not the plan, and Claude Code behaves the same. Parity note, in Open questions |
| R2 | README claims backed only by runs from before the fixes | defer → fixed | live-c re-proved `$jbit:autopilot` and the crash deny |
| R3 | The subagent gap was dropped, but `write_stdin` and MCP calls in children are unproven | defer → fixed | The gap is back, narrowed to those |
| R4 | One run doesn't show `approve` is hidden | nit → fixed | The README now says it's left out of the skill list Codex shows the model (live-a/10, live-b/08) and wasn't invoked |
| R5 | A JSON serialization failure in the bootstrap would answer allow | nit → fixed | It now writes the deny |
| R6 | An unknown future `collaboration*` agent tool carrying a brief was treated as unknown | nit → fixed | Judged as a spawn when it carries a `message` and no path. Test: "stage 7 review: an unknown collaboration tool…" |
| R7 | The `$jbit:` rewrite was case-sensitive | nit → fixed | It ignores case, as the core does. Test: "stage 7 review: the $jbit: rewrite ignores case…" |

`/code-review` found nothing else. Checked and sound: the rewrite runs only on UserPromptSubmit's own prompt, never on a Stop continuation or tool input, and the core's one-line and command-word rules still apply after it.
