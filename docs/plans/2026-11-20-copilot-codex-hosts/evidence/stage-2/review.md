# Stage 2 · Hook core + Copilot adapter — review

Review was run on 2026-11-20 over `c461759..` together with the staged work in `hosts/`. Two reviews ran:
- `/code-review` at the high level;
- `/security-review`, using a sub-agent focused on the hook.

Every fix was pinned by a regression test before the code changed. The red run is in [04a-review-fixes-red.txt](04a-review-fixes-red.txt) and the green run in [04-tests-after-review-fixes.txt](04-tests-after-review-fixes.txt).

## Fixed (11)

**Security**

- **S1 (medium, reproduced).** When the staged diff was larger than the buffer, or git ran past its timeout, the shim's `process.run` returned exit code 1. `register.ts` then stepped aside, so a commit holding a secret was allowed.
  - Fix: on overflow or timeout the shim now throws, and the hook denies.
  - Test: `S1`.
- **S2 (hardening).** The patch parser now refuses a lone `\r`, and a `***` directive with anything in front of it. Either one makes the patch unparseable, and the hook denies it.
  - Test: `S2`.

**Code review**

- **C1.** Autopilot never armed when the model ran the autopilot skill on its own. The fix persists whether the last prompt came from the user, and replays it into `register.ts`'s module memory on each run. Tests: `C1` ×2.
- **C2.** The "Autopilot paused" and "all done" notices never fired. The fix persists `lastMode` and replays it. Test: `C2`.
- **C3.** Prompt events ran submit before compose, the reverse of Claude Code. Compose now runs first. Test: `C3`.
- **C4.** On a Node without type stripping, every call was denied with a generic crash reason. The deny now names Node 22.18+. Test: `C4`.
- **C5–C8 (nits):**
  - C5: the "once" notices are deduplicated.
  - C6: each multi-file patch reports only its own notices.
  - C7: state keys are pruned.
  - C8: Windows paths are denied with a clear reason.

  Tests: `C5`–`C8`.

## Deferred (2), carried in the plan's Open questions

- `hosts/parity/claude.test.ts` still sends a prompt before composing. None of the current 12 scenarios depends on that order. It matters only for a future scenario that checks the context of an arming or approval prompt. Whether real Claude Code composes before or after submit is to be settled when that scenario is written.
- On Claude Code, `register.ts`'s own commit guard also steps aside when git fails. Whether its engine has the same overflow is not known. That code is `plugins/jbit/`, which this plan keeps unchanged, so the gap is left for the user.

## Rejected (1)

- An agent can always get around the hook's regex-based command guard by running arbitrary bash, or by writing to the session state file. This is by design: the guard catches mistakes, it is not a sandbox, and Claude Code has the same limit. The README gap list says so.
