# Subagent model and effort: fields, plugin agents, precedence

Status: verified against official docs, 2026-11-17.

## Question

How do custom subagent definitions set model and reasoning effort, and how are same-named definitions resolved? Specifically:

1. Which frontmatter fields set model and effort, and what values do they take?
2. Can a plugin ship subagents, and how are they named and invoked?
3. Which definition wins when the same name exists at several levels?
4. Does a `model` or `effort` passed on the Agent tool call override the definition's frontmatter?

## Answers

### 1. Frontmatter fields (confidence: high)

- `model`: `sonnet`, `opus`, `haiku`, `fable`, a full model ID (e.g. `claude-opus-5-5`), or `inherit`. Optional. When it is left out, the model order in answer 4 applies.
- `effort`: `low`, `medium`, `high`, `xhigh`, `max`. Optional. Which levels work depends on the model. It overrides the session effort level but not the `CLAUDE_CODE_EFFORT_LEVEL` env var.

### 2. Plugin subagents (confidence: high)

- Yes. Agents go in the plugin's `agents/` directory, which is scanned recursively. They load automatically wherever the plugin is enabled.
- They are registered under a scoped name, `<plugin>:<name>`. Subdirectories add segments: `agents/review/security.md` in `my-plugin` becomes `my-plugin:review:security`. Mention one as `@agent-my-plugin:code-reviewer`. `claude --agent <name>` resolves the bare name, and you need the scoped name only when two plugins use the same one.
- A `name` can't contain `:`, which is reserved for scoping.
- Plugin agents ignore the `hooks`, `mcpServers` and `permissionMode` fields. `model` and `effort` are not on that list, so they work.

### 3. Precedence for same-named definitions (confidence: high)

Highest first:

1. Managed settings (organization)
2. `--agents` CLI flag (session); the SDK's `agents` option is the programmatic equivalent (inferred)
3. Project `.claude/agents/`. Among nested project dirs, the one closest to the working directory wins.
4. User `~/.claude/agents/`
5. Plugin `agents/`

Caveat (medium confidence): plugin agents carry a scoped name (`plugin:name`). So a project agent named `builder` probably takes over a bare `builder` reference. The docs do not say whether it replaces an explicit `jbit:builder` call. Test this before relying on it.

### 4. Per-invocation override (confidence: high)

Model, first match wins:

1. The Agent tool's `model` parameter. It takes an alias only, not a full ID or `inherit`. A mod's `agent.spawn` hook model replaces it.
2. The definition's `model` field, including `inherit`.
3. The `CLAUDE_CODE_SUBAGENT_MODEL` env var.
4. The main conversation's model, or the parent's model for a nested subagent.

If both `CLAUDE_CODE_SUBAGENT_MODEL` and `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` are set (v2.1.257+), that model is forced: definition `model` fields and per-call `model` are both ignored.

Effort: the Agent tool's `effort` parameter overrides the frontmatter `effort`, and the override persists when the agent is resumed. `CLAUDE_CODE_EFFORT_LEVEL` beats both. The per-call parameter needs v2.1.292+ and does not apply to forks.

## Sources

- https://code.claude.com/docs/en/sub-agents, read 2026-11-17. It covers the frontmatter table, "Choose the subagent scope", plugin subagents, and "Choose a model" including effort. The page's last ~16k characters were not read.

## What this changes for per-role model/effort in a plugin

- Ship one agent file per role (`agents/builder.md`, `reviewer.md`, `verifier.md`, `researcher.md`), each with `model:` and `effort:` in frontmatter. Those are the plugin's defaults.
- Users get overrides for free through name precedence. A same-named file in `~/.claude/agents/` overrides the plugin for that user, and one in `.claude/agents/` overrides both for a project. The catch is that the override replaces the whole definition (prompt and tools too), not just model and effort. There is no field-level merge.
- Skills that spawn these roles should not pass `model` or `effort` on the Agent call by default. A per-call value beats the frontmatter, so it would silently defeat user and project overrides. Pass one only when the user asked for it.
- Spawn by bare role name (e.g. `builder`) rather than `jbit:builder`, so the precedence chain can apply. Verify how a scoped plugin name interacts with an unscoped project or user file (see the caveat in answer 3).
- If users should change only model and effort without copying the prompt, the plugin would need its own settings layer, such as a config file the skill reads and then passes as per-call `model`/`effort`. That trades away the native override and is limited to aliases for `model`.
- Env vars (`CLAUDE_CODE_SUBAGENT_MODEL[_FORCE]`, `CLAUDE_CODE_EFFORT_LEVEL`) are global and override per-role choices, so document that.
