# GitHub Copilot CLI: what a JBIT port has to fit (2026-11)

Research for shipping a generated JBIT package for the terminal `copilot` CLI, with the Claude plugin left as it is and the hook ported to a Node command-hook script. Everything here comes from the official GitHub docs, all read on 2026-11-20. The pages were fetched as their markdown article bodies, and none of them contained instructions aimed at AI agents. One thing to keep in mind: the docs describe a CLI that changes quickly. They mention a 2026 "Agent Plugins" spec, built-in models such as `gpt-5.6-luna`, and AI-credit limits. Re-check anything that only a real run can confirm.

Short names for the sources used below:

- **[plugin-ref]** https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference
- **[plugin-create]** https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating
- **[pm-ref]** https://docs.github.com/en/copilot/reference/plugin-and-marketplace-reference
- **[marketplace]** https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-marketplace
- **[hooks-ref]** https://docs.github.com/en/copilot/reference/hooks-reference
- **[use-hooks]** https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks
- **[agents-cli]** https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli
- **[prog-ref]** https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference
- **[cmd-ref]** https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- **[config-ref]** https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference
- **[skills]** https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills
- **[fleet]** https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/speed-up-task-completion
- **[autopilot]** https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/use-autopilot-mode
- **[install]** https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli

---

## 1. Plugin and marketplace layout

**Question.** In what order does the CLI look for the manifest? If a repo has both `.claude-plugin/marketplace.json` and `.github/plugin/marketplace.json`, which one does it use? Where do skills, agents and hooks resolve from? What are the install and update commands?

**Answer.**
- **Manifest formats.** There are two:
  - **Agent Plugins 1.0/1.1.** `plugin.json` sits at the plugin root and declares `$schema` = `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` (or the 1.1.0 equivalent). In this format the component paths are fixed:
    - skills: `skills/<name>/SKILL.md`
    - MCP servers: root `mcp.json`
    - Copilot-specific parts: `com.github.copilot/agents/*.agent.md`, `com.github.copilot/hooks/hooks.json`, and also `commands/`, `rules/` and `lsp.json` there
    - path fields such as `skills`, `agents` and `hooks` are not allowed in the manifest
  - **Legacy.** Any manifest without that `$schema`. The CLI looks in this order: `.plugin/plugin.json`, `plugin.json`, `.github/plugin/plugin.json`, `.claude-plugin/plugin.json`. Path fields are allowed, with these defaults:
    - `agents/`
    - `skills/`, falling back to a root `SKILL.md`
    - `hooks.json` or `hooks/hooks.json`
    - `.mcp.json`
- **Marketplace lookup.** The CLI looks in this order: `marketplace.json`, `.plugin/marketplace.json`, `.github/plugin/marketplace.json`, `.claude-plugin/marketplace.json`. So a repo with both files resolves to `.github/plugin/marketplace.json`, as long as there is no root or `.plugin/` file. The docs recommend `.github/plugin/`.
  - Each `source` path is relative to the repo root.
  - A plugin's ID is `PLUGIN@MARKETPLACE`, where the marketplace part comes from the marketplace's `name` field, not from the repo name.
- **Commands.**
  - `copilot plugin install <plugin@marketplace | OWNER/REPO | OWNER/REPO:PATH | git URL | local path>`
  - `copilot plugin update NAME` or `--all`
  - `copilot plugin uninstall NAME`
  - `copilot plugin enable` / `disable`
  - `copilot plugin list [--json]`
  - `copilot plugin marketplace add|list|browse|update|remove`
  - `/plugin ...` does the same inside a session.
  - `--plugin-dir=DIR` loads a plugin straight from a directory for one session, including `-p` sessions.
  - Installed plugins live in `~/.copilot/installed-plugins/<marketplace>/<plugin>` or `.../_direct/<id>`.
  - Installs are cached, so after a local change you run `copilot plugin install ./dir` again.
