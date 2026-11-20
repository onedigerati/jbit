# Codex CLI spike — 2026-11-20

This note records what throwaway plugins showed on OpenAI Codex CLI 0.171.0 (npm `@openai/codex`). Each run used an isolated `HOME` and `CODEX_HOME` in the scratchpad and the user's ChatGPT sign-in. The default model was `gpt-6-luna`.

The note answers the "Open for the spike" list in [codex-cli-2026-11.md](codex-cli-2026-11.md). Every claim names its evidence under [docs/evidence/stage-5/](../evidence/stage-5/):
- `install/`: sign-in and headless run;
- `plugin/`: plugin hooks, trust and marketplaces;
- `hooks/`: payloads, deny, Stop and context;
- `skills/`: skills and subagents.

Each file starts with the command that produced it. Paths are scrubbed to `$SCRATCH`, `$HOME` and `$CLAUDE_TMP`, and usage and encrypted blobs to `<removed>`.

**Setup.** Three agents ran in parallel, each in its own Codex home, for about 31 `codex exec` runs and one interactive session driven through tmux. `codex login --device-auth` signed in, and `codex exec` answered `PONG` headlessly (`install/01`).

## Answers

**1 · Plugin hooks run in the CLI, once trusted. This settles the plan's open question: yes.**
- **Install.** `codex plugin marketplace add <local repo>`, then `codex plugin add <plugin>@<marketplace>`.
  - The plugin is copied to `$CODEX_HOME/plugins/cache/<mkt>/<plugin>/<version>/`.
  - `config.toml` gets `[plugins."<plugin>@<mkt>"] enabled = true` (`plugin/01`, `04`, `skills/01`).
  - The manifest is `.codex-plugin/plugin.json`.
  - The docs' "desktop app only" doesn't hold for the CLI.
- **Feature flag: none needed.** `codex features list` shows `hooks` as stable and on, and `plugin_hooks` as removed (`plugin/04`).
- **Trust.** Hooks that aren't trusted are skipped silently under `codex exec`, with no warning event (`plugin/05`, `hooks/01`).
  - The interactive TUI asks at startup: "Hooks need review · 3 hooks are new or changed", with Review, Trust all or Continue without. `/hooks` lists them per event, and `t` trusts one (`plugin/07`).
  - Trust is saved in `config.toml` as `[hooks.state."<plugin>@<mkt>:hooks/hooks.json:<event>:0:0"]`, with `trusted_hash` and `trusted_content_hash`.
  - With saved trust, `codex exec` runs the hooks without any flag (`plugin/08`).
  - `--dangerously-bypass-hook-trust` runs them without trust (`plugin/06`). It also adds two `type:"error"` items to `--json` output that carry the bypass warning.
- **Trust breaks on any script change.** Appending one comment line to the cached hook script silently stopped all its hooks (`plugin/09`), and restoring it brought them back (`plugin/10`). What `trusted_content_hash` covers, the script or the whole plugin, wasn't narrowed.
- **Finding the script.** `${PLUGIN_ROOT}` is substituted into the hook command.
  - Codex sets `PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT` to the cache directory.
  - It sets `PLUGIN_DATA` and `CLAUDE_PLUGIN_DATA` to `$CODEX_HOME/plugins/data/<plugin>-<mkt>`.
  - The hook's working directory is the session's cwd, the project (`plugin/06`, `07`).
  - The `CLAUDE_CODE_*` variables in the log came from the Claude Code session that ran the spike, not from Codex.
- **Hooks in `$CODEX_HOME/hooks.json`** (not in a plugin) use the same format and the same trust rule. They get no `PLUGIN_*` variables (`plugin/10`, `11`, `hooks/00-hooks.json`).

**2 · Marketplace precedence: `.agents/plugins/marketplace.json` wins.**
- With both files in one repo, only the `.agents` marketplace is listed, and the plugin from the `.claude-plugin` one can't be added under either name (`plugin/01`, `02`).
- In a copy without `.agents/`, Codex falls back to `.claude-plugin/marketplace.json` (`plugin/03`).
- So shipping the `.agents` file is what keeps `plugins/jbit` invisible to Codex.

