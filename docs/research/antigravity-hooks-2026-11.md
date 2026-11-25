# Antigravity CLI (`agy`): hooks, permissions and settings (research, 2026-11-25)

Scope: what a generated JBIT package for Google Antigravity CLI (`agy` 1.5.17) must match to port the hook's guards: the commit gate, the edit and subagent holds, the secret guard, the per-prompt `## Now` injection and the status line. All sources were read on 2026-11-25. There are three kinds:
- **Builtin docs:** the skills that ship with the CLI, under `~/.gemini/antigravity-cli/builtin/skills/` (`agy-customizations/docs/hooks.md`, `plugins.md`, `json_configs.md`; `plugin/SKILL.md`; `antigravity_guide/references/cli.md`).
- **Web docs:** https://antigravity.google/docs/cli/reference.md, https://antigravity.google/docs/settings.md (CLI tab), https://antigravity.google/docs/permissions.md (CLI tab) and https://antigravity.google/docs/hooks.md (CLI tab).
- **Local CLI:** `agy --help`, `agy help plugin` and `agy changelog`.

**Probe:** a throwaway project under the session scratchpad with `.agents/hooks.json` and a Node hook that logs what it receives on stdin. It took five `agy -p` runs and two print-mode slash commands. Each run passed `--settings` to trust the folder and set the mode, so the saved `settings.json` was never edited. Where the probe and the docs disagree, the probe wins, and the disagreement is noted.

No page I read contained instructions aimed at an AI agent. One search result was listed on `www.antigravity.google` under the odd title "newspaperPress Guidelines", and I did not open it.

**Run contamination.** During probe run 2, the subagent's `run_command` also went through a hook from a global plugin, `~/.gemini/config/plugins/probe-claude`, and that hook failed with `MODULE_NOT_FOUND`. The plugin was gone by 09:19:35, so another agent researching at the same time probably installed it. It may also explain the unexplained `write_file` deny in run 1. Run 3, the failure-mode run, started with `~/.gemini/config/plugins/` empty.

---

## 1. Lifecycle events

**Answer.** There are six events: `SessionStart`, `PreToolUse`, `PostToolUse`, `PreInvocation` (before each model call), `PostInvocation` (after each model call) and `Stop`. The probe saw all six fire.
- **Missing events.** There is no `UserPromptSubmit` and no `SubagentStart` event.
- **Prompt events.** `PreInvocation` fires before every model call in a turn, not just once per user prompt. Its payload carries `invocationNum` (0, 1, 2, …), `initialNumSteps` and `lastUserInput`.
- **Subagents.** A subagent is started through the tool `invoke_subagent`, which `PreToolUse` sees. The subagent's own tool calls (for example its `run_command`) also go through the workspace `PreToolUse` hooks; the probe saw this.
- **Stop.** `Stop` receives `terminationReason`, `continuationActive` and `fullyIdle`, and returns `{"decision":"continue","reason":…}` to keep the agent working.

**Sources.**
- Builtin `hooks.md` (read 2026-11-25)
- https://antigravity.google/docs/hooks.md (read 2026-11-25)
- `agy changelog` (read 2026-11-25)
- Probe runs 1 and 2 (2026-11-25)

**Confidence.** High.

**What it changes for the plan.**
- Map JBIT's prompt-submit context injection to `PreInvocation`, injecting only when `invocationNum === 0`. An injected `systemMessage` persists in the conversation, so injecting on every invocation would pile up copies.
- Hold subagents by gating the tool `invoke_subagent` in `PreToolUse` (the docs also list `define_subagent`, `send_message` and `manage_subagents`). There is no subagent-start event to use.

## 2. Config location, schema and plugin bundling

**Answer.** Hooks live in `hooks.json`, in one of three places:
- the workspace's `.agents/hooks.json`, found by walking up from the working directory to the repo root, and loaded only when the workspace is trusted;
- the global `~/.gemini/config/hooks.json`;
- a plugin's root `hooks.json`.

The `settings.json` keeps a `hooks` key, but the CLI never loads it.

**Schema.** The file maps hook names to specs: `{ "<name>": { "enabled"?: bool, "<Event>": [...] } }`.
- `PreToolUse` and `PostToolUse` take groups, each with a `matcher` (a regular expression; `*` or `""` matches every tool) and a list of `hooks`. `SessionStart`, `PreInvocation`, `PostInvocation` and `Stop` take a flat list of handlers.
- A handler is `{ "type": "command", "command", "timeout" }`. `timeout` is in seconds, defaults to 30, and is enforced: the probe set 3 s and the hook was killed.
- The command runs through `sh -c`, with the folder that holds `hooks.json` as its working directory. The probe confirmed this: the hook ran in `.agents/`.