- **Precedence.** For agents and skills, the first one found wins, and plugins rank below project and personal entries. A project `.claude/skills/plan` would silently shadow a plugin skill named `plan`. A repo can turn plugins on by default through `enabledPlugins` and `extraKnownMarketplaces` in `.github/copilot/settings.json`.

**Sources:** [plugin-ref], [plugin-create], [pm-ref], [marketplace], [config-ref], all read 2026-11-20.

**Confidence:** high for the lookup orders, which are stated explicitly in a table. Medium for how the legacy and Agent Plugins formats interact in practice.

**What it changes for the plan.**
- The generated Copilot package can sit in its own directory, for example `plugins/jbit-copilot/` with a root `plugin.json`, listed from `.github/plugin/marketplace.json`. The existing `.claude-plugin/marketplace.json` stays untouched, and Claude Code keeps reading it.
- Use the legacy format, or Agent Plugins with `com.github.copilot/`. Either way, never point Copilot at `plugins/jbit/`: Copilot would also read its `.claude-plugin/plugin.json` as a legacy manifest.
- Use `--plugin-dir` for quick tests and `copilot plugin install ./path` for install tests.

## 2. Skills

**Question.** What frontmatter fields do skills take? How does a user invoke a plugin skill, and is there a slash name or namespacing? Does the model load skills by their description?

**Answer.**
- **Frontmatter fields.**
  - `name`, required: at most 64 characters. Letters, digits, `-`, `_`, `.`, `:` and spaces are allowed. Colons allow namespaced names such as `my-plugin:search`.
  - `description`, required: at most 1024 characters.
  - `argument-hint`
  - `allowed-tools`: a string or an array, and `"*"` means all tools.
  - `user-invocable`: defaults to true.
  - `disable-model-invocation`: defaults to false.
  - `license`
- **User invocation.** The user types `/SKILL-NAME`, or the skill name with a slash inside a prompt.
- **Name clashes between plugins.** When two plugins ship skills with the same name, both stay available as `/plugin-name/skill`, and the bare name goes to the higher-priority plugin.
- **No automatic prefix.** The docs say nothing about adding a plugin prefix automatically. Skills are deduplicated by their `name`.
- **Model invocation.** The model can call a skill on its own, based on the prompt and the skill's description. When it does, the `SKILL.md` body is injected into the conversation. There is a `skill` tool ("Invoke custom skills").
- **Built-in clashes.** Four JBIT skill names collide with built-in slash commands: `/autopilot` (alias `/goal`), `/plan`, `/resume` and `/review`. The docs don't say how a skill and a built-in slash command with the same name are resolved.

**Sources:** [cmd-ref] (Skills reference, Slash commands), [skills], read 2026-11-20.

**Confidence:** high for the fields and for invocation by description. Low for how built-in name clashes resolve.

**What it changes for the plan.**
- The generator should set `name: jbit:<skill>` in each generated `SKILL.md`. That is legal in Copilot, keeps `/jbit:plan` the same as on Claude, and avoids the four clashes.
- The "JBIT plan"-style trigger phrases in descriptions can carry over, because model invocation works from the description.
- Claude-only frontmatter has to be stripped or mapped to Copilot fields.

## 3. Subagents

**Question.** What frontmatter does a custom `.agent.md` take, including model and tools? How does the main agent start one? Is a per-call model possible? How does parallelism (`/fleet`) work? Is there worktree isolation?

**Answer.**
- **Files and IDs.** Agents are `*.agent.md` files (`.md` also works). The ID is the path relative to `agents/`, with `/` turned into `--`. They load from:
  - `~/.copilot/agents/`
  - `.github/agents/` and `.claude/agents/`, from the current directory up to the git root
  - `<plugin>/agents/`, or `com.github.copilot/agents/` in the Agent Plugins format
  - remote agents
