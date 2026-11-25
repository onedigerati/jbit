# Antigravity spike kit

Throwaway tools for probing `agy` (1.5.17) live. Not shipped.

**Spike only — the probe plugin logs every prompt and file it sees; never install it outside a throwaway home.**

## Throwaway home

```sh
H=$(hosts/antigravity/spike/mkhome.sh "$SCRATCH/agy/home-<name>")
HOME=$H AGY_CLI_DISABLE_AUTO_UPDATE=1 agy -p '...' --model gemini-3.8-flash-low --output-format json
```

- `mkhome.sh` copies only `~/.gemini/antigravity-cli/antigravity-oauth-token` (mode 600, dirs 700) and refuses, before creating anything, the real home, a dir inside the real `.gemini` (symlinks resolved), a dir holding either, a non-empty dir, and any symlink on the given path. Nothing else is needed: `agy` creates the rest of `.gemini/antigravity-cli/` and `.gemini/config/` itself on the first run.
- Always set `HOME=<throwaway>` on every `agy` call, one home per parallel agent.
- Set `AGY_CLI_DISABLE_AUTO_UPDATE=1`: a fresh home has no `last_check.timestamp`, so `agy` spawns its background updater, which works on the real binary in `~/.local/bin`, whatever `HOME` is. Even with it set, every start creates and removes `~/.local/bin/.update_test<n>` (a write test); the binary was not changed.
- Judge a run by `"state":"ERROR"` steps in `stream-json` and the deny text (`tool call denied by pre-tool hook: …`), not by the exit code or `denied_actions`: hook denies are absent from `denied_actions`, and the run still exits 0 with `SUCCESS`.
- **Clean up after a run:** `rm -rf "$H"`. Each throwaway home holds a copy of the sign-in token.

## Probe plugin

```sh
HOME=$H agy plugin install hosts/antigravity/spike/probe-plugin   # copies to $H/.gemini/config/plugins/probe-plugin/
HOME=$H agy -p /hooks                                             # lists the 6 hooks, no model turn
```

- Skill: `/probe-plugin:probe` (host expands the body) or the description "zephyr calibration handshake". The answer is `QUOKKA-LANTERN-42`. `/probe` alone is not expanded; the model reads `SKILL.md` with `read_file`.
- Hooks: `SessionStart`, `PreInvocation`, `PostInvocation`, `PreToolUse` (`*`), `PostToolUse` (`*`), `Stop`, each `node ./hook.mjs <Event>`, timeout 10 s. The hook runs in the installed plugin folder with `PLUGIN_ROOT` and `PLUGIN_DATA` (`$H/.gemini/antigravity-cli/plugin_data/probe-plugin`) set.
- After editing `probe-plugin/`, install again: the install is a copy.

## Hook knobs

| Knob | Default | Effect |
| :-- | :-- | :-- |
| `PROBE_LOG` env | `$HOME/probe-log` | Owner-only (dir 0700, files 0600). Each event's raw stdin goes to `<ms>-<pid>-<Event>.json`; `events.jsonl` adds cwd, `PLUGIN_*` and the response sent. |
| `PROBE_MODE` env, else `$HOME/PROBE_MODE` file | `log` | Comma- or newline-separated modes, read on every event. |

Modes:
- `log`: log only. `PreToolUse` prints `{"decision":"allow"}` (`{}` or a non-zero exit blocks the tool; printing nothing with exit 0 allows it, per `docs/evidence/stage-1/hooks-deny/14-fail-modes.txt`); every other event prints `{}`.
- `deny:<regex>`: `PreToolUse` denies tools whose name fully matches, e.g. `deny:run_command|write_file|edit_file|invoke_subagent`, with reason `probe deny <tool>`.
- `context`: `PreInvocation` injects the system message `Probe context marker: OCELOT-VELVET-<invocationNum>` when `invocationNum === 0` only; `context-all` injects on every invocation.
- `continue`: `Stop` returns `{"decision":"continue","reason":"probe continue: say CONTINUED-AGAIN and stop"}`.

The env vars reach the hook only if `agy` passes its environment through; the `$HOME/PROBE_MODE` file always works, but the model can rewrite it: in `docs/evidence/stage-1/verify/check3-stop-tampered.txt` it ran `echo log > $HOME/PROBE_MODE` and ended a `continue` run. For any non-`log` run, also deny the write tools (`run_command|write_file|edit_file`) or set `PROBE_MODE` in the env. A hook error prints a deny on `PreToolUse` and `{}` elsewhere.
