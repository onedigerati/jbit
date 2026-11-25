# Stage 1 spike: status line and sandbox (agy 1.5.17, gemini-3.8-flash-low, 2026-11-25)

Throwaway homes `$SCRATCH/agy/home-sb1` (sandbox runs) and `home-sb2` (status line). No `--dangerously-skip-permissions`.

## 1. Status line stdin

- **Setting that worked** (user settings, `$H/.gemini/antigravity-cli/settings.json`): `{"statusLine": {"type": "command", "command": "<script>", "enabled": true}}`. The script's stdout renders under the input box (`SLPROBE ok`). See `../statusline/01-setup.txt`, `../statusline/02-tui-run.txt`.
- **Captured** in the interactive TUI (tmux), one prompt. Fixtures: `hosts/antigravity/fixtures/statusline-1.json` (idle after the turn), `statusline-2.json` (idle before the first prompt), `statusline-3.json` (with `--sandbox`). Email, plan tier and quota values are replaced by `<removed>`.
- **Fields**: `cwd`, `session_id`, `conversation_id` (the same id; `""` before the first prompt), `transcript_path`, `model{id, display_name, effort}`, `workspace{current_dir, project_dir}`, `version`, `context_window{total_input_tokens, total_output_tokens, context_window_size, used_percentage, remaining_percentage, current_usage{input,output,cache_creation_input,cache_read_input}_tokens}` (`current_usage` is `null` before the first turn), `exceeds_200k_tokens`, `product`, `quota{3p-5h,3p-weekly,gemini-5h,gemini-weekly: remaining_fraction, reset_time, reset_in_seconds}`, `agent_state` (`authenticating|initializing|idle|working`), `cycle_mode` (`auto`), `sandbox{enabled}`, `plan_tier`, `email`, `terminal_width`. There is **no cost field**. The first two calls have no `quota`. See `../statusline/03-fields.txt`.
- **How often**: 19 calls in one short session. The calls are driven by events (state change, typing, quit), arrive in bursts about 300 ms apart, and stop entirely while the session sits idle (no calls in gaps of 10 s or more). There were 9 calls before the prompt was ready (onboarding), 2 while working, 1 at the end of the turn and 3 on `/quit`. The script runs with the workspace as its cwd. See `../statusline/02-tui-run.txt`.
- **Surprises**:
  - `transcript_path` points at `~/.gemini/antigravity/brain/<id>/...`, which does not exist. The real file is under `~/.gemini/antigravity-cli/brain/<id>/...` (`../statusline/03-fields.txt`).
  - Stdin carries the account email.
  - `sandbox.enabled` is `false` in plain auto mode but `true` with `--sandbox` (`../statusline/04-tui-sandbox-flag.txt`), even though auto mode does sandbox commands in `-p` runs (02 below). So the field reflects the flag or setting, not what actually happens to commands. This is inferred and was not tested in the TUI.

## 2. Sandboxed commands and a server outside agy (127.0.0.1:18731)

The host's network namespace is `net:[4026531833]` (`01-host-server.txt`). "Reached" means the host server logged the GET request.

| Case | Ran? | Where | Reached server? | Evidence |
| :-- | :-- | :-- | :-- | :-- |
| (a) default (`-p`, auto mode, no settings) | yes | sandbox (net ns `4026532225`) | no, curl exit 7 | `02-default-auto.txt` |
| (b) `--add-dir $SCRATCH/sb/srv` | yes | sandbox (same ns) | no | `03-add-dir.txt` |
| (c) `permissions.allow: ["command(readlink)","command(curl)","command(echo)"]`, auto mode | yes | sandbox | no; the allow rule does not lift the sandbox | `04-allow-rule-auto.txt` |
| auto mode, model retries with `BypassSandbox: true` after the sandboxed failure, **no rule** | yes, 2nd call | outside (about 6 s review, approved) | **yes** | `05-auto-bypass-retry-no-rule.txt` |
| same, with the allow rule | yes, 2nd call | outside | **yes** | `06-auto-bypass-retry-with-rule.txt` |
| (d) `enableTerminalSandbox: false`, auto mode | yes | sandbox (ns `4026532227`) | no; auto mode overrides it | `08-sandbox-setting-off-auto.txt` |
| (d) **`--mode accept-edits` + allow rules** (sandbox setting off, or unset) | yes | **host ns `4026531833`** | **yes** | `09-…`, `10-accept-edits-rules.txt` |
| `--mode accept-edits`, no rule | no, soft-denied (`denied_actions: command`, exit 0) | n/a | no | `11-accept-edits-no-rule.txt` |
| `--mode accept-edits` + rules + `--sandbox` | yes | sandbox | no | `12-accept-edits-rules-sandbox-flag.txt` |
| server **and** client in one sandboxed command (auto mode, default) | yes | sandbox | **yes** (`INNER-MARKER-5512`); port 18732 was never visible on the host | `14-server-inside-command.txt` |

- `run_command` has a hidden `BypassSandbox` argument. It is absent from the stream-json `parameters` and shows only in the transcript (`$H/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript_full.jsonl`). The tool tells the model to retry with it after sandbox errors.
- Asked outright to set `BypassSandbox`, or to run `readlink /proc/self/ns/net` without context, the model refused without calling a tool (`07-model-refusals.txt`).
- Settings keys checked with `--settings` (no model turn): `enableTerminalSandbox` (bool), `permissions` and `statusLine` are known. `sandbox`, `sandboxMode`, `network`, `allowNetwork` and `sandboxAllowNetwork` are unknown. `agentMode: "default"` is rejected (`13-settings-keys.txt`).
- The sandbox's network namespace inode repeats across separate runs (`4026532225` in a/b/c, `4026532227` in d1/d5). The sandbox may be long-lived, but this was not tested.