- **Frontmatter fields.**
  - `description` (required)
  - `name`
  - `tools`: an array, defaults to `["*"]`. Tool names include `view`, `edit`, `create`, `bash`, `grep`, `glob`; the examples also use the aliases `read`, `execute` and `edit`.
  - `model` and `models`: if unset, the agent inherits the session's model. When the session model is `Auto`, the session model always wins.
  - `modelPolicy`: `preferred` or `required`. One guide spells it `model-policy`.
  - `reasoningEffort`
  - `infer`: whether the main agent may delegate to it automatically. Defaults to true.
  - `include-custom-instructions`: defaults to **false**, which means a custom subagent does not see `AGENTS.md` or `CLAUDE.md` unless this is set.
  - `mcp-servers`
  - `hooks`: hooks scoped to the agent.
- **Starting one.** The main agent uses the `task` tool ("Run subagents"). Companion tools are `read_agent` (background status), `write_agent` and `list_agents`. The docs do not give the `task` tool's argument names.
- **Per-call model.** Model and effort resolve with "an explicit per-call value" first, then the `subagents` settings, then the agent's frontmatter, then the parent session. So a per-call model is possible in principle, but its argument isn't documented.
- **Parallelism.**
  - `/fleet PROMPT`, or `--fleet` together with `-p`, `-i` or piped input, lets the orchestrator run subagents in parallel.
  - Concurrency is capped by plan: Free 2, Pro 4, Max 8, Business 16, Enterprise 32.
  - Default depth is 6. `COPILOT_SUBAGENT_MAX_*` environment variables exist.
  - `/tasks` shows background subagents.
  - Built-in agents: `explore`, `task`, `general-purpose`, `code-review`, `security-review`, `research`, `rubber-duck`.
- **Worktrees.** Isolation exists only per session: `/new worktree`, `/worktree`, `--worktree`. The docs describe no worktree isolation for each subagent.

**Sources:** [cmd-ref] (Custom agents reference, Subagent limits, Tool availability values, Command-line options), [agents-cli], [fleet], [config-ref], read 2026-11-20.

**Confidence:**
- high: frontmatter, plan caps, `/fleet`
- medium: `task` as the delegation tool (it's in the tool table, but the arguments aren't documented)
- low: the per-call model argument and its name

**What it changes for the plan.**
- JBIT's role agents can be generated as `agents/<role>.agent.md`.
- They need `include-custom-instructions: true` wherever they must follow repo rules.
- Use `tools` to keep the verifier from writing.
- Pin models per role in frontmatter rather than relying on a per-call model.
- Skills that fan work out to subagents should be worded tool-neutrally, for example "delegate to the `verifier` agent", not "call Agent with ...".
- Skills must not promise worktree isolation for each builder.
- On Free and Pro plans, a fan-out wider than 2 or 4 is rejected until a slot frees up.

## 4. Hooks

**Question.** What is the config shape? Which events exist, and which stdin fields do they get (and in what casing)? What stdout denies a tool call in preToolUse? How is context injected, and can a hook add context on every prompt? How does agentStop block and continue, and what is its cap? How do plugin hook paths resolve? What happens under `-p`? Which trust flags apply, and which tool names does a hook see?

**Answer.**
- **Config shape.**
  - The file looks like `{"version": 1, "hooks": {"<event>": [ {entry}, ... ]}}`, with an optional `disableAllHooks`.
  - An entry has `type: "command"` (the default; `http` and `prompt` also exist), plus `bash`, `powershell` and/or `command` (a cross-platform fallback). Alternatively, `exec` + `args` runs a program with no shell.
  - Optional entry fields: `cwd` ("relative to repository root or absolute"), `env` (supports variable expansion), `timeoutSec` (default 30), and `matcher` (a regex anchored with `^(?:...)$`).
