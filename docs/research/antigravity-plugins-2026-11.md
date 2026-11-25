# Antigravity CLI (`agy`): plugins, skills, agents and instructions (research, 2026-11-25)

Scope: what a generated JBIT package for Google Antigravity CLI (`agy` 1.5.17, installed at `~/.local/bin/agy`) must match for plugins, marketplaces, skills, custom agents, instruction files and slash commands. Hooks, MCP and headless runs are covered only where they touch packaging. All sources were read 2026-11-25. Three kinds of source are cited:

- **Docs**: `antigravity.google/docs/*.md`.
- **Built-in skills**: the reference docs that ship with the CLI under `~/.gemini/antigravity-cli/builtin/skills/` (`agy-customizations/docs/*.md`, `plugin/SKILL.md`, `migrate-agent-settings/SKILL.md`). They are product files written for the agent, not public docs.
- **Probe**: runs of the local CLI in the scratchpad: `agy plugin validate`, a throwaway `agy plugin install` that was then uninstalled, and two short `agy -p` runs on `gemini-3.8-flash-low`. `~/.gemini/config/plugins/` was empty before the probes and is empty again.

No public docs page contained instructions aimed at an AI agent. The built-in skills are agent instructions by design, since they are skills. For example, `plugin/SKILL.md` tells the agent never to call `InstallCustomization` or `DeletePlugin` and never to hand-edit `~/.gemini/config/config.json`. I read them as data and acted on none of them. The docs' example agent prompt (`code-auditor.md`) and example skill body are templates, not instructions.

---

## 1. Plugin manifest

**Question.** What is the manifest format, and where does it live?

**Answer.**
- **Location.** A plugin is a directory with `plugin.json` at its root or at `.antigravity-plugin/plugin.json`, and the second takes precedence. The validator also accepts `.gemini-plugin/plugin.json`. A manifest named `Plugin.json` is found case-insensitively (changelog). The file is parsed as JSONC.
- **Fields.** `$schema` (`https://antigravity.google/schemas/v1/plugin.json`), `name`, `displayName`, `description`, `version`, `logo` (a relative image path), `suggestedPrompts` (up to 3), `author`, `homepage`, `repository`, `disabled`, `category`, `skills` (extra skill folders) and `extensions["com.google.antigravity"]`.
  - Unknown top-level fields are dropped silently, and `validate` warns about them.
  - `name` is the global key. Lowercase kebab-case is required to publish.
  - With no `version`, the marketplace won't list the plugin (a validate warning).
- **Agent Plugins schema.** A `plugin.json` that declares the Agent Plugins `$schema` is read differently: it uses `mcp.json` instead of `mcp_config.json`, among other changes (changelog 1.5.14). This is the same `agent-plugins.org` schema that Codex accepts.
- **Layout of a native plugin:**
  - `plugin.json`
  - `skills/<name>/SKILL.md`
  - `agents/<name>.md` or `agents/<name>/agent.md`
  - `rules/AGENTS.md` (or `rules/GEMINI.md`) plus `rules/<rule>.md` files with frontmatter
  - `hooks.json` at the **root**
  - `mcp_config.json`
  - `assets/logo.svg`
  - optional `skills.json`, `agents.json` and `rules.json`
- **Files a native plugin does not load.** `hooks/hooks.json`, `commands/`, `workflows/*.md`, and an `AGENTS.md` or `GEMINI.md` at the plugin root. `validate` warns about each.

**Sources.**
- https://antigravity.google/docs/plugins.md (read 2026-11-25)
- https://antigravity.google/docs/build-plugins.md (read 2026-11-25)
- Built-in skills: `plugin/SKILL.md` and `agy-customizations/docs/plugins.md` (read 2026-11-25)
- `agy changelog` 1.5.x (read 2026-11-25)
- Probe: `agy plugin validate --strict` on a scratch native plugin, which warned `unknown field "bogus" is ignored` and `no version` (read 2026-11-25)

**Confidence.** High for the root `plugin.json` and the layout, confirmed by the probe. Medium for how the Agent Plugins `$schema` variant differs, which is known only from the changelog.

