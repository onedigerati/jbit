# GSD multi-host support (Codex CLI, Copilot) — research note

Date read: 2026-11-20. Sources, read-only clones (nothing in them was run):
- open-gsd/gsd-core (active), https://github.com/open-gsd/gsd-core, HEAD `530e767` (2026-11-20). Paths below are relative to this repo unless marked `[archived]`.
- gsd-build/get-shit-done (archived predecessor), HEAD `bdcaab2` (2026-05-31), marked `[archived]`.

Purpose: learn how GSD ships one Claude-format source to GitHub Copilot and OpenAI Codex CLI, so that JBIT can do the same without changing the Claude plugin.

## 1. Overall approach

**Answer.** GSD has a single Claude-native source: `commands/gsd/*.md` (slash commands), `agents/*.md` (Claude agent frontmatter with `tools:`), workflow and spec trees under `gsd-core/`, and `hooks/*.js`. An npm installer converts it at install time for each host (`npx @opengsd/gsd-core --codex|--copilot|--claude|… --global|--local`). The installer is driven by a per-host descriptor (question 2). Each artifact kind names a converter function, for example `"converter": "convertClaudeCommandToCodexSkill"`. On Claude, commands become skills too (`convertClaudeCommandToClaudeSkill`), and agents are copied as they are (`converter: null`).

Where the conversion code lives, and how big it is:
- `src/runtime-artifact-conversion.cts`: 4,882 lines. It holds the converters for about 20 hosts. The Codex part is about 300 lines: `convertSlashCommandsToCodexSkillMentions` L2185, `convertClaudeToCodexMarkdown` L2217, `getCodexSkillAdapterHeader` L2251 (about 130 lines of adapter prose), `convertClaudeCommandToCodexSkill` L2381, and `convertClaudeAgentToCodexAgent` L3381. The Copilot part is about 150 lines: `convertClaudeToCopilotContent` L385, `convertClaudeCommandToCopilotSkill` L415, the `claudeToCopilotTools` map L2845, `convertCopilotToolName` L2929, and `convertClaudeAgentToCopilotAgent` L2948.
- `bin/install.js`: 15,792 lines. It handles orchestration, merging Codex `config.toml`, generating agent TOML (`generateCodexAgentToml` L4348), writing Copilot instructions and AGENTS.md (around L13795), migrations, rollback and uninstall.
- `src/runtime-hooks-surface.cts`: 3,828 lines. It writes hook config for each host shape (Codex hooks.json, Copilot `hooks/gsd-session.json`, Cursor, Windsurf, and others).
- `[archived]` In the predecessor all of this sat in one `bin/install.js` of 11,376 lines, with the same functions: `claudeToCopilotTools` L115, `convertClaudeToCopilotContent` L1733, `getCodexSkillAdapterHeader` L2558, `convertClaudeAgentToCodexAgent` L2644. Its CHANGELOG L1016 records "Copilot CLI runtime support — install with `--copilot`, maps Claude Code tools to GitHub Copilot tools". The design has stayed the same. Only the factoring into descriptors and modules is new.

**Confidence.** High. Read directly from the source.

**What it changes for JBIT.** The pattern fits JBIT's constraint ("do not change the Claude plugin"). Keep `plugins/jbit/` as the single source and add a build or install step that emits Codex and Copilot trees. GSD's size is a warning, though: about 25k lines of conversion and installer code for 20 hosts, much of it fixes to regex path rewrites. JBIT should target two hosts, emit at build time into committed or packaged directories rather than rewriting user config at install time, and keep the substitutions few and tested.

## 2. Per-host capability descriptor (`capabilities/<host>/capability.json`)

**Answer.** Each host has a JSON descriptor (`role: "runtime"`). It is validated against a closed vocabulary documented in `docs/reference/capability-manifest.md` (L170–234; ADR-1016) and compiled into `gsd-core/bin/lib/capability-registry.cjs`. Installer and hook code are forbidden from branching on host-name literals. An ESLint rule enforces this (`tests/eslint-no-runtime-name-literal.test.cjs`), so every per-host difference has to be a descriptor field.

Key fields:
- `runtime.configHome`
- `localConfigDir`
- `configFormat`
- `artifactLayout.{global,local}[]`: the kind, destination subpath, prefix, and converter for each artifact kind
- `commandStyle`: `slash-hyphen` or `shell-var`
- `hooksSurface`
- `hookEvents`
- `extendedHookEvents`
- `sandboxTier`
- `supportTier`
- `installSurface`
- `hostIntegration.dispatch`: namedDispatch, nested, maxDepth, background, isolation, maxConcurrency
- `hostBehaviors`: a closed set of 75 keys, for example `unsupportedFeatures`, `bakesStaticAgentModel`, `contentRewriteProfile`, `agentFileExtension`

