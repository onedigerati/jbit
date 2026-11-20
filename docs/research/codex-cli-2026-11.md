# Codex CLI: what a generated JBIT package must match (research, 2026-11-20)

Scope: shipping a generated JBIT package for OpenAI Codex CLI next to the untouched Claude plugin, with the hook ported to a Node command-hook script. All sources were read 2026-11-20. Most `developers.openai.com/codex/*` URLs now 308-redirect to `learn.chatgpt.com/docs/*`, and both are cited. Where the docs are silent, the `openai/codex` source on GitHub (default branch, read through `gh api`) is cited and marked as source, not docs. Latest CLI on the changelog: 0.171.0 (2026-11-20).

No page read contained instructions aimed at an AI agent.

---

## 1. Plugins and marketplace

**Question.** Is the manifest a root `plugin.json` or `.codex-plugin/plugin.json`? Where does the marketplace file live? How does the CLI (not only the desktop app) install a plugin from a git repo? Does a repo that also has `.claude-plugin/marketplace.json` cause confusion?

**Answer.**
- **Manifest.** The docs call a root `plugin.json` "the portable entry point", and say `.codex-plugin/plugin.json` "remain[s] supported as a compatibility fallback". OpenAI-specific keys go under `extensions.com.openai`, for example `extensions.com.openai.hooks`. Skills are found automatically in the root `skills/`. MCP servers go in root `mcp.json`. The source adds a catch: a root `plugin.json` counts only if its `$schema` is `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`. Without that it is ignored as "unrelated", and Codex looks through `.codex-plugin/plugin.json`, then `.claude-plugin/plugin.json`, then `.cursor-plugin/plugin.json`, in that order.
- **Marketplace.** In a repo it is `$REPO_ROOT/.agents/plugins/marketplace.json`. The personal one is `~/.agents/plugins/marketplace.json`. Its schema has `name`, an optional `interface.displayName` and `plugins[]`. Each entry has `name`, `source`, `policy.{installation,authentication}` and `category`. `source` is a local path starting with `./`, a `{source:"local",path}` object, a git `url`/`git-subdir` with an optional `ref`/`sha`, or npm.
- **CLI install.** Add the marketplace with `codex plugin marketplace add owner/repo[@ref]` (it also takes `--ref`, `--sparse <path>`, a git or SSH URL, or a local root). Then install with `codex plugin add <plugin>@<marketplace>`, or pick it in the `/plugins` browser inside a session. `codex plugin list` and `codex plugin remove` also exist, all with `--json`. Start a new session after installing. A plugin can be enabled per project with `[plugins."name@marketplace"] enabled = true`. The build page says to "install and test plugins through the ChatGPT desktop app", but the CLI reference and the plugins page both document CLI install.
- **`.claude-plugin` confusion.** It is real. The source checks marketplace files in the order `.agents/plugins/marketplace.json`, then `.agents/plugins/api_marketplace.json`, then `.claude-plugin/marketplace.json`, then `.cursor-plugin/marketplace.json`, and the first file found wins. If the JBIT repo has no `.agents/plugins/marketplace.json`, Codex reads the Claude marketplace. It would then load `plugins/jbit/`, whose `hooks/hooks.json` is `{ "modules": [...] }` (the Claude TS-module format, not Codex's) and whose skills are Claude-flavoured. Adding `.agents/plugins/marketplace.json` makes Codex take that file instead.

**Sources.**
- https://developers.openai.com/plugins/build/plugins (read 2026-11-20)
- https://learn.chatgpt.com/docs/plugins.md (read 2026-11-20)
- https://learn.chatgpt.com/docs/developer-commands?surface=cli (read 2026-11-20)
- Source: `codex-rs/core-plugins/src/marketplace.rs` (`MARKETPLACE_MANIFEST_RELATIVE_PATHS`, `find_marketplace_manifest_path`), `codex-rs/utils/plugins/src/plugin_namespace.rs` (`find_plugin_manifest_path`), `codex-rs/exec-server-protocol/src/protocol.rs` (`DISCOVERABLE_PLUGIN_MANIFEST_PATHS`) (read 2026-11-20)

**Confidence.** High on paths and commands. Medium on the root `$schema` requirement and marketplace precedence: both come from source, not docs, and can change.

**What it changes for the plan.**
- Ship `.agents/plugins/marketplace.json` at the repo root, pointing at the generated package (for example `./plugins/jbit-codex`). Its presence keeps Codex away from `.claude-plugin/marketplace.json`.
- Give the package its manifest at `.codex-plugin/plugin.json`, the path the docs list as the compatibility fallback. Alternatively use a root `plugin.json` that carries the agent-plugins `$schema`.
- The package must not contain a `.claude-plugin/` directory.
- Test the install path with `codex plugin marketplace add <local root>` followed by `codex plugin add jbit@<name>`.

---

## 2. Plugin hooks in the CLI

**Question.** Does the Codex CLI honour hooks bundled in a plugin (`hooks/hooks.json`, `${PLUGIN_ROOT}`), or only desktop-app manual installs? Does config.toml need a `[features]` flag? What is the trust/review step?

**Answer.**
- **Docs disagree.** The build page says hooks are supported "only for plugins manually installed in the Codex desktop app", and that plugins with hooks are not eligible for the public directory. The hooks page documents plugin-bundled hooks without any such limit:
  - The default file is `hooks/hooks.json`, which `extensions.com.openai.hooks` (or `hooks` in `.codex-plugin/plugin.json`) can override.
  - Commands receive `PLUGIN_ROOT` and `PLUGIN_DATA`, plus `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` for compatibility.
- **Source and changelog.** The changelog (May 2026) says plugins can bundle lifecycle hooks. In the source, the old `plugin_hooks` feature flag is `Stage::Removed`, so plugin hooks are no longer gated.
- **My reading.** The desktop-only line is about which plugins can be published and approved, not about what the CLI runs. This is unconfirmed.
- **Feature flag.** None is needed. `features.hooks` is stable and on by default. `codex_hooks` is a deprecated alias. `allow_managed_hooks_only = true` (admin) skips plugin hooks.
- **Trust.** Non-managed hooks, plugin hooks included, must be reviewed and trusted before they run, through `/hooks` in a session. Trust is tied to each hook's hash, so a changed hook is skipped until trusted again. `--dangerously-bypass-hook-trust` (global, and on `codex exec`) runs enabled hooks without saved trust for one invocation. Hooks in a project's `.codex/hooks.json` load only if the project is trusted.

**Sources.**
- https://learn.chatgpt.com/docs/hooks, redirected from https://developers.openai.com/codex/hooks (read 2026-11-20)
- https://developers.openai.com/plugins/build/plugins (read 2026-11-20)
- https://learn.chatgpt.com/docs/config-file/config-reference (read 2026-11-20)
- https://learn.chatgpt.com/docs/changelog?type=codex-cli (read 2026-11-20)
- Source: `codex-rs/features/src/lib.rs` (`plugin_hooks` is `Stage::Removed`; `hooks` is Stable and on by default) (read 2026-11-20)

**Confidence.** Medium. The docs conflict, and only a real CLI run settles it.

**What it changes for the plan.**
- Bundle `hooks/hooks.json` in the Codex format, with commands of the form `node "${PLUGIN_ROOT}/hooks/jbit.mjs"`.
- Do not write `[features].hooks` (the GSD installer's step is unnecessary but harmless).
- The install docs must tell users to open `/hooks` and trust JBIT's hooks once per hook version. Every hook change means trusting it again, so keep the hook's command line stable.
- Fallback if the CLI ignores plugin hooks: an installer writes the same entries to `$CODEX_HOME/hooks.json`.

---

## 3. Hooks: events, stdin, deny, tool names, context, Stop, exec

**Question.** What is the event list? What fields arrive on stdin? What shape does a PreToolUse deny take? Which tool names does a hook see for shell commands and file edits? Can UserPromptSubmit inject context on every prompt? Does Stop support block-and-continue, and is there a cap? How do hooks behave under `codex exec`?

**Answer.**
- **Events.** `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`, `PreModelRequest`, `PostModelRequest`, `Interrupt`, `SessionStart`, `SessionEnd`.
- **stdin.** Common fields: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`, plus `permission_mode` on most events. Per event:
  - PreToolUse: `turn_id`, `tool_name`, `tool_use_id`, `tool_input`.
  - UserPromptSubmit: `turn_id`, `prompt`.
  - Stop: `turn_id`, `stop_hook_active`, `last_assistant_message`.
  - SubagentStop: `agent_id`, `agent_type`, `agent_transcript_path`, `stop_hook_active`, `last_assistant_message`.
  - SessionStart: `source` (`startup`, `resume`, `clear`, `compact` or `fork`).
- **Deny.** The documented shape:
  ```json
  {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}
  ```
  The older `{"decision":"block","reason":"..."}` and exit 2 with the reason on stderr also work. `permissionDecision: "ask"` is not supported yet.
- **Tool names.**
  - Shell and unified exec (`exec_command`) match the matcher `Bash`.
  - File edits are `apply_patch`, which matches `apply_patch`, `Edit` or `Write`, but `tool_input` still reports `tool_name: "apply_patch"`. The hook must therefore parse the patch body to find the paths being edited.
  - `spawn_agent` also matches `Agent`.
  - MCP tools use `mcp__server__tool`.
  - Hosted tools (WebSearch) are not covered.
- **UserPromptSubmit.** `matcher` is ignored. Plain stdout, or `hookSpecificOutput.additionalContext`, is added as developer context on each prompt. Each handler has an `additionalContextLimit`, 2500 tokens by default. Context above it is "saved to disk" rather than injected.
- **Stop.** `{"decision":"block","reason":"..."}` makes Codex continue, with `reason` as the new continuation prompt. `stop_hook_active` reports whether the turn has already been continued. `continue:false` from any hook wins. Plain-text stdout on exit 0 is invalid for Stop. No loop cap is documented.
- **Timeouts.** `timeout` is in seconds, 600 by default. `async: true` runs a hook in the background, and a background hook cannot block.
- **Under `codex exec`.** Not documented. The only lead is that `--dangerously-bypass-hook-trust` is listed as an `exec` flag, which implies hooks run in exec but need trust that has been saved or bypassed.

**Sources.**
- https://learn.chatgpt.com/docs/hooks (read 2026-11-20)
- https://learn.chatgpt.com/docs/config-file/config-reference (`additionalContextLimit`, `async`) (read 2026-11-20)
- https://learn.chatgpt.com/docs/developer-commands?surface=cli (read 2026-11-20)

**Confidence.** High on events, fields, deny shape and tool names. Medium on Stop continuation limits and on exec behaviour.

**What it changes for the plan.**
- Port the hook's gates as follows:
  - Commit gate and secret guard: PreToolUse on `Bash`.
  - Edit guard: `apply_patch`, parsing paths from the patch.
  - Agent hold: `spawn_agent`/`Agent`.
  - `## Now`: UserPromptSubmit `additionalContext`.
  - Autopilot: Stop with `decision:block`.
- Keep the `## Now` injection under 2500 tokens, or raise `additionalContextLimit`. This mirrors the 1.2.0 handoff overflow lesson.
- Without a documented cap, the Stop hook must cap itself, for example with a counter kept in `PLUGIN_DATA`, and must honour `stop_hook_active`.

---

## 4. Skills

**Question.** Where does Codex discover skills? How are plugin skills namespaced and invoked (`$name`, `/skills`)? Are skills selected implicitly by description?

**Answer.**
- **Discovery.**
  - `.agents/skills` in each directory from the cwd up to the repo root.
  - `$HOME/.agents/skills`.
  - `/etc/codex/skills`.
  - Bundled system skills (`skill-creator`, `skill-installer`).
  - Plugin `skills/`.
- **Format.** `SKILL.md` must have `name` and `description`. Optional extras are `scripts/`, `references/`, `assets/` and `agents/openai.yaml`. Skills with the same name are not merged, and both appear in the picker.
- **Budget.** The startup skill list gets about 2% of the context window, or 8000 chars when the window is unknown. `skills.max_context_tokens` raises it, up to 10k tokens.
- **Invocation.** In the CLI, run `/skills` or type `$skill-name`.
- **Implicit selection.** Codex picks a skill when the task matches its `description`. `agents/openai.yaml` with `policy.allow_implicit_invocation: false` turns implicit selection off.
- **Disabling.** `[[skills.config]]` with a `name` or `path` and `enabled=false`.
- **Plugin namespacing.** Not documented. The source resolves a "plugin namespace" from the plugin manifest's `name` (`plugin_namespace_for_root_uri`), so plugin skills are probably shown with a prefix, but the exact form (for example `jbit:plan`) and whether `$jbit:plan` works are unconfirmed.

**Sources.**
- https://learn.chatgpt.com/docs/build-skills, redirected from https://developers.openai.com/codex/skills (read 2026-11-20)
- Source: `codex-rs/utils/plugins/src/plugin_namespace.rs` (read 2026-11-20)

**Confidence.** High on discovery and invocation. Low on the namespace format.

**What it changes for the plan.**
- The generated skills must rewrite `/jbit:<name>` mentions to whatever form Codex shows, `$jbit:<name>` or `$<name>`, after the spike.
- Keep each description front-loaded with its triggers. Nine skills must fit the about-2% startup budget, so check the total description length.
- The "JBIT plan"-style opening triggers can work only through implicit description matching. There is no slash command for a plugin skill.

---

## 5. Subagents

**Question.** How are agents defined in TOML (fields: model, model_reasoning_effort, developer_instructions)? How does the main agent spawn one: what are the `spawn_agent` tool's arguments, and can a call pass a model? What are the concurrency settings? Is there worktree isolation?

**Answer.**
- **Definitions.** One agent per TOML file, in `~/.codex/agents/` or the project's `.codex/agents/`.
  - Required fields: `name`, `description`, `developer_instructions`.
  - Optional: `model`, `model_reasoning_effort`, `model_reasoning_summary`, `model_verbosity`, and feature/skills limits such as `features.shell_tool=false`. A model set in the file beats the spawn value and the `[agents]` defaults.
  - `sandbox_mode`, `approval_policy`, `model_provider` and `mcp_servers` do not override the parent. Subagents inherit the parent's sandbox and approvals.
  - Roles can also be declared in config as `agents.<name>.config_file` and `agents.<name>.description`.
  - The docs do not say whether a plugin can ship agents.
- **Spawning.** The docs do not name the tool. In the source it is `spawn_agent`, a namespaced tool with two versions:
  - v1 takes `message`, `items`, `agent_type`, `fork_context`, `model` and `reasoning_effort`, all optional.
  - v2 requires `task_name` and `message`, and takes optional `agent_type`, `model` and `reasoning_effort`.
  - `agent_type`, `model` and `reasoning_effort` can be hidden depending on the model's metadata.
  - Companion tools: `wait_agent`, `send_input`/`send_message`, `followup_task`, `resume_agent`, `list_agents`, `close_agent`, `interrupt_agent`.
  - The GSD mapping `Task(subagent_type=X, prompt=Y)` → `spawn_agent(agent_type=X, message=Y)` matches v1. v2 also needs `task_name`.
  - The config reference confirms that "an explicit spawn model takes precedence" over `agents.default_subagent_model`, so a call can pass a model unless the agent's TOML pins one.
- **When agents spawn.** Mostly on direct request, but local Codex also spawns "when applicable project or skill instructions request it", so skill text can trigger it.
- **Concurrency.**
  - `agents.max_concurrent_threads_per_session` (legacy `agents.max_threads`), which excludes the primary thread.
  - `agents.enabled` (default true; it replaces `features.multi_agent`).
  - `agents.default_subagent_model` and `agents.default_subagent_reasoning_effort`.
  - `agents.max_depth` is not in the visible docs.
- **Worktree isolation.** None documented for subagents.

**Sources.**
- https://learn.chatgpt.com/docs/agent-configuration/subagents, redirected from https://developers.openai.com/codex/subagents (read 2026-11-20)
- https://learn.chatgpt.com/docs/config-file/config-reference (read 2026-11-20)
- https://learn.chatgpt.com/docs/changelog?type=codex-cli (read 2026-11-20)
- Source: `codex-rs/core/src/tools/handlers/multi_agents_spec.rs` (read 2026-11-20)

**Confidence.** High on TOML fields and config keys. Medium on `spawn_agent` arguments: they come from source, the version varies by model, and the docs are silent.

**What it changes for the plan.**
- Generate the role agents (verifier, reviewer, builder) as TOML files with `developer_instructions`. Where they go must be settled: plugins may not ship agents, so an installer may have to copy them to `.codex/agents/` or `~/.codex/agents/`.
- Rewrite the skills' "spawn the verifier agent" text in model-neutral words ("spawn a subagent of type `verifier`") instead of a literal call signature, because v1 and v2 differ.
- Isolation that relies on Claude's `isolation: worktree` has no Codex equivalent. Drop it, or do it by hand with `git worktree`.

---

## 6. Instructions (AGENTS.md / CLAUDE.md)

**Question.** How does Codex look up AGENTS.md, and can it read CLAUDE.md (`project_doc_fallback_filenames`)?

**Answer.**
- **Global file.** `$CODEX_HOME/AGENTS.override.md`, else `AGENTS.md`. Only the first non-empty one is used.
- **Project files.** Codex walks from the git root down to the cwd. In each directory it takes the first of `AGENTS.override.md`, `AGENTS.md`, then the names in `project_doc_fallback_filenames`, at most one file per directory. The files are concatenated root-first.
- **Size cap.** `project_doc_max_bytes` defaults to 32 KiB. Files past the cap are cut off.
- **CLAUDE.md.** Never mentioned. `project_doc_fallback_filenames = ["CLAUDE.md"]` should work, since any name is accepted (the docs' example is `["TEAM_GUIDE.md", ".agents.md"]`). It is used only where a directory has no AGENTS.md.

**Sources.**
- https://learn.chatgpt.com/docs/agent-configuration/agents-md, redirected from https://developers.openai.com/codex/guides/agents-md (read 2026-11-20)
- https://learn.chatgpt.com/docs/config-file/config-reference (read 2026-11-20)

**Confidence.** High on lookup. Medium on CLAUDE.md as a fallback, which is inferred from the mechanism.

**What it changes for the plan.**
- JBIT's skills point users at CLAUDE.md (the charter writes locked decisions there). The Codex package should write and read `AGENTS.md` instead.
- The install docs can suggest `project_doc_fallback_filenames = ["CLAUDE.md"]` for repos shared with Claude Code.

---

## 7. Install, auth and headless runs

**Question.** What is the npm package, and how does sign-in work? Which `codex exec` flags suit headless test runs (sandbox, approvals, `--json`)? Can an isolated home (CODEX_HOME) be used to test installs?

**Answer.**
- **Install and sign-in.** `npm i -g @openai/codex` (not re-read this session; this is the long-standing package name). Sign in with `codex login` (browser), `--device-auth`, or `printenv OPENAI_API_KEY | codex login --with-api-key`. `codex login status` exits 0 when logged in. For one-off runs, `CODEX_API_KEY=... codex exec ...` works, and the docs warn against setting it job-wide where the job runs repository code.
- **`codex exec` defaults.** Read-only sandbox. Progress goes to stderr and the final message to stdout. `--full-auto` is no longer supported.
- **`codex exec` flags.**
  - `-s/--sandbox read-only|workspace-write|danger-full-access`
  - `-a/--ask-for-approval on-request|never`
  - `--approve-for-me`
  - `--yolo`/`--dangerously-bypass-approvals-and-sandbox`, for isolated runners only
  - `--json` (JSONL events: `thread.started`, `turn.*`, `item.*`, `error`)
  - `-o/--output-last-message <file>`
  - `--output-schema <file>`
  - `--skip-git-repo-check`
  - `--ephemeral`
  - `-C/--cd`
  - `-c key=value`
  - `--enable <feature>`
  - `--ignore-user-config`, which skips `$CODEX_HOME/config.toml` but still uses its auth
  - `--dangerously-bypass-hook-trust`
  - Follow-ups: `codex exec resume --last|<id>`
- **Isolated home.** `CODEX_HOME` moves the global home: config.toml, hooks.json, AGENTS.md, agents/ and auth. A temporary `CODEX_HOME` with a copied `auth.json` (or `--with-api-key`) gives a clean install test. Note that `~/.agents/` (the personal marketplace and skills) is keyed off `$HOME`, not `CODEX_HOME`, so an isolated run should set `HOME` too.

**Sources.**
- https://learn.chatgpt.com/docs/developer-commands?surface=cli, redirected from https://developers.openai.com/codex/cli/reference (read 2026-11-20)
- https://learn.chatgpt.com/docs/non-interactive-mode, redirected from https://developers.openai.com/codex/noninteractive (read 2026-11-20)
- https://learn.chatgpt.com/docs/agent-configuration/agents-md (read 2026-11-20)

**Confidence.** High on flags and auth. Medium on the npm name (not re-read) and on the `HOME` versus `CODEX_HOME` split for `.agents`.

**What it changes for the plan.**
- The Codex test harness can run `HOME=$tmp CODEX_HOME=$tmp/.codex codex exec --json --sandbox workspace-write --skip-git-repo-check --ephemeral --dangerously-bypass-hook-trust ...` against a fixture repo and assert on the JSONL events.
- `codex` is not installed on this machine today, so the spike starts with an install.

---

## Open for the spike

1. Does the CLI, installed with `codex plugin marketplace add <local>` and then `codex plugin add`, actually run a plugin's `hooks/hooks.json`, against the build page's "desktop app only"? Does `/hooks` list the hooks for trust?
2. With `.agents/plugins/marketplace.json` and `.claude-plugin/marketplace.json` in the same repo, which marketplace name shows up, and does `plugins/jbit` stay invisible?
3. How do plugin skills appear and get invoked: `$jbit:plan`, `$plan`, or something else? Do nine descriptions fit the startup budget without truncation?
4. Is `spawn_agent` v1 or v2 for the default model, and can a plugin ship agent TOMLs or must they be copied to `.codex/agents/`?
5. Does a Stop `decision:block` loop have a hidden cap? Does it fire, and continue, under `codex exec`?
6. Under `codex exec`, do UserPromptSubmit and PreToolUse hooks fire, given `--dangerously-bypass-hook-trust` or saved trust?
7. What does `tool_input` contain for `apply_patch` (raw patch text?) and for `Bash`/`exec_command` (a `command` string or argv)? The deny gates depend on it.
8. Is a `## Now` block over 2500 tokens saved to disk instead of injected, and what does the model then see?
