# Antigravity CLI (`agy`): headless runs, tools, subagents and browser (research, 2026-11-25)

Scope: what `hosts/parity/` and the verify skill need to drive Google Antigravity CLI (`agy`, v1.5.17 at `~/.local/bin/agy`) headless: print mode and its event stream, exit codes, permissions, sandbox, built-in tools (browser above all), subagents, model and effort, workspace trust, and where `agy` writes under the home directory. All sources were read 2026-11-25. Docs are the raw Markdown mirrors at `https://antigravity.google/docs/<page>.md`. "Local" means the installed CLI: `agy --help`, `agy help <sub>`, `agy models`, `agy agents`, `agy changelog`, the bundled docs under `~/.gemini/antigravity-cli/builtin/skills/`, and six short print-mode runs (five model calls on `gemini-3.8-flash-low`, plus zero-cost flag-validation calls) in scratch dirs under `/tmp/claude-1000/.../scratchpad/agyrun/`. No token, `config.json`, `history.jsonl` or conversation file was read.

**Instructions aimed at agents.** None in the web pages. Two local texts address the model, both as tool/skill content for `agy`'s own agent, not for us: the bundled `antigravity_guide` skill tells the agent to "fetch the relevant page above" for CLI questions, and a headless permission denial returns a tool error saying "Do not attempt to circumvent this denial by rephrasing the command, using alternative tools/scripts ... Proceed without performing this action." Both were treated as data.

**Interference seen.** During run 3 a `PreToolUse` hook named `jsonhook__probe-claude_PreToolUse_0_0` (not ours, not from any installed plugin: `agy plugin list` says none) failed with `fork/exec /usr/bin/sh: no such file or directory` and blocked one `run_command`. At the same time `~/.gemini/config/import_manifest.json` and `~/.gemini/config/plugins/` appeared. Most likely a parallel probe imported Claude hooks into the shared `~/.gemini` state. Lesson: `agy` runs on one machine share all `~/.gemini` state, so parity runs need their own home (see section 8).

---

## 1. Print mode, output formats and the event schema

**Question.** What do `agy -p --output-format json|stream-json` emit: tool calls, results, the final event?

**Answer.**
- `-p` / `--print` / `--prompt` runs one prompt and exits. The response goes to stdout; diagnostics, auth prompts and permission notices go to stderr. `--print-timeout` (default `0s`, no limit) caps the run. `--input-format stream-json` (needs `--output-format stream-json`) reads one NDJSON user message per line and runs a turn for each. `--json-schema` constrains the final answer and adds `structured_output` and `json_schema`. `-c` / `--conversation <id>` resume.
- **`json`**: one line at the end: `{conversation_id, status, response, error?, duration_seconds, num_turns, usage{input_tokens, output_tokens, thinking_tokens, cache_read_tokens, total_tokens}}`. Observed but not documented: `denied_actions: [{action:"command", display_name:"Bash"}]` when a tool was auto-denied (run 6), and `finished_reason: "error"` on flag errors.
- **`stream-json`**: NDJSON, every line `{"event": <type>, <type>: {...}}`:
  - `init` once: `cwd`, `tools` (all tool names), `permission_mode`, plus `model` / `agent` / `json_schema` when set. `permission_mode` read `request-review` in every run, even under `--mode accept-edits` and with the default `auto` mode, so it does not show the agent mode; only `--dangerously-skip-permissions` changes it (to `always-proceed`, per docs).
  - `step_update` many: `{conversation_id, step_index, state, step_type, tool_name?, text_delta?, duration_seconds?, usage?, tool_info?, subagent_info?}`. `state` is `ACTIVE` or `DONE` per docs; runs 3 and 6 also showed `ERROR`. `step_type` observed: `user_input`, `agent_response`, `tool`, `subagent`, `system_message`, `checkpoint` (docs). A tool step appears `ACTIVE` with `tool_info{name, parameters}`, then `DONE` with `output`, or `ERROR` with `error{type:"TOOL_ERROR", message}`. Shell output is wrapped: `"Created At: ...\nCompleted At: ...\nCommand exited with code N.\n\nCommand output:\n..."`. Response text arrives as `text_delta` fragments on `ACTIVE` `agent_response` steps.
  - `result` once: same shape as the `json` envelope.
