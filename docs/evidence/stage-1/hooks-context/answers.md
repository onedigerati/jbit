# Stage 1: PreInvocation context and Stop continue (agy 1.5.17, gemini-3.8-flash-low)

Throwaway homes `$SCRATCH/agy/home-ctx` (context, resume), `home-ctx2` (context-all), `home-ctx3` (continue); workspace `$SCRATCH/agy/ws-ctx`.

## PreInvocation context

- **Works, first call only.** With mode `context`, a `-p` prompt making two `read_file` calls fired `PreInvocation` three times (`invocationNum` 0, 1, 2). The hook injected only at 0; the model reported exactly one marker, `OCELOT-VELVET-0`. Evidence: `01-context-run.txt`, `02-context-events.txt`.
- **Response shape that works:** `{"injectSteps":[{"systemMessage":{"systemMessage":"<text>"}}]}`. `{}` injects nothing. Evidence: `02-context-events.txt`.
- **Where it lands.** `transcript.jsonl` step 1, right after the `USER_INPUT` step: `source:"SYSTEM_SDK"`, `type:"SYSTEM_MESSAGE"`, content wrapped as `<SYSTEM_MESSAGE>\nThe following system message was injected by a PreInvocation hook:\n<text>\n</SYSTEM_MESSAGE>`. The host's own reminders use `source:"SYSTEM"`. Evidence: `03-context-transcript.txt`.
- **It persists.** The injected step stays in the conversation: the final model call (invocation 2, no injection) still quoted `OCELOT-VELVET-0`. `initialNumSteps` counts it (1 at call 0, then 4 at call 1). Evidence: `01-context-run.txt`, `02-context-events.txt`.
- **`context-all` piles up copies.** Injecting on every call left three steps (1, 4, 7, each placed at that call's `initialNumSteps`), and the model listed `OCELOT-VELVET-0`, `-1` and `-2`. Evidence: `05-context-all-run.txt`.
- **A resumed prompt starts at 0 again.** `agy -p '...' --conversation <id>` resumes. Its first `PreInvocation` had `invocationNum:0`, `initialNumSteps:9`, and the new `lastUserInput`, so `context` injected a second copy (step 9). The model then listed `OCELOT-VELVET-0` twice: one copy per prompt accumulates across a conversation. Evidence: `04-resume-second-prompt.txt`.
- **No SessionStart on resume.** The resumed `-p` fired only `PreInvocation`, `PostInvocation` and `Stop`. Evidence: `04-resume-second-prompt.txt`.

## Stop continue

- **Response shape that works:** `{"decision":"continue","reason":"<text>"}`. The host adds a step `source:"SYSTEM"`, `type:"SYSTEM_MESSAGE"` with `Stop hook blocked termination: <reason>`, and the model runs again. Evidence: `../hooks-stop/03-continue-transcript.txt`.
- **Cap: 10 continues.** On `-p 'Reply with exactly: PONG'`, `Stop` fired 11 times (`executionNum` 0 to 10). The hook said continue every time. The host honoured the first 10 (10 "Stop hook blocked termination" steps) and ignored the 11th. The run ended normally: `"status":"SUCCESS"`, exit 0, `num_turns:1`, 43.8 s, and a response of `PONG` plus ten `CONTINUED-AGAIN` lines. Evidence: `../hooks-stop/01-continue-run.txt`, `../hooks-stop/02-continue-events.txt`.
- **`continuationActive` stayed `false`** on all 11 Stop payloads, including the ones after a continue. The changelog says it should read `true` during a continuation, so a hook can't rely on it to break a loop. Use `executionNum` (it rises by 1 per Stop in the turn) or the hook's own count. Evidence: `../hooks-stop/02-continue-events.txt`, fixtures `Stop-ctx-1.json`, `Stop-ctx-2.json`.
- **`Stop` fires only at the end of a turn.** During continuation 4, the model made several tool calls across invocations 4 to 9 (`read_file` of the plugin files, `run_command` `find`, `ls`, `ps aux`) and Stop did not fire between them. The changelog says the cap counts "consecutive continuations" and is configurable, but I did not find the setting's name. Fixture `Stop-ctx-2.json` is the capped Stop (`executionNum:10`). Evidence: `../hooks-stop/02-continue-events.txt`, `../hooks-stop/03-continue-transcript.txt`.

## Surprises

- **`run_command` ran in `-p` without `--dangerously-skip-permissions` and without a prompt.** It ran `find`, `ls -la $HOME` and `ps aux` while the probe's `PreToolUse` returned `{"decision":"allow"}`. This run doesn't show whether the hook's allow bypassed the permission check or the host's default allowed these commands anyway. Evidence: `../hooks-stop/03-continue-transcript.txt`.
- **The resumed `-p` took 57 s for a no-tool answer** and reported `num_turns:2`. The host also injected a "subagents ... stopped due to server restart" notice. Evidence: `04-resume-second-prompt.txt`.