**Plugins.** A plugin can bundle hooks. `plugins/<name>/plugin.json` sits next to `hooks.json`, `skills/`, `agents/`, `rules/AGENTS.md` and `mcp_config.json`.
- Native plugins must put `hooks.json` at the plugin root. `agy plugin validate` warns that `hooks/hooks.json` is not read, and that a Claude Code-style top-level `"hooks"` key loads as a single hook named `hooks`.
- Plugin hooks get `PLUGIN_ROOT` and `PLUGIN_DATA` as environment variables. They are not substituted into `command`, so refer to bundled files with relative paths.
- `agy plugin import claude` and `agy plugin install` convert a Claude Code plugin's `hooks/hooks.json`. They convert the `PreToolUse`, `PostToolUse`, `Stop` and startup `SessionStart` hooks, map matchers such as `Bash` to `run_command` and set a 60 s timeout. Hooks with no equivalent appear as warnings in the import summary.
- `agy -p "/hooks"` lists the active hooks, one tab-separated line each, without a model turn. The probe confirmed this.

**Sources.**
- Builtin `hooks.md`, `plugins.md` and `plugin/SKILL.md` (read 2026-11-25)
- https://antigravity.google/docs/settings.md (read 2026-11-25)
- https://antigravity.google/docs/hooks.md (read 2026-11-25)
- `agy changelog` entries on import conversion and `plugin validate` (read 2026-11-25)
- Probe (2026-11-25)

**Confidence.** High.

**What it changes for the plan.**
- Generate the package as a native plugin, with `plugin.json` and a root `hooks.json` that call `node ./hook.mjs <event>`.
- Don't rely on `agy plugin import claude` to convert the JBIT hook. It is a TS-modules hook, there is no prompt-submit event to convert to, and the conversion would be lossy.
- Use `agy -p /hooks` as an install check that costs no quota.
- Repo note: `agy` scans `.agents/` for customizations. JBIT's `.agents/plugins/marketplace.json` (written for Codex) is a file, not a plugin folder, so it should be inert. This was not tested.

## 3. Input JSON, deny and inject (fail behaviour included)

**Answer.**
- **Common input.** Every payload is camelCase JSON with `conversationId`, `workspacePaths`, `transcriptPath`, `artifactDirectoryPath`, `modelName`, `lastUserInput`, `hookEventName` and `cwd`. `cwd` is the agent's working directory, not the hook's.
- **`PreToolUse` input.** It adds `toolCall {id, name, args}` and `stepIdx`.
- **`PreToolUse` output.** `{"decision":"allow"|"deny"|"ask"|"force_ask", "reason", "permissionOverrides", "overwrite"}`. `overwrite` is a shallow merge into the tool's arguments. The changelog also mentions an `auto_approve` value.
- **Deny.** A deny reaches the model as `tool call denied by pre-tool hook: <reason>`.
- **Context injection.** `SessionStart`, `PreInvocation` and `PostInvocation` return `{"injectSteps":[{"systemMessage":{"systemMessage":"…"}}]}`. The other step types are `userMessage` and `errorMessage` (`{"errorMessage":{"userMessage":"…"}}`, shown to the user only). The probe confirmed the model received an injected system message.
- **Blocking a prompt.** `PreInvocation` returns `"terminationBehavior":"terminate"`. Paired with an `errorMessage`, this also makes `-p` exit non-zero.

**Fail behaviour, probed.** A `PreToolUse` hook fails closed in the cases below: each blocked the tool call and showed the error text to the model. **Correction (2026-11-25):** it does not fail closed in every case. A hook that prints nothing and exits 0 **allows** the tool; `{}`, a non-zero exit and (per this note) a timeout block it. See [the spike note](antigravity-spike-2026-11.md), finding 4.

| Hook outcome | Message the model saw |
| :-- | :-- |
| No `decision`, output `{}` | `tool call denied by pre-tool hook:` |
| Exit status 2 | `JSON hook "…" failed: command failed: exit status 2, stderr: boom` |
| Invalid JSON | `failed to unmarshal result from hook … via protojson` |
| Timeout | `… signal: killed` |

This contradicts nothing in the docs, which are silent on failures. The `{}` result is the surprise.

A `PostToolUse` failure is logged and the tool keeps its result (changelog). `Stop` hooks that always say continue are cut off after a configurable number of continuations (changelog).

**Sources.**
- Builtin `hooks.md` (read 2026-11-25)
- `agy changelog` (read 2026-11-25)
- Probe runs 1 and 3 (2026-11-25)

**Confidence.** High for `PreToolUse`, which was probed. Medium for `PostToolUse` and `Stop`, which come from the changelog only.

**What it changes for the plan.**
- The ported hook must print `{"decision":"allow"}` on every pass. Exiting quietly or printing `{}` blocks every tool, unlike on Claude Code and Codex.
- Every hook has to finish within its `timeout`, so set one explicitly (for example 30 s or more for the commit gate).
- Fail-closed suits the guards. An unexpected exception still blocks, but the hook should catch its errors and print a deny with a reason, so that the agent sees something useful.

