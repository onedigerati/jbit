# Stage 5 · Spike: Codex CLI: review

2026-11-20. Fresh-eyes review by an agent that wrote none of it. It covered three things: claims against the evidence, the plan's intent for stages 6–7, and a security and privacy pass over the evidence from the user's account. The main session triaged and fixed the findings.

| # | Finding | Severity | Outcome |
|---|---|---|---|
| 1 | "Restoring it brought them back" cited `plugin/09`, which shows only the edit | fix-now | Fixed: the note now cites `plugin/10`, where all three plugin hooks fire after the restore |
| 2 | "About 1.6M tokens" can't be checked, because usage is removed. The SIGTERM came at 146 s, before `timeout 300` | nit | Fixed: the note says the SIGTERM came from an unknown source, and that the token figure is the spike agent's, not in the file |
| 3 | The description range said 556–938, but `resume` is 435 | nit | Fixed |
| 4 | The unit of `additionalContextLimit` wasn't stated | nit | Fixed: it counts tokens (16,120 chars passed under 8000) |
| 5 | "Every path, including a timeout, returns deny" can't hold for a hook Codex kills | fix-now | Fixed: the note narrows it to paths the adapter controls, with its own watchdog inside the timeout. A killed hook is listed under Not proven, stage 7 proves it live, and the README lists it as a gap if it fails open |
| 6 | Edits to the hook script, `config.toml` or `$CODEX_HOME/hooks.json` silently turn the guard off | defer → stage 6 | The note's stage 6 list now has the guard deny writes under `$CODEX_HOME`, with a parity scenario |
| 7 | Untested paths around the guard: `spawn_agent` children, `write_stdin`, MCP tools | defer → stage 6 | Added to Not proven, and each gets a stage 6 check |
| 8 | The TUI warns that trusted hooks run outside the sandbox | defer → stage 7 | Added to the README plan |
| 9 | The note said agents can't register at all, but `$CODEX_HOME/agents/` and `config_file` both work | defer | Fixed: the note records both routes and why they're rejected for now |
| 10 | Whether a Stop `reason` is cut at ~2,500 tokens is untested | nit | Added to Not proven |
| 11 | The `plugin/06` env dump held this Claude Code session's id, PID, socket path and version path | fix-now | Fixed: those values are now `<removed>` in every evidence file. The messaging token was already redacted |
| 12 | Truncated hook output is saved to shared `/tmp/hook_outputs/` | nit | Added to the note. The one file the spike left there was deleted |

No credentials, emails, account ids or private home paths were found. Codex session ids are throwaway, from ephemeral runs, and were kept.
