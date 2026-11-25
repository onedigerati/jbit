# Stage 1 spike: PreToolUse deny on agy 1.5.17 (2026-11-25)

Check: "a `PreToolUse` deny stops `run_command`, `write_file`, `edit_file` and `invoke_subagent`, including calls inside a subagent." **Proven.**

Setup: throwaway home `$SCRATCH/agy/home-deny` with the spike probe plugin, model `gemini-3.8-flash-low`, default agent mode, no settings file, no permission rules; every tool under test reached the hook, so no allow rule was needed (01-setup.txt). Runs were made one at a time.

## Allowed baselines (mode `log`)
Each tool fired `PreToolUse` with the hook's `{"decision":"allow"}` and had its side effect: `marker-run.txt` written (02), `note.txt` written (03), `edit-me.txt` became `alpha BETA gamma` (04), a `self` subagent ran (05). Fixtures `PreToolUse-deny-1..4.json`.

`toolCall.args` field names (the "tool_input"):
- `run_command`: `CommandLine`, `WaitMsBeforeAsync`, `toolSummary`
- `write_file`: `Path`, `Content` (no `Overwrite` on a new file)
- `edit_file`: `Path`, `Target`, `Replacement`
- `invoke_subagent`: `Prompt`, `Role`, `TypeName`
- `send_message` (subagent reporting back): `Message`, `Recipient` (PreToolUse-deny-8.json)

## Deny (mode `deny:<tool>`, hook prints `{"decision":"deny","reason":"probe deny <tool>"}`)
| Tool | stream-json step | Side effect | Model saw | Evidence |
| :-- | :-- | :-- | :-- | :-- |
| `run_command` | `state:"ERROR"`, `error{type:"TOOL_ERROR", message:"tool call denied by pre-tool hook: probe deny run_command"}` | no `marker-run.txt` | same text | 06 |
| `write_file` | same shape, `... probe deny write_file` | no `note.txt` | `Encountered error in tool execution: tool call denied by pre-tool hook: probe deny write_file` | 07 |
| `edit_file` | same shape, `... probe deny edit_file` | `edit-me.txt` still `alpha beta gamma` | same text | 08 |
| `invoke_subagent` | `step_type:"subagent"`, `state:"ERROR"`, `subagent_info.subagents:[]` | no subagent `SessionStart`, no `marker-sub.txt` | `... probe deny invoke_subagent` | 09 |

Exit code 0 and `status:"SUCCESS"` in every deny run. **`denied_actions` is absent** for hook denies in both `stream-json` (06-09) and `json` output (10): it reports only the host's own permission auto-denies. A driver must look for `ERROR` steps / the deny text instead.

## Inside a subagent (mode `deny:run_command|write_file|edit_file`)
- The parent's `invoke_subagent` was allowed; the subagent (conversation `2f202d28…`) then called `run_command`, `write_file`, `edit_file`; each fired the same `PreToolUse` hook and was denied; its `send_message` back was allowed (11, events and per-call stdin).
- No `marker-sub.txt`, no `sub-note.txt`, `edit-me.txt` unchanged (11, 12).
- The subagent transcript at its `log_uri` (inside the throwaway home) shows steps 2-4 as `GENERIC`/`ERROR` with `tool call denied by pre-tool hook: probe deny <tool>` (12).
- Subagent payload shape (PreToolUse-deny-5..8.json, SessionStart-deny-1.json): same keys as the parent's, with **no parent or subagent marker**. It differs only in its own `conversationId`, `transcriptPath`/`artifactDirectoryPath` under its own `brain/<id>/`, and `lastUserInput: ""` (empty). The parent id appears only inside the subagent transcript's first system message (`sender=<parent id>`) (12). The subagent also fires its own `SessionStart` (12), and its tool calls are not in the parent's stream (11).

## Failing hook outputs (scratch variant plugin, home `$SCRATCH/agy/home-deny-fail`, 13, 14)
| PreToolUse hook | Result |
| :-- | :-- |
| prints `{}`, exit 0 | **blocked**: `tool call denied by pre-tool hook:` (empty reason); no `note.txt` |
| exit 1, stderr `probe fail boom` | **blocked**: `JSON hook "jsonhook__probe_PreToolUse_0_0" failed: command failed: exit status 1, stderr: probe fail boom` |
| prints nothing, exit 0 | **NOT blocked**: `note.txt` written, and in a second run with `run_command`, `marker-run.txt` written; `PostToolUse` fired |

The last row contradicts the research note and the spike README ("printing nothing or `{}` blocks"): empty stdout with exit 0 **fails open** on 1.5.17. A guard hook must always print an explicit decision, and must not exit 0 silently on any path.