**What it changes for the plan.**
- Generate `plugins/jbit-antigravity/` with a root `plugin.json` that carries `name: "jbit"`, `version`, `description` and the Antigravity `$schema`.
- Put the rules in `rules/AGENTS.md`, the hooks in a root `hooks.json`, and the skills in `skills/`. Do not emit `commands/` or `hooks/hooks.json`.
- Gate the build with `agy plugin validate --strict --json` in tests.

---

## 2. `agy plugin install`: sources, marketplaces, other hosts' manifests

**Question.** What can `agy plugin install` install from: a local path, a git repo, a marketplace file? Does it read `.claude-plugin/` or other hosts' manifests, and does that cause confusion in a repo that has both?

**Answer.**
- **Targets** (docs and `agy plugin --help`):
  - a local directory
  - a GitHub repo URL `https://github.com/<owner>/<repo>`, which is cloned with its submodules
  - `<plugin>` or `<plugin>@<marketplace>`. A bare name means `antigravity-plugins-official`, and there is also `antigravity-plugins-partners`. Marketplace installs need a sign-in.
- **Tree URLs.** `validate` also takes a `.zip`, an https zip URL, and a `github.com/.../tree/<branch>/<path>` URL. The docs do not say whether `install` takes a tree URL. I did not test it.
- **Copied, not linked.** The plugin is copied into `~/.gemini/config/plugins/<manifest name>/`. A later edit to the source has no effect until you install again.
- **Third-party marketplaces.** `agy plugin link <mp> <target>` exists, but it answered `unknown marketplace` for both `x` and `antigravity-plugins-official`. Neither docs page describes a third-party marketplace.
- **Antigravity's `marketplace.json`.** `validate` reads one. It rejects JBIT's Codex file (`.agents/plugins/marketplace.json`) because its local source has no URL: `plugin "jbit" is skipped: source has no url`. It fails to parse the Claude file (`.claude-plugin/marketplace.json`) because a string `source` is the wrong type. So Antigravity's marketplace sources are URL-based, and neither existing marketplace file works for it.
- **Claude Code plugins** (`.claude-plugin/plugin.json`, no native manifest). `install` and `import` convert them. In the probe:
  - Skills were copied unchanged. `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_SKILL_DIR}` and `$ARGUMENTS` stayed literal.
  - Each `commands/*.md` became a skill named `<plugin>-cmd-<name>`.
  - `hooks/hooks.json` became a root `hooks.json`. `Bash` was mapped to `run_command`, `${CLAUDE_PLUGIN_ROOT}/` was rewritten to `./`, and a 60-second timeout was added.
  - `agents/*.md` were copied **unchanged**, then rejected on load (`tools: Read, Grep, Bash` is not a list, and `model: opus` is not a valid tier).
  - `agy plugin validate plugins/jbit` says: "This looks like a Claude Code plugin: `plugin install` converts it, but it doesn't load as is".
  - Gemini CLI extensions (`gemini-extension.json`) are converted the same way.
- **When both kinds of manifest are present,** the native manifest wins. A directory with both `plugin.json` and `.claude-plugin/plugin.json` installed as `Source: antigravity`, and the Claude manifest was ignored without a warning.
- **Confusion risks found by the probe:**
  1. **Bulk install from a repo root.** Running `agy plugin install <dir>` on a directory that has a `plugins/` folder printed `Found bulk plugins directory` and installed **every** subfolder. It ignored `.claude-plugin/marketplace.json`. On the JBIT repo root, this would install `jbit` (converted from Claude), `jbit-codex`, `jbit-copilot` and the Antigravity package.
  2. **Silent replacement on a name clash.** Two plugins with the same `name` landed in the same folder, and the second printed `(replaced existing installation)`. The JBIT packages all use the name `jbit`, so the last one installed wins.
  3. **Workspace auto-discovery.** `.agents/plugins/<dir>/plugin.json` in a workspace is loaded automatically. Codex's `.agents/plugins/marketplace.json` is a file, not a folder, so it is not a plugin. But a package placed under `.agents/plugins/` would load in every agy session opened in the JBIT repo.

