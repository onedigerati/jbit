# Antigravity CLI spike — 2026-11-25

This note records what a throwaway probe plugin showed on Google Antigravity CLI (`agy` 1.5.17, `~/.local/bin/agy`). Each run used a throwaway `HOME` holding only a copy of the sign-in token. The model was `gemini-3.8-flash-low`.

It answers stage 1 of [PLAN.md](../PLAN.md) and the open questions in [antigravity-hooks-2026-11.md](antigravity-hooks-2026-11.md), [antigravity-plugins-2026-11.md](antigravity-plugins-2026-11.md) and [antigravity-headless-2026-11.md](antigravity-headless-2026-11.md). Every claim names its evidence under [docs/evidence/stage-1/](../evidence/stage-1/):
- `install/`: throwaway home, sign-in, auto-update, real-home check;
- `plugin/`: validate, install, `/hooks`, skill forms;
- `hooks-context/`, `hooks-stop/`: `PreInvocation` context and `Stop` continue;
- `hooks-deny/`: `PreToolUse` deny, in the parent and in subagents;
- `skills/`, `includes/`: `${...}` substitution, `tree/` install, `@path` includes;
- `statusline/`, `sandbox/`: status line stdin, sandbox and a local server.

Each file starts with the command that produced it. Paths are scrubbed to `$SCRATCH` and `$HOME`, and usage, email and quota values to `<removed>`. The probe plugin, its modes and `mkhome.sh` are in [hosts/antigravity/spike/](../../hosts/antigravity/spike/README.md).

## Answers

**1 · Install and sign-in isolation: a token-only throwaway home works, with one write outside it.**
- `hosts/antigravity/spike/mkhome.sh <dir>` copies only `~/.gemini/antigravity-cli/antigravity-oauth-token` (mode 600). It refuses a dir that is, holds or sits inside the real `.gemini` (`install/01`).
- `HOME=<dir> agy -p 'Reply with exactly: PONG'` answered `PONG`, exit 0. `agy` built the rest of `.gemini/antigravity-cli/` and `.gemini/config/` itself, and rewrote the copied token (`install/02`, `03`).
- **The real `~/.gemini` was unchanged across the whole stage:** no path, size, mtime or mode changed (`install/05`), and 233 file hashes matched before and after all five builders (`install/07`).
- **Outside HOME:** every `agy` start, even `agy -p /hooks` with `AGY_CLI_DISABLE_AUTO_UPDATE=1`, creates and removes `~/.local/bin/.update_test<n>` next to its binary, whatever `HOME` is. The binary itself was not changed (`install/06`).
- **Auto-update.** Without the variable, `agy` spawns a background update process (`install/04`). Set `AGY_CLI_DISABLE_AUTO_UPDATE=1` on every run; the binary carries that string (`install/04`).
- `agy` also keeps `~/.config/antigravity/credential-user-scope` in the real home. It was not touched, and the throwaway home got no `.config/` (`install/06`).

**2 · Install by path, `/hooks` and skill forms.**
- `agy plugin validate --strict <path>` passes the probe (one note: no logo). `agy plugin install <path>` copies it to `$HOME/.gemini/config/plugins/<plugin>/`, and `agy plugin list` shows `Source: antigravity` (`plugin/01`, `02`).
- `agy -p /hooks` lists each hook as `<name> enabled <event> <matcher> command <cmd>`, for all six events (`plugin/03`).
- **Hook environment.** A plugin hook runs with the plugin folder as its cwd, so `node ./hook.mjs` works. `PLUGIN_ROOT` is the installed folder and `PLUGIN_DATA` is `$HOME/.gemini/antigravity-cli/plugin_data/<plugin>` (`plugin/07`).
- **Skill forms.** `/<plugin>:<skill>` (here `/probe-plugin:probe`) is the invocation the host recognises: it expands the skill body into a `<SKILL>` block in the user input (`plugin/04`, `05`).
- Bare `/<skill>` (`/probe`) is not expanded. The model called `read_file` on the installed SKILL.md itself and still answered right (`plugin/04`, `05`).
- A prompt matching only the description also led the model to `read_file` the SKILL.md (`plugin/06`). Both are the model's choice, not a guarantee.