- A subagent's own tool calls do not appear in the parent stream; only the parent's `invoke_subagent` step does (section 5).

**Sources.**
- https://antigravity.google/docs/cli/headless.md (read 2026-11-25)
- https://antigravity.google/docs/cli/reference.md (read 2026-11-25)
- Local: `agy --help`; runs 1-6 (read 2026-11-25)

**Confidence.** High. Docs and runs agree; the extra fields (`denied_actions`, `ERROR` state, `subagent`/`system_message` step types) are observed, not documented.

**What it changes for the plan.**
- The parity driver parses `stream-json`: tool calls from `step_update` where `step_type` is `tool` or `subagent` and `state` is `DONE` or `ERROR`; the verdict text from `result.response`; status from `result.status`.
- Shell exit codes must be parsed from the `Command exited with code N.` line inside `tool_info.output`; there is no separate field.
- The parity judge must not equate `status: SUCCESS` with "did the work" (section 2).

---

## 2. Exit codes and permissions headless

**Question.** What are the exit codes, and what happens when a tool needs approval with no one to ask?

**Answer.**
- Exit `0` on a run that produced a response; non-zero (observed `1`) when it fails to, for example an unknown `--model`, an invalid `--effort`, or a model/effort conflict (`--model gemini-3.8-flash-low --effort max` -> "conflicts with --effort=max"). Headless never silently falls back to another model. `status` values: `SUCCESS`, `ERROR`, `CANCELED`, `INTERRUPTED`, `INVALID`, `WAITING`, `RUNNING`. Unauthenticated runs with no terminal exit with `authentication required` instead of hanging.
- **Soft deny.** A tool that needs approval is auto-denied, the run continues, and it **exits 0 with `status: SUCCESS`**. Run 6 (`--mode accept-edits`, `touch made.txt`): the tool step ended `ERROR` ("permission check failed for unsandboxed ... user denied permission"), `response` was empty, `result.denied_actions` listed the command, and stderr said a tool "required the "command" permission that headless mode cannot prompt for, so it was auto-denied".
- **Modes.** Since v1.5.7, if `agentMode` is unset, `-p` runs in `auto` where available (Linux with unprivileged user namespaces, personal accounts), otherwise `default`. `auto`: workspace edits and sandboxed commands run; commands that need to leave the sandbox are reviewed by a model and risky ones still need approval (soft-denied headless). `accept-edits`: edits run, every shell command asks. `default`: shell asks. `--mode=auto` where unavailable warns and continues in `default`.
- **Pre-granting.** `permissions.allow` rules in `~/.gemini/antigravity-cli/settings.json` (or per run with `--settings '<json>'`, never saved), for example `command(git)`, `command(regex:npm run (build|lint|test))`, `write_file(src/)`, `read_url(...)`. `--dangerously-skip-permissions` approves everything; it and `strict` take precedence over `auto`.

**Sources.**
- https://antigravity.google/docs/cli/headless.md (read 2026-11-25)
- https://antigravity.google/docs/cli/modes.md (read 2026-11-25)
- https://antigravity.google/docs/permissions.md (read 2026-11-25)
- Local: runs 5 and 6, `agy --help` (`--settings`) (read 2026-11-25)

**Confidence.** High for exit codes and soft deny (seen). Medium on whether `--dangerously-skip-permissions` also lifts the sandbox; not tested.

**What it changes for the plan.**
- The parity driver must fail a scenario when `result.denied_actions` is non-empty or any tool step ends `ERROR`, not only on a non-zero exit.
- Pin the mode per run (`--mode auto` or explicit `--settings` with allow rules) rather than depend on the user's `settings.json`. Use `--settings` for scenario-specific allow rules so nothing is saved.
- Do not use `--dangerously-skip-permissions` as the default in parity; it would hide permission behaviour that real users meet.

---

## 3. `--add-dir` and `--sandbox`: shell and network

**Question.** What do `--add-dir` and `--sandbox` change for shell and network?

