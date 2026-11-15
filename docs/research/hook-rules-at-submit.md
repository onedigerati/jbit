# Hook rules at submit

Spike for stage 1 of the 0.15.0 plan (headless rules). Prototype: a throwaway debug plugin in the session scratchpad, not shipped; its source and the runs are saved beside this note in [hook-rules-at-submit/](hook-rules-at-submit/).

## Question

When a hook first learns the prompt (`prompt.submit`), can it put text in front of the model for that same turn, and how: a submit handler changing or adding to the prompt, the system prompt composed again, a `turn.start` or first-tool hook, or none?

## Answer

**Yes: a `prompt.submit` hook that adds an entry to `e.context` reaches the model in that same turn**, and the entry stays in front of it through later tool rounds of the turn. It isn't shown to the user. Rewriting `e.text` also reaches the model, but it changes the user's own message on screen. No route through the system prompt works: under `claude -p` the system prompt and the first message's context blocks are built once, before `prompt.submit` fires, and aren't built again in the run, even after an invalidate.

Event order in a headless run, the same in every run (`TRACE` in [runs.txt](hook-rules-at-submit/runs.txt)):

```
prompt.context → prompt.compose → prompt.submit (origin sdk) → turn.start
```

## Options tried

Each was a mode of the debug plugin ([debug-register.ts](hook-rules-at-submit/debug-register.ts)) that asked the model, through its route, to include a code word. Each was run headless (`claude -p … --model sonnet --output-format stream-json`, Claude Code 2.1.325, 2026-11-14) with a prompt asking for any code words it had been asked to include.

| Route | What the hook did | Result |
|---|---|---|
| none (control) | nothing | `NONE` |
| submit `context` | `next({ ...e, context: [...(e.context ?? []), text] })` | `SUBMITCTXWORD`: reached the model |
| submit `context`, ~9 KB, two tool rounds | same, with 500 lines of filler before the code word; the prompt made the model read two files first | `LONGCTXWORD` in the final answer after three model requests: it holds through the turn |
| submit text rewrite | `next({ ...e, text: e.text + '\n\n' + text })` | `TEXTWORD`: reached the model, but types say the user message on screen follows the rewrite |
| system prompt composed again | `prompt.compose` adds a section once the prompt has been seen | `NONE`: compose ran once, before submit, and never again |
| first message's context blocks | `prompt.context` adds a block once the prompt has been seen | `NONE`: it ran once, before submit |
| invalidate then recompose | submit calls `$.ui.invalidate('prompt.context')` and `('prompt.section')`, with the two routes above | `NONE`: neither ran again within the turn |
| `turn.start` | — | not tried as a route: its type says "Observe: a different return changes nothing"; it fired after submit |
| first-tool hook | — | not needed once `context` works; a `tool.call` hook can only deny or rewrite a call, and a turn with no tool call would never reach it |

The first attempt loaded nothing: the engine refused the whole module because a plain `turn.step` hook must be an async generator (debug log line in runs.txt). The modes were rerun without it.

## Sources

- Engine types `claude-code.d.ts` (the mods marketplace copy, file dated 2026-11-07), read 2026-11-14: `PromptSubmitInput.context` ("What the model reads beside the prompt and the user never sees, each entry one block after the prompt as typed … past 100,000 characters (200,000 together) the model reads a head and path"); `$.prompt.fill`'s note ("To hand the model text WITH the next prompt instead, a `prompt.submit` hook adds `context`"); `'prompt.submit'` ("Rewrite with `next({ ...e, text })` (the user message on screen follows)"); `'turn.start'` ("Observe: a different return changes nothing"); `'prompt.context'` ("Fires once per conversation"); `'prompt.compose'`.
- The runs in [runs.txt](hook-rules-at-submit/runs.txt), 2026-11-14, Claude Code 2.1.325, Sonnet.
- The earlier diagnostic, [headless-diagnostic.txt](../plans/2026-11-14-research-progress/evidence/stage-3/headless-diagnostic.txt): compose once, before submit, across a nine-message run.

## Confidence

**High** for headless runs: seen directly, with a control, on the installed engine. **Medium** for an interactive session's first turn: not driven here, but the order comes from how the engine builds a conversation (context blocks "once per conversation", compose before the first request), so its first turn should behave like a headless one. The types copy predates the installed engine by a week; the runs, not the types, are the proof.

## What it changes in stages 2–3

- **Stage 2 uses submit `context`.** When the user's own command (`autopilotAsk` in the `prompt.submit` hook, user origin only) arms autopilot over a plan that exists at that moment, the hook attaches the working rules the compose hook would now render (run jbit:autopilot now, the level, the progress note) as a `context` entry on that prompt. It doesn't rewrite the text: the user's words stay as typed, and the command and approval readers keep reading what the user wrote.
- **The system prompt in that turn still holds the pre-command section** (unarmed). The context entry has to say it supersedes the JBIT section for this turn, or the model reads two conflicting statements. Interactive later turns are unaffected: compose renders the armed section as today.
- **A headless run is one turn**, so compose never catches up in it. Everything after the first request rests on the context entry and the jbit:autopilot skill text (progress notes come from the skill). A compaction inside the run could summarize the entry away; the compact hook's KEEP instructions should name it. Untested here; stage 3's headless proof is short enough not to compact.
- **No context without the command**: an unarmed session's prompts get nothing added, so its rules don't change (the Goal's last condition). Tests can cover this at the hook level (`e.context` on the `next` call), since what reaches the model is now proven.
- **Size**: the plan section is a few KB, well under the 100,000-character cap.
- No change to the stage list; the 2026-11-14 fallback (document the limit) isn't needed.