- **Events.** `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `userPromptTransformed`, `preToolUse`, `postToolUse`, `postToolUseFailure`, `permissionRequest`, `agentStop` (alias `Stop`), `subagentStart`, `subagentStop`, `preCompact`, `errorOccurred`, `notification`.
- **Stdin fields.** camelCase event names get camelCase fields. Every event gets `sessionId`, `timestamp` (epoch ms) and `cwd`. Then:
  - `preToolUse`: `toolName`, `toolArgs`
  - `postToolUse`: adds `toolResult{resultType, textResultForLlm}`
  - `userPromptSubmitted`: `prompt`
  - `userPromptTransformed`: `prompt`, `transformedPrompt`
  - `sessionStart`: `source` (`startup|resume|new`), `initialPrompt?`
  - `agentStop`: `transcriptPath`, `stopReason`, `stop_hook_active`
  - `subagentStop`: `agentName`, `response`, ...
- **PascalCase events.** Event names like `PreToolUse` switch to a VS Code-style payload with snake_case fields (`tool_name`, `tool_input`, `hook_event_name`, ISO timestamps). They also report Claude tool names (`Bash`, `Read`, `Write`, `Edit`, `Agent`) and use Claude matcher semantics.
- **Denying a tool call.** For preToolUse, print `{"permissionDecision":"deny","permissionDecisionReason":"..."}` on stdout. The reason is required for a deny. `allow`, `ask` and `modifiedArgs` are the other options. Notes:
  - Exit code 2 denies, whatever stdout says.
  - A crash or any other non-zero exit fails closed (deny).
  - A **timeout fails open**: the tool call goes ahead.
  - In autopilot, `ask` counts as deny.
  - Stdout must hold exactly one JSON object; single-line `{"type":"progress"}` lines are stripped out first.
  - preToolUse hooks for parallel tool calls run concurrently.
  - Claude's `hookSpecificOutput` wrapper is not documented.
- **Injecting context.**
  - `sessionStart` returns `additionalContext`, once per session (new or resumed).
  - `subagentStart` `additionalContext` is prepended to the subagent's first message.
  - `postToolUse` `additionalContext` is appended to the tool result, capped at 10 KB.
  - `notification` can inject a user message.
  - **`userPromptSubmitted` output from command or HTTP hooks is dropped.** `modifiedPrompt` works only for SDK programmatic hooks, so a config-file hook cannot add context there.
  - `userPromptTransformed` can return `modifiedTransformedPrompt`, which rewrites only what the model sees on that prompt. The docs list it as able to rewrite, without any config-file caveat. **That makes it the only documented per-prompt injection point, but only a run can show whether command hooks really get it honored.**
- **agentStop.** Return `{"decision":"block","reason":"..."}`. The reason becomes the next turn's prompt, and `stop_hook_active` is true during a forced continuation. After **8 consecutive blocks** the CLI overrides the hook and ends the turn; the docs don't say how the count resets. `subagentStop` blocks the same way and can also return `modifiedResponse`.
- **Paths in plugin hooks.**
  - Plugin hooks come from `hooks.json` or `hooks/hooks.json` in the plugin's install directory, or from `com.github.copilot/hooks/hooks.json`.
  - **There is no plugin-root variable documented for hook commands.** `PLUGIN_ROOT` and `${PLUGIN_ROOT}` are documented only for stdio MCP servers, LSP configs and agent `mcp-servers`.
  - `$COPILOT_PLUGIN_DATA` is documented as a plugin hook's writable data directory.
  - "A hook can read the directory it was loaded from, so a plugin can run the scripts it ships." That line is about the sandbox and doesn't say how a relative path resolves.
  - `cwd` is relative to the repo root.
- **Headless `-p` and trust.**
  - Repository hooks (`.github/hooks/*.json`) need the folder to be trusted. In `-p` they load only when one of these holds: the folder is already trusted, `--trust-folder` is passed (one session only), `GITHUB_COPILOT_PROMPT_MODE_REPO_HOOKS=true` is set, or `COPILOT_ALLOW_ALL=true` is set.
  - The docs don't say whether plugin hooks are gated the same way under `-p`; they read as user-scope configuration.
  - Hooks of type `prompt` never fire in `-p`.
  - Policy hooks (`/etc/github-copilot/policy.d`) ignore trust.
  - Config is read at startup, so a change needs a restart.
- **Tool names hooks see.** In camelCase events: `bash`, `powershell` (Windows), `view`, `create`, `edit`, `apply_patch`, `str_replace_editor`, `grep`/`rg`, `glob`, `web_fetch`, `web_search`, `ask_user`, `task`, `skill`, `update_todo`, plus shell helpers (`write_bash`, `read_bash`, ...). Some models edit through `apply_patch` instead of `edit`/`create`.

**Sources:** [hooks-ref], [use-hooks], [cmd-ref] (Environment variables, `--trust-folder`), [prog-ref], [plugin-ref], read 2026-11-20.

**Confidence:**
- high: shape, events, fields, the preToolUse deny output, agentStop and its cap of 8, and that userPromptSubmitted output is dropped
- medium: userPromptTransformed honored for command hooks, and how plugin hooks behave in `-p`
- low/none: a plugin-root variable for hook commands

**What it changes for the plan.**
- Inject `## Now` on `sessionStart`, and per prompt through `userPromptTransformed`, by appending to `transformedPrompt`, if the spike proves that works. A fallback is `postToolUse` `additionalContext`.
- The gate script must return a single deny object.
- Commit-gate and secret-guard matchers must include `apply_patch`, `str_replace_editor`, `write_bash` and `task`, not just `bash`, `edit` and `create`.
- Keep the script fast, since a timeout lets the call through.
- Autopilot continuation fits under the cap of 8: count on `stop_hook_active`, and expect the CLI to end the turn after 8.
- Without a plugin-root variable, the hook command has to find its script some other way. Options: `exec: "node"` with `args` set to a path that's known once installed (fragile), the documented `${PLUGIN_ROOT}` expansion (if `env` expansion supports it), or reading the hook's own load directory.
- Copilot already has a native autopilot (`--autopilot`, `/autopilot`, `--max-autopilot-continues`, default 5). JBIT's agentStop continuation must not fight it.

## 5. Instruction files

**Question.** Which of `AGENTS.md`, `copilot-instructions.md` and `CLAUDE.md` does the CLI read?

**Answer.**
- All of them, merged together:
  - `CLAUDE.md`, `GEMINI.md` and `AGENTS.md` in the git root and the current directory
  - `.github/copilot-instructions.md`
  - `.github/instructions/**/*.instructions.md`
  - `.claude/rules/**/*.md`, where `paths`/`applyTo` frontmatter scopes a rule to matching files
  - `~/.copilot/copilot-instructions.md` and `~/.copilot/instructions/`
  - extra directories from `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`
- `@path` imports work in `AGENTS.md`, `CLAUDE.md` and `copilot-instructions.md`.
- `--no-custom-instructions` turns all of them off.
- Custom subagents get them only with `include-custom-instructions: true`. The `general-purpose` agent always gets them.

**Sources:** [cmd-ref] (Custom instructions locations, Repository custom instructions for subagents), read 2026-11-20.

**Confidence:** high.

**What it changes for the plan.** A project's `CLAUDE.md` "How we work" block works on Copilot unchanged, so JBIT does not need to write a second instructions file. The generated role agents must opt in with `include-custom-instructions: true`.

## 6. Install and auth

**Question.** What is the npm package name? How do you sign in? Which headless flags exist (`-p`, `--allow-all-tools`, `--output-format`)? Is there an environment variable such as `COPILOT_HOME` for an isolated config directory when testing installs?

**Answer.**
- **Install.** `npm install -g @github/copilot` (needs Node 22 or later; `@prerelease` gives the prerelease). Homebrew (`brew install --cask copilot-cli`), WinGet (`GitHub.Copilot`) and the `gh.io/copilot-install` script also work.
- **Sign in.**
  - `copilot login`: web flow on a local machine, `--device-code` on remote machines or in CI, `--with-token` reads the token from stdin.
  - `/login` does the same inside a session.
  - A token from the environment also works, checked in this order: `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`. It must be a fine-grained PAT with the "Copilot Requests" permission, or a Copilot CLI or `gh` OAuth token. Classic `ghp_` PATs are not supported.
- **Headless flags.**
  - `-p/--prompt`: exits non-zero if the run is interrupted or the final reply is empty.
  - `-s/--silent`
  - `--output-format=text|json` (`json` means JSONL)
  - permission flags: `--allow-all-tools` (env `COPILOT_ALLOW_ALL`), `--allow-all`/`--yolo`, `--allow-tool` and `--deny-tool` (for example `'shell(git:*)'`, `write`)
  - `--no-ask-user`, `--autopilot`, `--max-autopilot-continues=N`, `--agent`, `--model`, `--fleet`, `--plugin-dir`, `--trust-folder`, `--add-dir`
  - `COPILOT_TASK_WAIT_TIMEOUT_SECONDS` sets how long `-p` waits for background agents (default 600).
- **Isolated config.** `COPILOT_HOME` overrides `~/.copilot`: settings, hooks, agents, skills, installed plugins, and the plain-text credential fallback. `--config-dir` is deprecated. `COPILOT_CACHE_HOME` moves the cache.

**Sources:** [install], [cmd-ref] (`copilot login` options, Command-line options, Environment variables), [prog-ref], [autopilot], read 2026-11-20.

**Confidence:** high.

**What it changes for the plan.**
- Test installs with `COPILOT_HOME=$(mktemp -d) COPILOT_GITHUB_TOKEN=... copilot plugin install ./plugins/jbit-copilot`, then run `copilot -p ... --allow-all-tools --output-format json -s`.
- This keeps tests away from the user's real `~/.copilot`.
- A token in the environment avoids an interactive login. When the OS credential store holds the token, a fresh `COPILOT_HOME` may still see it.

---

## Open for the spike

The docs leave these unsettled; only a real run can answer them.

1. Do command hooks get `userPromptTransformed` → `modifiedTransformedPrompt` honored, so `## Now` can be injected on every prompt? Does it fire for autopilot continuation turns too?
2. How does a plugin hook command find its own script? Is `${PLUGIN_ROOT}`, `PLUGIN_ROOT` or `CLAUDE_PLUGIN_ROOT` set or expanded for hooks, and what are the working directory and relative-path base for a plugin hook?
3. Do plugin-shipped hooks run in `-p` without `--trust-folder` or `GITHUB_COPILOT_PROMPT_MODE_REPO_HOOKS`?
4. What is the exact `toolArgs` shape for `bash`, `edit`, `create`, `apply_patch` and `task`? Which fields hold the command, the file path and the content? Which edit tool does each default model actually use?
5. What are the `task` tool's arguments: agent selector, prompt, background mode, a per-call `model`? Is a custom plugin agent reachable by name from a skill's instructions?
6. How does a skill named `plan`, `review`, `resume` or `autopilot` resolve against the built-in slash command? Does `name: jbit:plan` give `/jbit:plan`?
7. How does the agentStop block counter reset (per turn, per user prompt)? How does a hook block interact with native `--autopilot` and `--max-autopilot-continues`?
8. Does a preToolUse deny under `--allow-all-tools` and `-p` still stop the call, and does the model see `permissionDecisionReason`?
9. Does `COPILOT_HOME` isolation also cut off the OS credential store, or do installs in a temp home still pick up the user's login?
10. With both `.github/plugin/marketplace.json` and `.claude-plugin/marketplace.json` in this repo, does `copilot plugin marketplace add <owner>/jbit` pick the former as documented?