**Answer.**
- `--add-dir <path>` (repeatable) adds a folder to the workspace, the same as `/add-dir`. Workspace folders are mounted read-write in the sandbox and are where `auto` mode edits without asking. Outside the workspace, Auto mode (v1.5.17) reads without asking and edits without asking only inside a version-controlled repo or when the change only adds content; otherwise it asks. `allowNonWorkspaceAccess` widens this.
- **Linux sandbox**: kernel namespaces. Workspace and temp dirs and common build caches are writable; `/usr`, `/etc` readable; `~/.config` (except Git, Go, npm, Python settings) and `~/.git-credentials` blocked since a recent release; `.env` and the like blocked. **No network by default**, including the host's loopback: domains under `read_url` allow rules join an outbound allowlist.
- **`--sandbox`** forces the sandbox on for the session; `auto` mode turns it on anyway. If the sandbox is unavailable (no unprivileged user namespaces, some containers), `--sandbox` has no effect and `auto` is not offered. This WSL2 machine supports user namespaces (`unshare --user` works).
- **Observed** (runs 2 and 3, the second without `--sandbox`, so `auto` mode's sandbox): `curl http://127.0.0.1:8765/` against a server on the host failed with exit 7 (connection refused) in both; `curl https://example.com` exited 6 (DNS) in run 2. `echo x > <scratch>/outside.txt` under `/tmp` succeeded. `ls ~/.config` showed 1 of 8 entries. `ls ~/.cache/ms-playwright` worked.

**Sources.**
- https://antigravity.google/docs/sandbox.md (read 2026-11-25)
- https://antigravity.google/docs/cli/reference.md, https://antigravity.google/docs/settings.md, https://antigravity.google/docs/features.md (read 2026-11-25)
- Local: `agy changelog` (v1.5.x entries on `~/.config` and outside-workspace edits); runs 2 and 3 (read 2026-11-25)

**Confidence.** High on network isolation (docs and two runs). Medium on `--add-dir`: docs only, not run.

**What it changes for the plan.**
- The verify skill's capture script cannot reach a dev server started outside the sandbox: loopback is a separate namespace. Either start the server and run `capture.mjs` in the same sandboxed command, or grant the run a way out (an allow rule for the command, so it runs outside the sandbox, or `--dangerously-skip-permissions` in a throwaway home). Playwright's browser cache is readable, so launching Chromium inside the sandbox is plausible but untested.
- Any scenario that needs `npm install` or other network access must be pre-granted or will be soft-denied (exit 0).
- Use `--add-dir` for evidence dirs outside the scenario workspace rather than relying on Auto mode's outside-workspace rules.

---

## 4. Built-in tools, and is there a browser for screenshots?

**Question.** Which tools does `agy` have, and can its browser take screenshots headless?

**Answer.**
- `init.tools` in every run listed 60 tools: shell `run_command`, `command_status`, `send_command_input`, `manage_task`, `wait`; files `view_file`, `list_dir`, `find_by_name`, `grep_search`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`, `sed_file`, `notebook_edit`, `notebook_execution`; web `search_web`, `read_url_content`; agents `invoke_subagent`, `define_subagent`, `manage_subagents`, `send_message`, `manage_inbox`, `run_workflow`, `browser_subagent`; browser `open_browser_url`, `read_browser_page`, `capture_browser_screenshot`, `capture_browser_console_logs`, `execute_browser_javascript`, `list_browser_pages`, `browser_click_element`, `browser_input`, `browser_resize_window`, `browser_scroll`, `browser_get_dom`, `browser_list_network_requests` and more; plus `ask_permission`, `ask_question`, `call_mcp_tool`, `generate_image`, `schedule`, `search_marketplace`, `finish`. (Docs and the bundled migration skill also use `read_file`/`edit_file`/`write_file` as permission and `tools:` names; the runtime names differ.)
- **Browser in the CLI** is the `browser` subagent driving a local Google Chrome 144+ through Chrome DevTools MCP, launched with `npx chrome-devtools-mcp`. It needs Chrome already running with remote debugging turned on at `chrome://inspect/#remote-debugging`, and a human must click **Allow** in Chrome within 60 seconds. Docs describe starting it with the interactive `/browser` command. It can capture screenshots, snapshots, console and network logs, and MP4 recordings. The built-in no-setup browser is App-only (personal accounts, v2.30.0+). JavaScript evaluation defaults to Request Review.

**Sources.**
- https://antigravity.google/docs/browser.md, https://antigravity.google/docs/commands/browser.md, https://antigravity.google/docs/ide/browser.md (read 2026-11-25)
- https://antigravity.google/docs/subagents.md (read 2026-11-25)
- Local: `init.tools` from runs 1-6 (read 2026-11-25)

**Confidence.** High that the tools exist and that the CLI browser needs an attended Chrome. Low on whether a headless `-p` run can use `browser_subagent` at all; not tried, since it needs a Chrome with remote debugging and a click.

**What it changes for the plan.**
- Keep `capture.mjs` (Playwright) as the only screenshot path for the Antigravity package. Do not offer "the host's own browser tools" as a fallback for `agy`: it needs a human-attended Chrome, so it cannot run unattended in verify or parity.
- The generated package's skill text should name `run_command` for running the capture script, and note the sandbox's network rule (section 3).

---

## 5. Subagents: how they start, and per-agent model and effort

**Question.** How are subagents started, and can model or effort be set per agent?

**Answer.**
- The parent calls `invoke_subagent` (or `define_subagent` for a transient one). Built-ins: `research`, `browser`, `self`; `agy agents` printed nothing here (no custom agents installed). Subagents start with a clean context, can run concurrently, nest up to 10 levels, and take a workspace option `inherit`, `branch` (isolated git worktree) or `share`. They inherit the parent's allowed commands, file scopes and sandbox; their permission requests bubble up (and so are soft-denied headless).
- Custom agents are Markdown with YAML frontmatter at `.agents/agents/<name>.md` (workspace), `~/.gemini/config/agents/` (global), or `agents/` in a plugin. Keys: `name`, `description`, `tools`, `mainAgent`, `subagent`, `model`, `commandExecutionPolicy`, `mcpServers`, `skills`/`plugins`. **`model` is a tier only: `inherit`, `flash` or `pro`. There is no per-agent effort key.** An omitted `tools` gives a small read-only set; a misspelled tool name can hang the subagent (documented known issue). `--agent <name>` picks the main agent for a run.
- **Observed** (run 4): the step has `step_type: "subagent"`, `tool_name: "invoke_subagent"`, and `subagent_info.subagents[]` with `type_name`, `role`, `initial_prompt`, then (on `DONE`) `conversation_id`, `log_uri` (`file:///home/jonah/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl`) and `workspace_uris`. The parent got a `system_message` step when the subagent finished and the run stayed open until then. The subagent's own tool calls were not in the stream.

**Sources.**
- https://antigravity.google/docs/subagents.md (read 2026-11-25)
- Local: `~/.gemini/antigravity-cli/builtin/skills/migrate-agent-settings/SKILL.md` (Claude agent -> Antigravity mapping: drop `model`, always write `tools`); run 4 (read 2026-11-25)

**Confidence.** High on invocation and the stream shape. Medium on `model` tiers: docs only.

**What it changes for the plan.**
- Generated role agents map JBIT's per-role model to `model: pro` or `flash` (or `inherit`), and drop effort. Record that per-role effort is lost on this host.
- Always emit an explicit `tools:` list with runtime names (`view_file`, `run_command`, ...), and test it, because a wrong name hangs.
- Parity can tell a subagent was used from the `subagent` step, but judging what the subagent did means reading its `log_uri` transcript, which lives under the host home.

---

## 6. `agy models` and `--effort`

**Question.** What do `agy models` and `--effort` offer?

**Answer.**
- `agy models` lists slugs that already encode effort: `gemini-4-{neon,carbon,argon,hydrogen}-{low,medium,high,xhigh}`, `gemini-pro-orchestrator[-neon|-argon]`, `gemini-3.8-flash-{low,medium,high}`, `claude-opus-5-5-{low,medium,high}`, `claude-sonnet-5-5-{low,medium,high}`, `gpt-oss-120b-medium` (this account; the docs list differs, so the list is account-dependent).
- `--effort low|medium|high|xhigh|max` (available levels depend on the model). Combining an effort slug with a different `--effort` fails with exit 1 ("conflicts with --effort"). The Orchestrator rows run a planner and an executor with separate efforts (v1.5.17 changelog), saved under `"orchestrator"` in settings.

**Sources.**
- https://antigravity.google/docs/cli/headless.md (read 2026-11-25)
- Local: `agy models`, `agy changelog`, run 5 (read 2026-11-25)

**Confidence.** High.

**What it changes for the plan.**
- Parity pins `--model <slug>` per scenario and never also passes `--effort`, or passes `--effort` with no `--model`. Read the slug list from `agy models` at run time; it varies by account.
- The cheapest slug seen working headless is `gemini-3.8-flash-low` (about 10-17k input tokens per trivial run, mostly the system prompt).

---

## 7. Workspace trust

**Question.** Does headless mode stop on an untrusted folder?

**Answer.** `trustedWorkspaces` in `settings.json` holds folders the user trusted "when the CLI asked"; the CLI adds them. Here it holds only `/home/jonah`. All six runs were in `/tmp/...` scratch dirs outside it, and none prompted, failed or added an entry. The docs say nothing about trust in print mode. Separately, project-scoped settings and permissions exist in the App.

**Sources.**
- https://antigravity.google/docs/cli/reference.md, https://antigravity.google/docs/settings.md (read 2026-11-25)
- Local: `~/.gemini/antigravity-cli/settings.json` before and after runs 1-6 (read 2026-11-25)

**Confidence.** Medium. Observed for `/tmp`; whether workspace `.agents/` customizations (hooks, rules) load in an untrusted folder in `-p` was not tested.

**What it changes for the plan.**
- No trust step is needed for headless parity runs. Add one parity check that a workspace-level `.agents/` hook or skill actually loads in a fresh scratch dir, since trust may gate customizations rather than the run.

---

## 8. Where `agy` writes under the home directory

**Question.** Where does it write plugin caches and other state (for the guard that protects the host's home dir)?

**Answer.**
- **Installed plugins**: `~/.gemini/config/plugins/<plugin_name>/` ("the CLI stages plugin assets in your global configuration directory"). Global agents `~/.gemini/config/agents/`, MCP `~/.gemini/config/mcp_config.json`, plus `~/.gemini/config/import_manifest.json` (appeared after a plugin import). Workspace plugins: `.agents/plugins/`.
- **Per-run state** in `~/.gemini/antigravity-cli/`: `brain/<conversation_id>/` (transcripts, including subagents), `conversations/`, `conversation_summaries.db*`, `history.jsonl`, `presence/<id>.lock`, `log/cli-<timestamp>.log` (+ `cli.log` symlink), `crashes/`, `implicit/`, `plugin_data/`, `cache/` (`marketplaces/<name>/marketplace.json`, `CHANGELOG.md`, onboarding state), `settings.json`. `builtin/` holds bundled skills and the `swarm` plugin. All of these changed during the runs.
- The CLI's `--app-data-dir`, `--gemini-dir` and `--cli_dir_name` flags exist on `agy acp` but not on the main command; `HOME` is the likely lever for isolation (untested).

**Sources.**
- https://antigravity.google/docs/plugins.md, https://antigravity.google/docs/subagents.md (read 2026-11-25)
- Local: `agy help acp`; directory listings (names only) of `~/.gemini` before and after runs (read 2026-11-25)

**Confidence.** High on the paths (docs and listings). Low on isolating with `HOME`: untested, and auth lives in `~/.gemini/antigravity-cli/antigravity-oauth-token`, so a fresh home would need that file copied in.

**What it changes for the plan.**
- The home guard for this host must allow writes to `~/.gemini/antigravity-cli/` (every run writes there) and treat `~/.gemini/config/` (plugins, agents, MCP) and `~/.gemini/antigravity-cli/settings.json` as protected: those are what a plugin install or a scenario could change.
- Parity runs should use a throwaway `HOME` with only the token copied in, both to keep the guard simple and to stop parallel runs sharing hooks and plugins (the interference above). Prove that in a spike before relying on it.
