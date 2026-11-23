# Stage 6 · Codex adapter + package: review

2026-11-20. Two fresh agents that wrote none of the code reviewed `git diff 6959c81..HEAD`, one running `/code-review` and one running `/security-review`. The main session triaged the findings, and one builder fixed them. Each fix came with a regression test written first. All 13 tests were red before any fix ([04a-review-fixes-red.txt](04a-review-fixes-red.txt)) and green after.

| # | Source | Finding | Severity | Outcome |
|---|---|---|---|---|
| 1 | security 1, code 1 | A Bash command holding `apply_patch` was judged only as its patch, so `git push --force …; apply_patch <<EOF` skipped the push, commit and secret gates. Only the first patch block was read | fix-now | Fixed: the whole command is judged as Bash too, and every patch block is read. Tests: "review: a Bash command holding apply_patch is judged as Bash too…" and "…denies an outward push riding with a shell apply_patch" |
| 2 | security 2, code 2 | `cd ~/.codex && apply_patch …config.toml` resolved against the project and was allowed. `cd src && apply_patch` put a file outside the path the guard checked | fix-now | Fixed: a shell `apply_patch` after `cd`, `pushd` or `-C` is denied, and a `workdir` must resolve inside the project. Test: "review: a shell apply_patch after a directory change is denied…" |
| 3 | security 3 | `>&file` got past the `$CODEX_HOME` write check | fix-now | Fixed: `>&` is stripped only before a digit or `-` |
| 4 | security 4, code 2 | The list of write commands was easy to get around: `find -delete`, `curl -o`, `git -C`, interpreters, and `codex mcp add`, which rewrites `config.toml` | fix-now (small) | Fixed: those write forms are added, a `cd` into the home is denied, and so are config-rewriting `codex` subcommands. Still best-effort: obfuscation is deferred (Open questions) |
| 5 | code 3 | `rg -n apply_patch hosts` was denied as an unreadable patch | fix-now | Fixed: `apply_patch` counts only as the command word. Test: "review: apply_patch counts only as the command word…" |
| 6 | code 4 | `send_message` and `followup_task` were allowed by default, getting past the Agent gate | fix-now | Fixed: both map to Agent calls and are denied in a held stage |
| 7 | code 9 | `write_stdin` text wasn't checked for a patch | nit | Fixed: it goes through the same shell handling. Patch paths resolve against the project, since an earlier `cd` in the session can't be seen |
| 8 | code 5 | A Stop block with no reason crashed and was still counted toward the cap | defer → fixed | Fixed: the reason defaults to `''`, and only blocks actually returned count |
| 9 | code 6 | `approve`'s `openai.yaml` was written only for the exact line `disable-model-invocation: true` | defer → fixed | Fixed: the value is parsed, and the build fails if the key is dropped with no yaml written |
| 10 | code 7 | The Codex events-table check could be skipped silently | defer → fixed | Fixed: the check is required for Codex |
| 11 | code 10 | A dropped multi-line frontmatter key left stray lines | nit → fixed | Fixed |
| 12 | code 8 | The plan had no `(pm)` decisions or ticks for stage 6 | process | Fixed: `(pm)` decisions are logged, and checks are ticked as the verifier proves them |
| 13 | security 5 | On a case-insensitive file system, `~/.CODEX/` gets past the guard | defer | Open questions |
| 14 | security 6 | A missing `node`, or a static import failing, likely fails open (Copilot shares this) | defer | Open questions; stage 7 probes it live |

Parity notes (not regressions):
- An unknown or MCP tool whose keys don't look like paths (`target`, `uri`) is allowed. Copilot uses the same list.
- A command split across several `write_stdin` calls is judged in pieces.
- Whether hooks fire inside `spawn_agent` children is unproven; stage 7 checks it.

Checked and found sound:
- `session_id` goes into a file name only after it is checked or hashed.
- A bad state file fails closed.
- `cwd` is resolved to its real path.
- Bad stdin, a crash and the watchdog all deny with exit 0.
- `hooks.json` has a 30 s timeout above the 25 s watchdog.
- Patch parsing is strict.
- The marketplace and manifest don't weaken trust.