**Sources.**
- https://antigravity.google/docs/plugins.md (read 2026-11-25)
- https://antigravity.google/docs/marketplace.md (read 2026-11-25)
- https://antigravity.google/docs/build-plugins.md (read 2026-11-25)
- `agy plugin --help` and `agy plugin validate --help` (read 2026-11-25)
- Built-in skill: `agy-customizations/docs/plugins.md` (read 2026-11-25)
- `agy changelog` lines on install, import, `.claude-plugin` and bulk install (read 2026-11-25)
- Probe: install of a Claude-only plugin, bulk install with a name clash, validate on the repo's two marketplace files (read 2026-11-25)

**Confidence.** High for local-directory install, Claude conversion, bulk install and name-clash replacement: all were observed. Medium for GitHub-URL install, which is in the docs but was not run. Low for the `marketplace.json` schema and `plugin link`, which are undocumented.

**What it changes for the plan.**
- Ship the Antigravity package as a native plugin. Do not rely on Claude conversion, because it leaves `${CLAUDE_*}` in skills and keeps agents that fail to load.
- The install docs should say to install by package path: `agy plugin install <clone>/plugins/jbit-antigravity`. Never install the repo root. The GitHub route is `agy plugin install https://github.com/<owner>/<repo>/tree/main/plugins/jbit-antigravity`, but it is untested, so a spike must check it.
- Warn users that installing any other `jbit` package replaces this one.
- Keep the package out of `.agents/plugins/`.
- Leave marketplace support out of scope until the format is documented.

---

## 3. Skills

**Question.** What is the skill format: SKILL.md frontmatter, discovery folders, how skill-relative script paths resolve, and any `${...}` variables?

**Answer.**
- **Format.** Skills follow the Agent Skills shape: `skills/<name>/SKILL.md`, with YAML frontmatter that has `description` (required) and `name`. Without `name`, the skill takes its folder's name.
- **Validation.** `validate` warns when `name` doesn't match the folder or when the body is over 24 KB, and errors on invalid YAML frontmatter.
- **Claude-only fields.** `argument-hint`, `allowed-tools`, `disable-model-invocation` and `user-invocable` passed `--strict` without a warning. They are tolerated but not documented. I did not observe them taking effect, so assume they are ignored.
- **Discovery:**
  - `.agents/skills/` (and the legacy `.agent/skills/`) in the workspace and in each parent up to the repository root
  - `~/.gemini/config/skills/`
  - `~/.gemini/antigravity-cli/skills/` and `~/.gemini/skills/` (CLI)
  - `~/.agents/skills/` (added in 1.5.17)
  - plugin `skills/` folders
  - paths listed in `skills.json`
- **Precedence.** Workspace, then declared, then global, then built-in. On a name clash the earlier one wins.
- **Loading.** Only the name and description are in context until the skill is used.
- **Paths.** The model is given the skill's absolute `SKILL.md` path. In the `agy -p` probe it quoted `.../probe-ws/.agents/skills/probe/SKILL.md`. The docs recommend relative links such as `[prepare.sh](./scripts/prepare.sh)`, and the model resolves them against the skill folder itself. Nothing substitutes them.
- **Variables.** The docs describe no `${...}` substitution and no argument substitution in skills. The Claude conversion left `${CLAUDE_PLUGIN_ROOT}` and `$ARGUMENTS` literal. `PLUGIN_ROOT` and `PLUGIN_DATA` are environment variables only for plugin hooks and MCP servers, not for skill text.

**Sources.**
- https://antigravity.google/docs/skills.md (read 2026-11-25)
- Built-in skills: `agy-customizations/SKILL.md` and `agy-customizations/docs/skills.md` (read 2026-11-25)
- `agy changelog` 1.5.17, 1.5.10 and 1.5.5 (read 2026-11-25)
- Probe: validate of a skill with Claude-only fields, Claude conversion, `agy -p` on the skill path (read 2026-11-25)

