# Stage 3 · check 3 (carry-on, continued.md, over-blocks): answers

Live runs: agy 1.5.17, `--model gemini-3.8-flash-low`, two throwaway homes made by `mkhome.sh`, `AGY_CLI_DISABLE_AUTO_UPDATE=1`, permissions never skipped, the package installed by path (`diff -r` against the package showed no differences). A tap script in the installed copy logged each hook event's stdin and stdout and ran the real `hook.mjs` unchanged. Both homes and the scratch projects were deleted afterwards.

| Claim | Result | Evidence |
|---|---|---|
| Autopilot carries a `-p` run on through `Stop`, with the JBIT reason | pass: prompt 1 (`JBIT autopilot`) got 8 `continue`s (`jbit autopilot: carry on with docs/PLAN.md under jbit:autopilot. Next: <stage>`). The host logged each one as `Stop hook blocked termination: …`, and stages 1–4 were committed. | [01](01-carry-on-cap-reset.txt) |
| It ends at the cap (8) | pass: the 9th `Stop` (`executionNum` 8) answered `{}`, below the host's own limit of 10. State was `stopBlocks: 8`, plus the capped notice. | [01](01-carry-on-cap-reset.txt) |
| A new prompt resets the cap | pass: prompt 2 (`keep going`, `--conversation <id>`) began at `invocationNum` 0 and carried the capped notice. It got 8 more continues (stages 5–8), then `{}` at `executionNum` 8. | [01](01-carry-on-cap-reset.txt) |
| It ends at the plan's end | pass: prompt 3 got 7 continues (stages 9–12), then `{}` at `executionNum` 7 with `All 12 stages done.` and autopilot disarmed. That is 23 continues in all and 12 stage commits. | [01](01-carry-on-cap-reset.txt) |
| `invocationNum` 0 after a `Stop` continue within one prompt doesn't reset the cap | pass: no fix needed. `invocationNum` ran 0…40, 0…36, 0…33 across the three prompts and was 0 only when a prompt started, never after a continue. The existing hook test already pins this. | [01](01-carry-on-cap-reset.txt) |
| `jbit:plan` reads its `continued.md` | pass: transcript step 6 is `read_file …/skills/plan/continued.md`, right after `SKILL.md`. The model then followed "Starting the next plan": it archived to `docs/plans/2026-11-25-notes-one-two.md`, added a `## Shipped` line, wrote a fresh plan and committed. | [02](02-continued-md-read.txt) |
| Over-blocks met live are listed and allowed | pass: the only unknown-tool deny was `update_steps` (the model's step list, args `{steps:[{title,status}]}`). It is now on `ALLOWED`, and a test pins it with the live args. The same prompt run after the change had 0 `ERROR` steps. | [03](03-over-blocks.txt) |
| Host tests, parity, drift | pass: 171/171 host tests, 35/35 parity, `build --check` up to date | [04](04-host-tests.txt), [05](05-parity.txt) |

Notes:
- **Left denied:** `notebook_execution` is the only tool in `init.tools` that the hook neither maps nor allows. It runs a notebook's cells in a kernel and gives no command line for the guards to judge.
- **`Stop` while a subagent runs:** `Stop` fires on the parent even while a subagent is still running (`fullyIdle: false`). JBIT's continue there is harmless, but it uses up one of the 8. In prompt 1, about half the continues went on "waiting for the builder", so a full prompt moves about 4 stages, not 8.
- **`schedule` as a timer:** the model used `schedule` 14 times as a timer (`{"DurationSeconds":2,"Prompt":"Wait for … subagent"}`). It also called `manage_subagents {"Action":"list"}` 20 times. The hook judges both as Agent calls, so a held stage would refuse them, as seen in stage 2. Neither was over-blocked in these runs, since nothing was held. Both stay judged as Agent calls because `schedule` can start a prompt.
- **Not touched:** the hook's `Stop`/reset code needed no change. The only source edits are `hosts/antigravity/map.mjs` (`update_steps`) and `hosts/antigravity/hook.test.mjs` (one test). The package was regenerated once with `node hosts/build.mjs antigravity`, which wrote 2 files.