**3 · Skills: keep the names bare, and invoke them as `$jbit:<name>`.**
- **Prefix.** A plugin `jbit` with `name: plan` is listed as `jbit:plan`. `name: jbit:probe` double-prefixes, to `jbit:jbit:probe` (`skills/02`, `11`, `12`).
- **`$jbit:plan` is the invocation the harness recognises.** It injects a `<skill><name>jbit:plan</name><path>…` item before the model acts (`skills/06`).
- **Other forms aren't invocations.** For `$plan` and `/jbit:plan`, the model found the right SKILL.md from its description and read it itself, which is a guess, not a guarantee (`skills/07`, `08`). These were tried only under `codex exec`; the TUI's `/` handling wasn't tried.
- **Implicit choice works.** "JBIT, resume" and a plain "I'm back after a break, where do things stand?" both led the model to the resume skill (`skills/09`, `10`).
- **Budget.** All 9 JBIT descriptions reached the model whole, in the developer message's `<skills_instructions>` block. Each matched its source, from 435 (`resume`) to 938 (`autopilot`) characters (`skills/02`).
- **Lost: `disable-model-invocation: true`** (on `approve`) has no Codex counterpart, so `approve` is visible to the model. `agents/openai.yaml` with `allow_implicit_invocation: false` is the likely route, but it is untested.

**4 · Subagents: `spawn_agent` v2. A plugin can't ship agents.**
- The tool is v2 `spawn_agent`, in the `collaboration` namespace, on `gpt-6-luna` (`skills/03`):
  - required: `task_name` and `message`;
  - optional: `agent_type`, `model`, `reasoning_effort` and `fork_turns` (`all` or `none`, default `all`).
  - The companion tools are `wait_agent`, `send_message`, `followup_task`, `list_agents` and `interrupt_agent`.
- **A call can pass a model.** A child spawned with `"model":"gpt-5.6-luna"` ran on it, and one without a model inherited the parent's (`skills/05`).
- The spawn calls appear only in the session files, not in the `--json` stream, and the spawn `message` is stored encrypted.
- **Plugin-shipped agents don't register.** These were all tried, and none appeared among the roles (`homecheck, default, explorer, worker`) (`skills/04`):
  - a plugin `agents/*.toml`;
  - an `"agents"` key in the manifest;
  - a plugin `.codex/agents/*.toml`.
- **What does register.** `$CODEX_HOME/agents/<name>.toml` registers on its own and its instructions reach the child. So does `-c agents.<name>.config_file=<toml>` (`skills/05`).

**5 · The Stop block loop works under `codex exec` and has no cap.**
- `{"decision":"block","reason":…}` continues the same turn. The reason arrives as a user message wrapped in `<hook_prompt hook_run_id=…>` (`hooks/09`).
- Stdin carries `stop_hook_active`, false on the first stop and true on each continuation, and `last_assistant_message`.
- An always-block hook ran 90 continuations over 146 s until the process got a SIGTERM (exit 143) from an unknown source, before the run's own `timeout 300` (`hooks/10`). No cap was hit. The spike agent saw about 1.6M input tokens, mostly cached, but the saved file has usage removed.

**6 · UserPromptSubmit and PreToolUse fire under `codex exec`, given trust or the bypass flag.**
- SessionStart, UserPromptSubmit and PreToolUse all fired (`plugin/06`, `08`, `hooks/02`).
- **UserPromptSubmit context.** Both plain stdout (`hooks/07`) and `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":…}}` (`hooks/08`) reach the model as a developer message.
- **It doesn't fire again on Stop-block continuations** (`hooks/09`).
- **Exit codes.**
  - A UserPromptSubmit hook that exits 1: the run carries on (`plugin/12`).
  - A PreToolUse hook that exits 2: the command is blocked, with stderr as the reason (`plugin/12`, `hooks/06`).
  - A PreToolUse hook that exits 1: the guard fails open and the command runs (`plugin/13`).