| field | claude | codex | copilot |
|---|---|---|---|
| title | Claude Code | OpenAI Codex CLI | "GitHub Copilot (VS Code)" (description) |
| supportTier | 1 | 1 | 2 ("shipped, lower coverage") |
| configHome / local dir | `~/.claude` / `.claude` | `~/.codex` (`CODEX_HOME`) / `.codex`; global skills go to `~/.agents/skills` | `~/.copilot` (`COPILOT_CONFIG_DIR`, `COPILOT_HOME`) / `.github` |
| configFormat / installSurface | settings-json / settings-json | toml / codex-toml | markdown / copilot-instructions |
| commandStyle | slash-hyphen (`/gsd-x`) | shell-var (`$gsd-x`) | slash-hyphen |
| hooksSurface | settings-json | codex-hooks-json | copilot-inline |
| hookEvents | `claude` | `claude` | absent; description says "no hook events emitted" |
| extendedHookEvents | SubagentStop, Stop, PreCompact, FileChanged | SubagentStop, Stop, PreCompact | `[]` |
| sandboxTier | none | codex-agent-sandbox | none |
| unsupportedFeatures | none | `context-warnings`, `phase-lifecycle-display` | none declared |
| dispatch | nested, maxDepth 5, isolation `harness-worktree`, maxConcurrency 20 | nested, **maxDepth 1**, backgroundDispatch true, isolation `orchestrator-worktree` | **nested false**, maxDepth 1, isolation `undocumented` |
| model | `nativeModelAliases: true` | `bakesStaticAgentModel: true`, baked extensions `.toml`, `.md` | none |
| rewrite profile | `slash-tilde-restore` | `slash-own-tilde`, plus `rewriteClaudeAtIncludes`, `agentTomlFiles` | `attribution-only`, plus `noPathRewrite`, `skipSharedHooksInstall`, `agentFileExtension: ".agent.md"` |

Files: `capabilities/claude/capability.json`, `capabilities/codex/capability.json`, `capabilities/copilot/capability.json`.

The Copilot descriptor names VS Code. The installer's hook code, however, cites the Copilot **CLI** hooks reference (`bin/install.js` L312–319, linking docs.github.com/en/copilot/reference/hooks-configuration) and writes AGENTS.md "which Copilot CLI reads" (L13795). GSD's Copilot target is a blend of both hosts.

**Confidence.** High for the field values. Medium on whether "copilot" means the CLI, VS Code, or both.

**What it changes for JBIT.** Write a small descriptor for each host up front, even a plain object in the build script: config home, skill and agent destinations, command style, hook surface, dispatch depth, and an explicit `unsupportedFeatures` list. JBIT relies on deep orchestration: subagents spawned by the PM, and a verifier agent. GSD treats Codex as maxDepth 1 and Copilot as non-nested, so JBIT's flows must degrade to a flat orchestrator-plus-leaves shape on both hosts. That needs designing, not just converting.

## 3. Adapting Claude-specific skill and agent text

**Answer.** GSD uses both regex substitution and an added mapping section.