**Confidence.** High for the format and discovery. Medium for "no variable substitution": the docs are silent and the probe shows the text is not rewritten at install, but substitution at run time was not tested directly.

**What it changes for the plan.**
- The generator must rewrite `${CLAUDE_PLUGIN_ROOT}/skills/verify/scripts/...` (in `stage`, `fix` and `verify`) and `${CLAUDE_SKILL_DIR}` into paths relative to the skill, such as `./scripts/...`.
- If a script must run from the plugin root, tell the model it is "in this skill's folder (the directory of this SKILL.md)". Shell variables won't do it.
- Strip `$ARGUMENTS` in the same way as for Codex.
- Drop Claude-only frontmatter for cleanliness.

---

## 4. Custom agents and subagents

**Question.** How do custom agents work (`agy agents`, `--agent`)? Can a plugin ship them, and can they set the model and effort?

**Answer.**
- **Where they live.** `.agents/agents/<name>.md` (or `<name>/agent.md`), `~/.gemini/config/agents/`, and plugin `agents/` folders, or a root `agents.json` in a plugin.
- **Plugins.** A plugin can ship agents: the install summary lists them.
- **Format.** Markdown with YAML frontmatter, and the body is the system prompt. The fields:

  | Field | Type | Default | Notes |
  |---|---|---|---|
  | `name` | string | required | A built-in name is an error. |
  | `description` | string | required | |
  | `tools` | YAML list | small read-only set | Native names such as `read_file`, `edit_file`, `write_file`, `run_command`, `manage_task` and `search_web`. A comma string is invalid YAML for this field, and the agent is skipped. |
  | `mainAgent` | bool | `true` | Can be chosen as the main agent. |
  | `subagent` | bool | `true` | Can be called with `invoke_subagent`. |
  | `model` | string | `inherit` | Only `inherit`, `flash` or `pro`. `opus`, `sonnet`, `claude-opus-5-5-high` and `gemini-4-argon-high` all fail with `Invalid model tier ... The loader skips this agent`. |
  | `commandExecutionPolicy` | string | | |
  | `mcpServers` | | | |
  | `skills`, `plugins`, `rules`, `agents`, `hooks` | | | Paths resolve against the agent's file. |
  | `inheritMcp`, `inheritCustomizations` | | | |

- **Effort.** There is **no per-agent effort field** in the docs. `effort: bogus` and other unknown keys pass `--strict` silently, so effort is ignored. Effort exists only per session (`--effort low|...|max`, `/effort`) and in the Orchestrator planner/executor setting.
- **Unknown tools.** An unknown tool name in `tools` is not flagged by validate, and the docs warn it can make the subagent hang.
- **Built-in agents.** `self`, `browser`, `research`, `deepagent` and `review-agent`.
- **Selecting an agent.** `--agent <name>` sets the main agent. A headless run exits 1 when the name is unknown. `/agents` is the in-session manager.
- **Listing agents.** `agy agents` printed nothing in a non-TTY shell.
- **Delegation.** The main agent delegates with `invoke_subagent` (role and prompt; workspace `inherit`, `branch` or `share`; nesting up to 10 deep), and with `run_workflow`.

**Sources.**
- https://antigravity.google/docs/subagents.md (read 2026-11-25)
- https://antigravity.google/docs/build-plugins.md (read 2026-11-25)
- Built-in skill: `migrate-agent-settings/SKILL.md`, for the Claude-to-native tool mapping and the built-in names (read 2026-11-25)
- `agy --help`, `agy models` and `agy changelog` (1.5.4, 1.5.3, 1.4.x) (read 2026-11-25)
- Probe: validate of agents with each `model` value, `effort`, unknown fields and comma-string `tools` (read 2026-11-25)

**Confidence.** High for the format, the model tiers and plugin-shipped agents, all observed through the validator. Medium for "effort is ignored", which rests on the docs being silent and the field not being flagged.

**What it changes for the plan.**
- The generator must emit native agent files:
  - `tools` as a YAML list of native names
  - `subagent: true` and `mainAgent: false` for role agents
  - `model` mapped to `pro` (strong) or `flash` (fast), or omitted (`inherit`)