**3 · `PreInvocation` context: first call only, and it persists.**
- **Shape that works:** `{"injectSteps":[{"systemMessage":{"systemMessage":"<text>"}}]}`. `{}` injects nothing (`hooks-context/02`).
- With mode `context`, one prompt fired `PreInvocation` three times (`invocationNum` 0, 1, 2). Injecting only at 0 gave exactly one marker (`hooks-context/01`, `02`).
- The text lands as a `SYSTEM_SDK` / `SYSTEM_MESSAGE` step right after the user input, wrapped as "injected by a PreInvocation hook" (`hooks-context/03`).
- **It persists.** The final call, with no injection, still quoted the marker. Injecting on every call piles up one copy per call (`hooks-context/01`, `05`).
- **Resume resets `invocationNum`.** `agy -p '...' --conversation <id>` starts at `invocationNum:0` again, so a second copy lands: one per prompt accumulates across a conversation. No `SessionStart` fires on resume (`hooks-context/04`).

**4 · `PreToolUse` deny: works per tool and inside subagents; empty output allows.**
- **Shape:** `{"decision":"deny","reason":"<text>"}`. The step becomes `state:"ERROR"` with `tool call denied by pre-tool hook: <reason>`, and the model sees the same text (`hooks-deny/06`–`09`).
- **Per tool, with no side effect:** `run_command` (`06`), `write_file` (`07`), `edit_file` (`08`) and `invoke_subagent` (`09`, no subagent `SessionStart`, `subagents:[]`), all under `hooks-deny/`.
- **Inside a subagent.** With `invoke_subagent` allowed, the subagent's `run_command`, `write_file` and `edit_file` fired the same hook and were denied; nothing was written (`hooks-deny/11`, `12`).
- **No subagent marker.** The subagent's payload has the parent's keys and differs only in its own `conversationId`, transcript paths and an empty `lastUserInput`. The parent id is only in the subagent transcript's first system message (`hooks-deny/12`; fixtures `PreToolUse-deny-5..8.json`, `SessionStart-deny-1.json`).
- **`toolCall.args` field names:** `run_command` `CommandLine`, `WaitMsBeforeAsync`, `toolSummary`; `write_file` `Path`, `Content`; `edit_file` `Path`, `Target`, `Replacement`; `invoke_subagent` `Prompt`, `Role`, `TypeName`; `send_message` `Message`, `Recipient` (fixtures `PreToolUse-deny-1..4.json`, `-8.json`).
- **Hook denies are absent from `denied_actions`** in both `stream-json` and `json` output. Exit is 0 and `status:"SUCCESS"`. `denied_actions` lists only the host's own permission denies (`hooks-deny/06`–`10`).
- **Failure modes** (`hooks-deny/13`, `14`):
  - `{}` with exit 0: **blocked**, with an empty reason;
  - exit 1: **blocked**, with the stderr in the error;
  - nothing printed, exit 0: **allowed**. The file was written and `PostToolUse` fired. This contradicts the research note and the spike README, now corrected.

**5 · `Stop` continue: capped at 10, and `continuationActive` never flips.**
- **Shape:** `{"decision":"continue","reason":"<text>"}`. The host adds `Stop hook blocked termination: <reason>` and the model runs again (`hooks-stop/03`).
- **Cap of 10.** On one `-p` prompt, `Stop` fired 11 times (`executionNum` 0 to 10). The host honoured 10 continues and ignored the 11th. The run ended `SUCCESS`, exit 0 (`hooks-stop/01`, `02`).
- **`continuationActive` was `false` on all 11 payloads**, against the changelog. Count with `executionNum` or the hook's own state (`hooks-stop/02`; fixtures `Stop-ctx-1.json`, `Stop-ctx-2.json`).
- `Stop` fires only at the end of a turn, not between tool calls inside a continuation. The changelog says the cap is configurable; the setting's name wasn't found (`hooks-stop/02`, `03`).