- **Substitutions (Codex, `convertClaudeToCodexMarkdown` L2217):**
  - `/gsd:x` and `/gsd-x` become `$gsd-x`, using a boundary-defined regex so path segments are left alone (#712).
  - `$ARGUMENTS` becomes `{{GSD_ARGS}}`.
  - `/clear` lines are deleted, because Codex has no equivalent.
  - `~/.claude`, `$HOME/.claude`, `./.claude` and bare `.claude/` become `.codex`. `.claudeignore` becomes `.codexignore`.
  - Bare `gsd-tools` becomes `node "$HOME/.codex/gsd-core/bin/gsd-tools.cjs"`.
  - `<runtime_note runtime="x">` blocks meant for other hosts are filtered out (L2290 onward, `filterRuntimeNotesForTarget`).
  - `neutralizeAgentReferences` (L2465) replaces bare "Claude" with "the agent", keeping "Claude Code", "Claude Opus" and similar, and replaces `CLAUDE.md` with `AGENTS.md`.
- **Substitutions (Copilot, `convertClaudeToCopilotContent` L385):**
  - `~/.claude` becomes `~/.copilot` (global) or `.github/` (local).
  - `gsd:` becomes `gsd-`.
  - `CLAUDE.md` becomes `copilot-instructions.md` through `neutralizeAgentReferences`.
  - Skill bodies otherwise pass through unchanged. The comment says "Skills keep original tool names (no mapping)" (L410–414).
- **Added mapping section (Codex only).** Every Codex SKILL.md gets a `<codex_skill_adapter>` block prepended (`getCodexSkillAdapterHeader` L2251–2379). It contains:
  - Section A: invocation via `$skill`, and arguments.
  - Section B: `AskUserQuestion` to `request_user_input`, with a TEXT_MODE fallback that must stop and wait rather than pick defaults (#3018).
  - Section C: `Task()`/`Agent()` to `spawn_agent(agent_type, message)`. The model must probe the `spawn_agent` schema first (`agent_type`, `model`, `reasoning_effort`, `fork_context` and others are detected independently). It covers the `collaboration.wait_agent` loop semantics (a mailbox wakeup is not completion), a generic-agent workaround when `agent_type` is missing (it reads `agents/<name>.toml` and injects that as a preamble, labelled as degraded, citing openai/codex#15250), the spawn restriction (Codex spawns only when the user asked for sub-agents, otherwise the work is done inline), and `close_agent` gated on the tool being visible.
- **Agents.**
  - Codex (`convertClaudeAgentToCodexAgent` L3381): frontmatter is reduced to name and description, and a `<codex_agent_role>` header (role, tools, purpose) is prepended. `generateCodexAgentToml` (`bin/install.js` L4348) also emits `agents/<name>.toml` with `developer_instructions` set to the body, `sandbox_mode` derived from the declared tools (`read-only` or `workspace-write`), and an optional `model` and `model_reasoning_effort`.
  - Copilot (`convertClaudeAgentToCopilotAgent` L2948): produces `<name>.agent.md` with `tools: ['read','edit',…]` mapped through `claudeToCopilotTools` (L2845): Read→read, Write/Edit→edit, Bash→execute, Grep/Glob→search, Task→agent, WebSearch/WebFetch→web, TodoWrite→todo, AskUserQuestion→ask_user, SlashCommand→skill. Unknown tools are lowercased, `mcp__context7__*` becomes `io.github.upstash/context7/*`, and the description is always YAML-quoted (#2876, because a leading `[` crashed Copilot's loader).
- **Models.** `bakesStaticAgentModel: true` means Codex's model is written into the agent `.toml` at install time. Editing the model config afterwards has no effect until reinstall. `gsd-core/bin/lib/stale-bake-guard.cjs` (L1–60) compares mtimes and warns on stderr. Later fixes moved Codex to **inherit the session model by default** rather than pinning one per tier (CHANGELOG L1198). They also added stripping of `claude-*` and tier-alias pins, which Codex rejects with a 400 (L1149–1150), and passing `model` and `reasoning_effort` inline on `spawn_agent` when the schema advertises them (L943).

**Confidence.** High.

**What it changes for JBIT.**
- JBIT skills lean on `Agent`/`Task`, `AskUserQuestion`, `/jbit:*` names, `CLAUDE.md`, and Claude model names (`subagent-model-effort.md`). JBIT needs a short per-host adapter preamble (for Codex: spawn_agent with schema probing, wait_agent, the inline fallback, request_user_input) plus a handful of tested substitutions: command syntax, `CLAUDE.md`→`AGENTS.md`, config paths, and arguments.
- Do not pin Claude model IDs on other hosts. Default to inheriting the session model.
- Copilot agent `tools:` lists need the tool-name map.
- Neutralizing the word "Claude" by regex is fragile. Prefer writing host-neutral prose in the source where that is cheap.

## 4. Hooks

**Answer.**
- **Claude:** the full set from `settings.json`. Several hooks enforce, by denying the call or exiting 2: `gsd-write-guard`, `gsd-read-guard`, `gsd-secret-read-guard`, `gsd-worktree-path-guard`, `gsd-workflow-guard`, `gsd-agent-isolation-guard`, `gsd-read-injection-scanner`. The list is in `hooks/managed-hooks-registry.cjs`.
- **Codex:** only **one** hook. It is a `SessionStart` entry in `<CODEX_HOME>/hooks.json` that runs `gsd-check-update.js`, an update check that is advisory only (`src/runtime-hooks-surface.cts` L1446; `bin/install.js` L1508–1535). Only `CODEX_HOOKS_TO_COPY = ['gsd-check-update.js','gsd-check-update-worker.js','managed-hooks-registry.cjs']` is staged (`bin/install.js` L474).
  - Config shape: hooks.json, either `{ "SessionStart": [...] }` or `{ "hooks": { "SessionStart": [...] } }`. Entries have `command` and `commandWindows`, the latter being a `.cmd` shim on Windows (#3426, #772). The installer also sets `[features] hooks = true` in `config.toml`, migrating the legacy `codex_hooks` key (L176–189). It writes `[agents] max_depth = 1` as well.
  - `CODEX_EXTENDED_HOOK_EVENTS` (L164: SubagentStart, Stop, PostToolUse, PreToolUse, PermissionRequest, PreCompact, PostCompact, SubagentStop, UserPromptSubmit) used to route to `gsd-context-monitor.js`. That registration was **removed** (#2586) because the monitor needs a bridge file that only the Claude statusline writes, so every registered event was a silent no-op. The list now only drives cleanup (L8970).
  - **No Codex hook enforces anything.**
- **Copilot:** one GSD-owned file, `<.github|~/.copilot>/hooks/gsd-session.json`, shaped as `{ version: 1, hooks: { sessionStart, preToolUse, postToolUse, userPromptSubmitted, sessionEnd } }`. Each entry is `{ type: "command", bash, powershell, timeoutSec: 10 }` (`src/runtime-hooks-surface.cts` L2752–2810). Every hook is an **inline printf** of a fixed `{"additionalContext": "..."}` advisory, for example "GSD: confirm this tool use is in scope for the active phase before proceeding." (L102–133). No script is installed. The descriptor sets `skipSharedHooksInstall`, and the hooks are deliberately static so the output stays golden-trackable. **Nothing denies.**
- **Enforcement elsewhere:** only Windsurf (exit 2: `gsd-windsurf-pre-write.js`, `gsd-windsurf-pre-command.js`; `bin/install.js` L383–392) and Cursor get blocking guards. Each has its own per-host wrapper scripts, for example `hooks/gsd-cursor-pre-tool.js`, which reads JSON on stdin, writes JSON on stdout, and fails open.
- **Portability techniques:**
  - Shared Node scripts read the stdin JSON, branch on `hook_event_name` (Claude PostToolUse versus Gemini AfterTool; `hooks/gsd-context-monitor.js` L113, L535–555), and resolve sibling paths relative to the hook directory rather than `~/.claude` (L488).
  - At copy time, `'.claude'` literals are rewritten to the host's config dir (`bin/install.js` around L13530).
  - A `{"type":"commonjs"}` marker is written so the hooks load under an ESM root (CHANGELOG L1621).
  - The `hooks/lib/` helpers are staged transitively from actual `require()` calls, because a missing helper killed the hook at load (#4087/#4098, CHANGELOG L922).
  - Every hook must declare its crash policy, `HOOK_ON_CRASH.ALLOW` or `HOOK_ON_CRASH.DENY`, with no default (`hooks/lib/hook-exit.js` L1–40).

**Confidence.** High for what GSD installs. The capabilities of Codex and Copilot hooks themselves (whether PreToolUse can deny) were **not** verified here. GSD's choices only show that GSD did not use them.

**What it changes for JBIT.** JBIT's hook (`plugins/jbit/hooks/register.ts`, a Claude hook *module*) carries the plan state and enforcement: it blocks outward commands under autopilot, holds risky stages, and blocks secret commits. GSD offers **no precedent for porting enforcement** to Codex or Copilot. It ships nothing, or static advice. JBIT therefore has three options for those hosts:
- (a) Verify from the official docs whether the Codex `PreToolUse`/`PermissionRequest` and Copilot `preToolUse` hooks can deny, and write small stdin/stdout JSON adapters over JBIT's pure logic (`shell.ts`, `secrets.ts`, `project.ts`).
- (b) Declare those guards as `unsupportedFeatures` and say so to the user.
- (c) Move what can move into skill text.

Never register a hook that silently no-ops, which was GSD's #2586 lesson. Give every guard an explicit fail-open or fail-closed policy.

## 5. Testing parity and guarding against drift

**Answer.** Examples in `tests/` (1,238 files):
- **Golden install snapshots:** `golden-install-tree.test.cjs` (the sorted list of emitted paths for each host) together with a content-hash parity harness. `golden-parity-single-source.test.cjs` exists because the generator's copy and the test's copy of the manifest builder drifted and shipped broken fixtures three times (#2086, #2095, #2100).
- **Host-contract tests:**
  - `context-monitor-host-contract.test.cjs`: a host must not have a hook registered whose input producer is absent (#4840, generalizing #2586).
  - `declarative-reference-copilot.test.cjs` and `codex-declarative-reference.test.cjs` assert, by grepping the source, that no `runtime === 'copilot'` or `'codex'` branch remains.
  - `copilot-install.test.cjs`, `copilot-upgrades.test.cjs`, `codex-agent-toml.test.cjs`, `codex-config-hooks.test.cjs`.
- **Descriptor and registry sync:** `capability-matrix-sync.test.cjs` (the generated matrix doc must match the registry), `host-integration-descriptors.test.cjs`, `host-integration-validator-parity.test.cjs`, and the ESLint rule `no-runtime-name-literal` (`eslint-no-runtime-name-literal.test.cjs`).
- **Parity of names and tools:** `advertised-command-parity.test.cjs`, `agent-descriptor-parity.install.test.cjs`, `context7-tool-name-parity.test.cjs`, `docs-hooks-table-parity.test.cjs`.

**Confidence.** High for what exists. Not run.

**What it changes for JBIT.** Add a cheap version of the same thing:
- Golden snapshots of the emitted Codex and Copilot trees, regenerated by one script and checked in CI so a Claude-source edit that changes output is visible.
- A leak lint over emitted files that fails on `~/.claude`, `CLAUDE.md`, `/jbit:`, `Agent(`, `AskUserQuestion` or Claude model IDs outside the adapter preamble.
- A contract test that every hook registered on a host has its inputs present.

Extend `docs.check.mjs` or add a sibling test.

## 6. Lessons and pitfalls (Codex and Copilot)

From `CHANGELOG.md` (active repo):
- **Dead hooks.** The Codex context-monitor was registered on 9 events but could never fire, and nothing reported it (L650, #2586). An earlier version also shipped without its `lib/` helper and crashed on load on every event (L922, #4087).
- **Silent model failures.** Baked Codex `.toml` model pins went stale after a config edit (stale-bake guard, L1646). `claude-*` or tier-alias pins made Codex return 400, so agents never spawned (L1149). An empty `model` passed to spawn calls caused 404s on non-Claude hosts across 43 dispatch sites (L1588). The fix was to inherit the session model by default (L1198).
- **Path rewrites leaking.** Codex agents kept `@~/.claude/gsd-core/` includes and read the Claude copy on machines with both hosts (L553). Nested or unusual config dirs broke multi-pass `~/.claude` rewriting (L108). Hashing the manifest before the include rewrite produced phantom "local patches" on every reinstall (L36).
- **User-config clobbering.** Updating Codex `config.toml` deleted user keys after the GSD block (L1430), and a top-level key under the marker broke the `[agents]` table (L1026). Symlinked `config.toml`, `AGENTS.md` and `copilot-instructions.md` files were replaced or unlinked (L28, L246).
- **Codex skills location.** The global root is `$HOME/.agents/skills`, not `$CODEX_HOME/skills`. Getting this wrong produced duplicate skill trees (L1445), and `--local` wrongly wrote to the global root (L1567).
- **Codex subagent vocabulary drift.** The adapter documented an obsolete `wait(ids)` and an ungated `close_agent` (L1454). A foreground handoff lost a human checkpoint until the adapter said to wait for a terminal result (L560, #4695). Typed dispatch is missing on some schemas (openai/codex#15250).
- **Copilot frontmatter.** An unquoted description starting with `[` crashed the loader (#2876). Block-list `tools:` was mangled to `['- read']` (L136, #5790).
- **Runtime identity.** Inside Codex, GSD reported `agent_runtime: claude` and checked the wrong directories (L1207). The machine-wide `runtime` default poisoned projects on machines with two hosts (L1468).

**Confidence.** High that these are recorded. Line numbers refer to `CHANGELOG.md` at `530e767`.

**What it changes for JBIT.**
- Generate rather than merge where possible: ship plugin or skill directories, and do not edit the user's `config.toml` or `AGENTS.md` in place. If a merge is unavoidable, use a marked block and preserve everything outside it.
- Detect the host at runtime from the host's own signals, not from a global default.
- Quote all emitted YAML.
- Test the emitted trees, not only the converters.
- Expect host CLIs' subagent APIs to churn. Keep the adapter preamble in one file with a dated source note.

## Text in the sources that addresses an agent (reported, not followed)

- `[archived] AGENTS.md` opens with "Repository Guidelines" aimed at coding agents: it points to a Grok Build discussion doc and states Node ≥22 and the build and test commands. The active repo has `GEMINI.md` and `CONTEXT.md`, which were not opened.
- The Codex adapter header and the Copilot hook messages are instructions written for the *host model at runtime*, for example "GSD: confirm this tool use is in scope…" and "Do NOT pick a default and continue". They were read as data about GSD's design.
- Nothing directed at this research agent was found. Nothing was run or followed.