- **Stdin**, common fields: `session_id`, `transcript_path` (null under `--ephemeral`), `cwd`, `hook_event_name`, `model` and `permission_mode`. `permission_mode` reads `"bypassPermissions"` under `exec`.
- **Stdin**, per event:
  - UserPromptSubmit adds `turn_id` and `prompt`;
  - PreToolUse adds `tool_name`, `tool_input` and `tool_use_id`;
  - PostToolUse adds `tool_response`, a string.

**7 · `tool_input` for `apply_patch` and the shell** (`hooks/02`):
- **`apply_patch`:** `tool_input.command` holds the raw patch text: `*** Begin Patch`, then `*** Add File:` / `*** Update File:` / `*** Delete File:` lines with paths relative to the project, `*** Move to:` on a rename, and `*** End Patch`. All four forms were captured. It's the same grammar Copilot uses.
- **Shell:** `tool_name` is `"Bash"`, and `tool_input.command` is a plain string holding the inner command, not argv and not the `bash -lc` wrapper. The model calls tools through a JavaScript code-mode wrapper, but hooks still see `Bash` and `apply_patch`.
- **The deny.** Either output stops both tools: `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":…}}` (`hooks/05`), or exit 2 with the reason on stderr (`hooks/06`).
  - The file stays unchanged and no PostToolUse fires.
  - The model sees `Command blocked by PreToolUse hook: <reason>. Command: <patch or command>`.
- **The model falls back to the shell.** With `apply_patch` denied, it wrote the file through `printf >>` (`hooks/04`). Unprompted, it sometimes edits through the shell and never calls `apply_patch` (`hooks/03`). As on Copilot, the guard must cover both tools.

**8 · Context over ~2,500 tokens is truncated in the middle, and the limit can be raised.**
- A 4,030-token UserPromptSubmit output reached the model as:
  - `Warning: truncated output (original token count: 4030)`;
  - the head, then `…1561 tokens truncated…`, then the tail;
  - `Full hook output saved to: /tmp/hook_outputs/<session>/<id>.txt`.
  The model reported both the head and tail codewords, and the saved file was byte-identical to the output (`hooks/11`).
- `"additionalContextLimit": 8000` on the handler in `hooks.json` passed all 16,120 characters through untruncated, so the limit counts tokens, not characters (`hooks/12`).
- Codex saves truncated hook output under shared `/tmp/hook_outputs/`, so a cut `## Now` also lands on disk there. Raising the limit avoids it.

**Other things seen**
- `--full-auto` is gone in 0.171.0. Use `--sandbox workspace-write` (`hooks/01a`).
- `codex exec` waits on stdin when it isn't a terminal, so automation passes `< /dev/null`.

**Not proven**
- `allow_implicit_invocation: false`.
- What the trust hash covers.
- Agent TOMLs in a project `.codex/agents/`.
- The TUI's handling of `/jbit:plan`.
- PreToolUse's older `{"decision":"block"}` shape.
- What ended the 90-block run.
- What a PreToolUse hook killed by Codex's timeout does: if it fails open as exit 1 does, the guard fails open.
- Whether a Stop `reason` is cut at the same ~2,500 tokens.
- Whether PreToolUse fires for tool calls inside `spawn_agent` children, for `write_stdin` into a running shell session, and for MCP tools. Only `Bash` and `apply_patch` were seen.

## What it changes for stages 6–7

**Stage 6 (Codex adapter + package)**
- **Hooks ship in the plugin.** `plugins/jbit-codex/hooks/hooks.json` runs `node "${PLUGIN_ROOT}/scripts/hook.mjs" <event>` on these events:
  - SessionStart;
  - UserPromptSubmit;
  - PreToolUse (matcher `*`);
  - Stop.
  The adapter reads the project from stdin `cwd`, and its state directory from `PLUGIN_DATA`. With neither, it fails closed, as the Copilot shim does.