**6 · `${...}` substitution in skills: none.**
- `${PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_SKILL_DIR}`, `$ARGUMENTS`, `$1` and the others all reach the model literally, in the slash form and the description form. Slash arguments stay in `<USER_REQUEST>` only (`skills/02`, `03`).
- `run_command` gets no `PLUGIN_*` or `SKILL_*` variables, only `ANTIGRAVITY_*` (`skills/06`).
- **How a skill finds its folder:** the skill listing in the model's context carries each SKILL.md path. The model gave the folder with no tool call (`skills/04`). "Run `scripts/marker.sh` that sits in this skill's folder" ran `sh <abs>/skills/runner/scripts/marker.sh`, with the workspace as cwd (`skills/05`).

**7 · GitHub `tree/` install: a branch works, a SHA doesn't.**
- `agy plugin install https://github.com/<owner>/<repo>/tree/main/plugins/<plugin>` cloned to a temp dir, installed that subfolder only, and removed the clone (`skills/07`).
- A commit SHA as the ref fails: agy runs `git clone --branch <ref>` (`skills/10`).
- **A Claude Code plugin is converted.** `Source: claude-code`; a native `plugin.json` is generated; `.mcp.json` becomes `mcp_config.json`; `commands/*.md` become skills, losing `argument-hint` and `allowed-tools`, with `$ARGUMENTS` literal (`skills/08`, `09`).

**8 · `@path` includes: only the link form inlines.**
- `@CLAUDE.md` and `@./CLAUDE.md` in `AGENTS.md` are not inlined. The host rewrites them to an absolute `@` path, and the model didn't read the file (`includes/01`, `02`, `07`).
- `@[claude rules](CLAUDE.md)` is inlined: the file's content replaces the line (`includes/03`).
- Without includes, agy reads `AGENTS.md` and `GEMINI.md` but not `CLAUDE.md` (`includes/04`–`06`).
- Rules aren't stored in the transcript, so the proof is the model's verbatim quote with zero tool calls (`includes/07`).

**9 · Status line stdin.**
- **Setting:** user settings `$HOME/.gemini/antigravity-cli/settings.json`, `{"statusLine":{"type":"command","command":"<script>","enabled":true}}`. The script's stdout renders under the input box (`statusline/01`, `02`).
- **Fields:** `cwd`, `session_id`, `conversation_id`, `transcript_path`, `model{id,display_name,effort}`, `workspace`, `version`, `context_window{…}`, `exceeds_200k_tokens`, `product`, `quota{…}`, `agent_state`, `cycle_mode`, `sandbox{enabled}`, `plan_tier`, **`email`**, `terminal_width`. **No cost field** (`statusline/03`; fixtures `statusline-1..3.json`).
- **`transcript_path` is wrong:** it points under `~/.gemini/antigravity/brain/`, which doesn't exist; the file is under `~/.gemini/antigravity-cli/brain/` (`statusline/03`).
- Calls are event-driven (19 in one short session), stop while idle, and run with the workspace as cwd (`statusline/02`). `sandbox.enabled` follows the flag, not what happens to commands (`statusline/04`).

**10 · Sandbox vs a local server on the host (127.0.0.1).**

| Case | Where the command ran | Reached the server? | Evidence |
| :-- | :-- | :-- | :-- |
| default `-p`, auto mode | sandbox | no | `sandbox/02` |
| `--add-dir <server dir>` | sandbox | no | `sandbox/03` |
| `permissions.allow` rules, auto mode | sandbox | no | `sandbox/04` |
| auto mode, model retries with `BypassSandbox: true` | outside, after a host review | yes | `sandbox/05`, `06` |
| `enableTerminalSandbox: false`, auto mode | sandbox | no | `sandbox/08` |
| **`--mode accept-edits` + allow rules** | **host** | **yes** | `sandbox/09`, `10` |
| `--mode accept-edits`, no rule | not run (soft deny, exit 0) | no | `sandbox/11` |
| `--mode accept-edits` + rules + `--sandbox` | sandbox | no | `sandbox/12` |
| **server and client in one sandboxed command** | sandbox | **yes** | `sandbox/14` |