- Per-role effort cannot be carried over. Log this as a parity gap, and drop the field rather than emit it.
- Prefix agent names (for example `jbit-verifier`) so they cannot collide with built-ins.
- Skill text that says "spawn the verifier agent" must name `invoke_subagent` and the agent's name.

---

## 5. Instruction files

**Question.** Which instruction files does agy read: AGENTS.md, GEMINI.md, CLAUDE.md?

**Answer.**
- **Files read.** `AGENTS.md` and `GEMINI.md`, in each folder from the working directory up to the repository root, and also in `.agents/`. Global ones are read from `~/.gemini/` and `~/.gemini/config/`. Plugin rules come from `rules/`. `.agents/rules/*.md` files need a `trigger:` frontmatter (`always_on`, `model_decision`, `glob` or `manual`), or they are dropped silently.
- **How they combine.** All rules found are combined and deduplicated. The docs give no precedence between AGENTS.md and GEMINI.md.
- **Limits.** Each file is capped at 24,000 bytes, and always-on plus global rules share a 20,000-token budget. Over budget, the largest files are replaced by path pointers.
- **CLAUDE.md is not read.** In the `agy -p` probe, a codeword in `CLAUDE.md` gave `NONE`. The same file renamed to `AGENTS.md` gave `"PURPLE-17"`.

**Sources.**
- https://antigravity.google/docs/rules.md (read 2026-11-25)
- Built-in skill: `agy-customizations/docs/rules.md` (read 2026-11-25)
- Probe: two `agy -p` runs on `gemini-3.8-flash-low` (read 2026-11-25)

**Confidence.** High.

**What it changes for the plan.**
- A user project's `CLAUDE.md`, including the JBIT-managed rules that `jbit:charter` writes there, is invisible to agy. JBIT on agy must write or read `AGENTS.md`, or tell users to add `@CLAUDE.md`-style includes. Check whether the `@[label](path)` include syntax works from AGENTS.md.
- The plugin's own always-on guidance goes in `rules/AGENTS.md`. Keep it small, because it counts toward the 20k-token rules budget.

---

## 6. Slash commands

**Question.** How do slash commands work, and can a plugin ship them?

**Answer.**
- **There is no custom-command file type.** Every skill becomes a slash command `/<skill-name>` in the TUI. Plugin skills also show up under a `plugin:` prefix in autocomplete (changelog). After adding skills, run `/skills reload` or start a new conversation.
- **Commands are not loaded.** Claude `commands/*.md` files are not loaded. `install` and `import` turn each one into a skill named `<plugin>-cmd-<name>`.
- **Headless runs.** `--disable-slash-commands` turns off slash and skill expansion in print mode.
- **Arguments.** There is no `$ARGUMENTS` substitution. The migration skill rewrites it as "apply this to what the user asked for".

**Sources.**
- https://antigravity.google/docs/skills.md (read 2026-11-25)
- https://antigravity.google/docs/cli/reference.md (read 2026-11-25)
- `agy changelog` 1.5.17 and 1.5.5 (read 2026-11-25)
- Probe: conversion of `commands/hello.md` (read 2026-11-25)

**Confidence.** High that skills are the command surface. Medium on the exact display form of `plugin:skill`, which I did not check in the TUI.

**What it changes for the plan.**
- JBIT's skills become `/plan`, `/stage` and so on, or `/jbit:plan` with the prefix, at no extra cost.
- The "JBIT plan" text triggers must rely on the skill descriptions, as they do on Codex.

---

## Open for the spike

- Does `agy plugin install` take a GitHub `tree/<branch>/<path>` URL, as `validate` does?
- Does the `plugin:` prefix appear exactly as `/jbit:plan`?
- Is `${...}` in skill text ever substituted at run time? Test with a run that echoes it.
- Does `@[label](path)` in `AGENTS.md` pull in `CLAUDE.md`?
- Is there any per-agent effort, for example in the planner/executor settings, that a plugin could set?