- **Fail-safe output.** A PreToolUse exit 1 fails open on Codex, so the adapter must never exit 1. Every path it controls (crash, unparseable input, its own watchdog firing first) returns the JSON deny, or exits 2, for a guarded tool. The parity and fixture tests pin this.
  - The adapter's watchdog fires well inside the handler's `timeout`. Stage 7 proves live what Codex does with a hook it kills, and the README lists it as a gap if that fails open.
- **Tool map.**
  - `apply_patch` takes `tool_input.command` as a string and reuses `hosts/copilot/patch.mjs`'s grammar. Hoist it to `hosts/core/`; the Copilot behaviour stays unchanged.
  - `Bash` takes `tool_input.command`.
  - Unknown tools carrying a path or command are denied, as on Copilot.
- **`## Now` in context.** It goes on UserPromptSubmit `additionalContext`.
  - Set `"additionalContextLimit"` on that handler, so a long `## Now` isn't cut in the middle. 8000 was proven; the build picks a value with headroom over the Claude hook's own cap.
  - UserPromptSubmit doesn't fire on Stop continuations, so the Stop block's `reason` must carry what the continuation needs (the carry-on prompt plus `## Now`). Under the default limit, that `reason` is the only context a continuation gets.
- **Autopilot continuation.** It uses Stop `{"decision":"block","reason":…}`. Codex has no cap, so the adapter keeps its own count per prompt in session state and stops blocking at a fixed limit. 8, matching Copilot, is the default; it is logged as a (pm) decision when built.
- **Skills.**
  - Bare `name:` as on Copilot.
  - The generated "On Codex CLI" section tells users to type `$jbit:<name>`.
  - It maps role-agent calls to `spawn_agent` with `task_name` and `message`, plus `model` only from the plan's Models line.
  - Try `agents/openai.yaml` `allow_implicit_invocation: false` for `approve`, and if it doesn't hold, list the gap. The hook still releases a held stage only on the user's own typed approval, so the model invoking `approve` doesn't release one.
- **No agent files ship.** A plugin can't register them, and the package carries no role agents (the open question on what users lose stands).
  - Two routes would work: copying TOMLs to `$CODEX_HOME/agents/`, or `agents.<name>.config_file` pointing into the plugin cache. Both are rejected for now. The first needs an installer step outside the plugin. The second breaks when the cache's version folder changes on an update.
- **Guarding the guard.** A script change voids trust and silently turns every gate off, and so would edits to `config.toml` or `$CODEX_HOME/hooks.json`. The guard therefore denies `Bash` and `apply_patch` writes under `$CODEX_HOME`, with a parity scenario.
- **Other routes around the guard.** A stage 6 check covers each one: tool calls inside `spawn_agent` children, `write_stdin`, and MCP tools. Unknown tools carrying a path or command are denied.
- **Marketplace.** Ship `.agents/plugins/marketplace.json` → `./plugins/jbit-codex`, with the manifest at `plugins/jbit-codex/.codex-plugin/plugin.json`. That file hides `.claude-plugin/` from Codex only. Claude Code still reads `.claude-plugin/`, and Copilot reads `.github/plugin/`, so stage 6 re-runs both hosts' checks.

**Stage 7 (end to end and README)**
- **Install.** `codex plugin marketplace add <repo path>`, then `codex plugin add jbit@<marketplace>`, each run in its own `HOME` and `CODEX_HOME` with a copy of `auth.json`, never printed or saved.
- **Running.** `codex exec --json --skip-git-repo-check --sandbox workspace-write --dangerously-bypass-hook-trust … < /dev/null`.
  - The bypass flag's `type:"error"` items are expected and not a failure.
  - One run should also prove saved trust without the flag.
- **README "Codex CLI".** Users must trust JBIT's hooks once, in the TUI at startup or through `/hooks`, and again after every JBIT update, since a script change voids trust. The trust prompt itself warns that trusted hooks run outside the sandbox.
  - Until they do, the hooks are off: no `## Now`, no gates, no carry-on, and nothing says so.
  - The README says this first in its gap block, alongside the other gaps:
    - no role agents;
    - `$jbit:<name>` invocation;
    - `approve` visible to the model if `allow_implicit_invocation` doesn't hold.