- `BypassSandbox` is a hidden `run_command` argument, absent from stream-json `parameters`. Asked outright to set it, the model refused (`sandbox/05`, `07`).
- Known settings keys: `enableTerminalSandbox`, `permissions`, `statusLine`. `sandbox`, `network` and similar are unknown (`sandbox/13`).

## Fixtures

Every event's stdin is under [hosts/antigravity/fixtures/](../../hosts/antigravity/fixtures/):
- `SessionStart`: `SessionStart-1..3.json`; in a subagent, `SessionStart-deny-1.json`.
- `PreInvocation`: `PreInvocation-1..5.json`; context runs, `PreInvocation-ctx-1..2.json`.
- `PostInvocation`: `PostInvocation-1..5.json`.
- `PreToolUse`: `PreToolUse-1..2.json`; deny runs, `PreToolUse-deny-1..8.json` (1–4 the four tools in the parent, 5–8 inside a subagent, 8 `send_message`).
- `PostToolUse`: `PostToolUse-1..2.json`.
- `Stop`: `Stop-1..3.json`; continue runs, `Stop-ctx-1..2.json` (2 is the capped Stop, `executionNum:10`).
- Status line: `statusline-1..3.json` (after a turn, before the first prompt, with `--sandbox`).

## What this means for stage 2

- **The hook must print an explicit decision on every path.** Empty output allows, so a crash path that prints nothing fails open. Print `{"decision":"deny",…}` or `{"decision":"allow"}`, and treat exceptions as deny.
- **Drivers detect hook denies by `ERROR` steps and the deny text**, not `denied_actions`, which omits them.
- **The subagent hold works on `invoke_subagent`, and denies also reach a subagent's own tools.** The payload has no subagent marker, so a subagent's calls are judged as the parent's would be.
- **`Stop` carry-on is capped at 10 per prompt.** Autopilot carry-on needs its own counter: `executionNum` per prompt, plus hook state across prompts. `continuationActive` can't be used. Whether `executionNum` resets on resume is unproven.
- **The hook must keep its mode and state where allowed tools can't write.** In verification the model overwrote the probe's `$HOME/PROBE_MODE` with `run_command` and ended a `continue` run (`../evidence/stage-1/verify/check3-stop-tampered.txt`).
- **`## Now` injection persists in the conversation**, so injecting once per prompt (`invocationNum === 0`) is right. Copies still pile up one per prompt, and on resume.
- **The package's rules point the model at `CLAUDE.md`** (plan decision 2026-11-25). A link include, `@[label](CLAUDE.md)`, in a project's own `AGENTS.md` works (bare `@CLAUDE.md` doesn't), but JBIT doesn't write `AGENTS.md`.
- **The capture script is found by wording,** "`scripts/<x>` in this skill's folder". No variable is substituted.
- **The status line can't be set by the plugin;** it is a user setting. Its stdin carries the account email, so never log it whole.
- **Screenshots against a local server** need `--mode accept-edits` plus an allow rule, or the server started inside the same command as the client. `--add-dir`, allow rules in auto mode and `enableTerminalSandbox: false` don't lift the sandbox.

## Open concerns

- **`run_command` ran without a prompt in `-p` auto mode** (`find`, `ls -la $HOME`, `ps aux`), with the hook answering allow and no `--dangerously-skip-permissions` (`hooks-stop/03`). Whether the hook's allow bypassed the permission check, or the host allows such commands by default, is unresolved. Stage 2's guard must not assume the host prompts behind it.
- **`agy` writes outside `HOME` on every start** (`~/.local/bin/.update_test<n>`, created and removed; `install/06`). A home guard that checks only `HOME` won't see it.