## 4. Tool names as hooks see them

**Answer.** These names were observed in the probe. They are lower-case step types, and the matcher is a regular expression over them.

| Tool | Arguments seen |
| :-- | :-- |
| Shell: `run_command` | `CommandLine`, `WaitMsBeforeAsync`, `toolSummary` |
| Create or overwrite: `write_file` | `Path`, `Content`, `Overwrite` |
| Edit: `edit_file` | `Path`, `Target`, `Replacement` |
| Subagent: `invoke_subagent` | `Prompt`, `Role`, `TypeName` |
| Subagent messages: `send_message` | not recorded |
| Step tracking: `update_steps` | not recorded |

The web hooks page lists `write_to_file`, `replace_file_content`, `multi_replace_file_content` and `view_file`, but 1.5.17 emitted `write_file` and `edit_file`.

**Sources.**
- Probe run 2 (2026-11-25)
- https://antigravity.google/docs/hooks.md (read 2026-11-25)

**Confidence.** High for the names observed. Low that the list is complete; there may be multi-edit or notebook variants.

**What it changes for the plan.**
- Gate edits with a broad matcher such as `write_file|edit_file|write_to_file|replace_file_content|multi_replace_file_content`, or use `*` and filter inside the hook.
- Read paths from `args.Path` and commands from `args.CommandLine`.
- Add the arguments to `hosts/antigravity/capability.json` and pin them with a probe-based test, since the docs are stale.

## 5. Settings and permissions

**Answer.** Settings live in `~/.gemini/antigravity-cli/settings.json`, with the schema `https://antigravity.google/schemas/v1/settings.json`.
- **`--settings`** takes inline JSON or a file path of `settings.json` keys and applies them to that session only, never saving them. The probe used it.
- **`permissions`** holds `{allow, ask, deny}` arrays of `action(target)` rules. Precedence is deny > ask > allow. Unparseable rules are ignored.
- **Rule actions:** `read_file`, `write_file`, `read_url`, `execute_url`, `command`, `unsandboxed` (business accounts only) and `mcp(server/tool)`. There is no subagent action.
- **Rule targets:** `command` matches word-by-word prefixes, or a regular expression after `regex:`. Paths are recursive for directories. `*` is a wildcard.
- **`toolPermission`:** `request-review` (the default), `proceed-in-sandbox`, `always-proceed` or `strict`.
- **`agentMode` / `--mode`:** `accept-edits`, `auto` or `plan`. `auto` is the default where available; it needs the terminal sandbox and is not available on enterprise accounts.
- **`--dangerously-skip-permissions`** means `always-proceed`. The probe showed that a `deny` rule still blocks under it: `command(echo)` produced "Matches user-configured deny rule".
- **`--sandbox` / `enableTerminalSandbox`:** the sandbox can reach the workspace and temp directories, with no network.
- `agy -p "/permissions"` prints the effective rules.

**Sources.**
- https://antigravity.google/docs/cli/reference.md (read 2026-11-25)
- https://antigravity.google/docs/settings.md (read 2026-11-25)
- https://antigravity.google/docs/permissions.md (read 2026-11-25)
- `agy --help` (read 2026-11-25)
- Probe (2026-11-25)

**Confidence.** High on keys and precedence. Medium on where project- and shared-scope rules are stored, which the docs leave out.

**What it changes for the plan.**
- Deny rules are a second line that survives skip-permissions. The generated package could suggest `write_file(.env)`-style denies.
- The hook stays the enforcement point, since the rules can't express "until evidence exists".
- Verification runs can use `--settings` to trust a scratch folder without touching the user's settings.

## 6. Status line

**Answer.** `settings.json` takes a `statusLine` object, `{command, type:"command", enabled, padding, stack_with_default}`. The command runs through `sh -c` and receives the session state as JSON on stdin. A sibling `title` object sets the terminal title the same way.
- **Stdin fields.** These are only partly confirmed. The official page's table starts with `cwd`; a community write-up adds `session_id`, `conversation_id`, `model`, `context_window` and `quota`.
- **Who sets it.** Plugins cannot set it. It is a user setting.
- **Booleans.** Setting the key to `true` or `false` disables it.

**Sources.**
- https://antigravity.google/docs/settings.md (read 2026-11-25)
- Web search results pointing to https://www.antigravity.google/docs/cli/statusline (not opened) and https://antigravitylab.net/en/articles/ai-tools/antigravity-cli-statusline-session-cost-payload-stdin-fixes (read 2026-11-25)

**Confidence.** Medium on the keys. Low on the stdin fields, which were not probed (the status line needs the TUI).

**What it changes for the plan.**
- Ship the status line as an opt-in script with a documented `settings.json` snippet, as for the other hosts, rather than as part of the plugin.
- Read only `cwd` until the fields are probed.
- Read stdin with a timeout, because one report says the pipe can be held open.
