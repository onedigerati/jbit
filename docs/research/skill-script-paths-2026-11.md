# Skill to bundled script: how each host lets a skill name its own script (research, 2026-11-23)

Scope: a JBIT skill whose instructions tell the model to run a script shipped inside the plugin (for example `scripts/capture.mjs`), on Claude Code, GitHub Copilot CLI and OpenAI Codex CLI. Builds on [copilot-cli-2026-11.md](copilot-cli-2026-11.md), [copilot-spike-2026-11.md](copilot-spike-2026-11.md), [codex-cli-2026-11.md](codex-cli-2026-11.md) and [codex-spike-2026-11.md](codex-spike-2026-11.md), which cover plugin roots for hooks and are not repeated here. The spike evidence those notes cite now lives under `docs/plans/2026-11-20-copilot-codex-hosts/evidence/`.

No page read contained instructions aimed at an AI agent.

---

## Question

How can a plugin skill's instructions point the model at a script shipped in the plugin, on each host? Is a plugin-root environment variable visible to the model's own shell commands, or only to hooks?

## Answer

**Claude Code: deterministic substitution. Use it.**
- Skill bodies get string substitution before the model sees them. `${CLAUDE_SKILL_DIR}` is the skill's own folder (for a plugin skill, `skills/<name>/`, not the plugin root). `${CLAUDE_PLUGIN_ROOT}` is the plugin's installed root and `${CLAUDE_PLUGIN_DATA}` its persistent data dir (survives updates). The last two are "substituted only in plugin skills".
- Substitution happens in the markdown body and in Bash rules in `allowed-tools`. So `allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/capture.mjs *)` matches the exact command the body tells the model to run, and it runs without a prompt.
- **The model's shell does not get the env var.** The plugins reference says: "The variables aren't present in the environment of commands Claude runs through the Bash tool, in the main session or in a subagent. In skill, command, and agent content, write the `${...}` reference in the Markdown body instead." Hooks, stdio MCP and LSP processes do get `CLAUDE_PLUGIN_ROOT` exported. Writing `$CLAUDE_PLUGIN_ROOT` and hoping the shell expands it fails. Writing `${CLAUDE_PLUGIN_ROOT}` works only because Claude Code replaces the text first.
- Another option: files in the plugin's `bin/` are on the Bash tool's `PATH` while the plugin is enabled. But claude.ai and Cowork refuse to install a plugin that has a top-level `bin/`.
- The docs read don't describe a "Base directory for this skill" line. The substitution is the documented mechanism.

**Codex CLI: no substitution. The model resolves relative paths against the listed SKILL.md path.**
- The skills catalog in the system prompt lists each skill's path, a short path plus a `### Skill roots` alias. Its fixed usage rules (source, `codex-rs/ext/skills/src/catalog_prompt.rs`) say: "When `SKILL.md` references relative paths (e.g., `scripts/foo.py`), resolve them relative to the directory containing that expanded `SKILL.md` first", and "If `scripts/` exist, prefer running or patching them".
- An explicit `$jbit:<name>` injects `<skill><name>…</name><path>/abs/…/plugins/cache/<mkt>/jbit/<ver>/skills/<name>/SKILL.md</path>` (stage-5 spike, `evidence/stage-5/skills/06-dollar-namespaced.txt`). So the model holds an absolute path.
- `PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT` are documented and proven for hook commands only. Nothing in the docs or the source search shows them in the model's shell environment. Treat them as absent.
- `${CLAUDE_PLUGIN_ROOT}` in a Codex skill body stays literal text.

**Copilot CLI: no documented substitution. "This skill's base directory" is the documented idiom.**
- The CLI skills page says that when a skill is invoked, Copilot "automatically discovers all of the files in the skill's directory". Its example tells the agent to run `convert-svg-to-png.sh` "from this skill's base directory". No `${…}` variables are documented for skill bodies.
- Copilot records the absolute SKILL.md path in the `skill.invoked` event (`path: …/plugins/jbit-copilot/skills/autopilot/SKILL.md`, stage-4 evidence). The `skill` tool's result text is only "Skill "x" loaded successfully. Follow the instructions in the skill context." Whether the injected skill context shows the model that path was **not observed**. The docs example implies it does.
- `PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT` were proven in hook processes only (stage-1 `hooks/04`). The model's `bash` tool was not probed.

**Portable pattern (all three):**
1. Ship the script inside the skill folder (`skills/<name>/scripts/capture.mjs`), not at the plugin root. That folder is the one location every host gives the model a handle on.
2. Make the script self-locating (`import.meta.url`/`fileURLToPath`), with every input as an argument. Never depend on the cwd.
3. In the Claude source, write `node "${CLAUDE_SKILL_DIR}/scripts/capture.mjs" …` and pair it with an `allowed-tools` Bash rule. In the generated Copilot and Codex skills, have `hosts/build.mjs` rewrite `${CLAUDE_SKILL_DIR}/` to `scripts/…`, with one sentence: "paths are relative to the folder holding this SKILL.md". On Codex this matches the system-prompt rule. On Copilot it matches the documented idiom.

## Sources

- Claude Code, Skills ("Available string substitutions", "Inject dynamic context", "Generate visual output"): https://code.claude.com/docs/en/skills (read 2026-11-23)
- Claude Code, Plugin manifest reference ("Environment variables", "Where each variable resolves", "Standard layout" `bin/`): https://code.claude.com/docs/en/plugins-reference (read 2026-11-23)
- Copilot CLI, Add skills: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills (read 2026-11-23)
- Codex, Build skills (redirected from https://developers.openai.com/codex/skills): https://learn.chatgpt.com/docs/build-skills and `.md` variant (read 2026-11-23)
- Source: `openai/codex` `codex-rs/ext/skills/src/catalog_prompt.rs` and `render_tests.rs`, via `gh search code` (read 2026-11-23)
- Secondary, unverified: blog comparing skill path resolution across CLIs, https://luzhongqiu.github.io/2026/02/25/agent-skill-path-resolution-across-cli (read 2026-11-23). It agrees on Codex. It says Claude Code injects a base-directory line, which the docs read don't confirm.
- Local spike evidence (2026-11-20): `docs/plans/2026-11-20-copilot-codex-hosts/evidence/stage-5/skills/06-dollar-namespaced.txt`, `…/stage-4/07-autopilot-carry.events.txt`, `…/stage-1/hooks/04-env-baseline-and-shell-probe.txt`

## Confidence

- **Claude Code: high.** Documented in two pages, with the Bash-env exclusion stated outright.
- **Codex: high** that relative paths resolve against the SKILL.md directory (fixed system-prompt text plus the observed absolute path). **Medium** that the env var is absent from the model's shell (absence of evidence).
- **Copilot: medium-low.** Documented idiom only. That the model sees the skill path is not observed, and the model's shell env was not probed.

## What it changes for a plan that ships a capture script

- Put the script under the skill that uses it (for example `skills/verify/scripts/capture.mjs`). If two skills need it, keep one copy and accept a `${CLAUDE_PLUGIN_ROOT}` path on Claude. The build then has to rewrite that path to something the other hosts can resolve, which is harder.
- `hosts/build.mjs` needs a rewrite rule for `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PLUGIN_ROOT}` in generated skills, plus a docs-check test that no `${CLAUDE_` survives in the Copilot and Codex packages.
- Add an `allowed-tools` Bash rule on Claude so the capture runs without a prompt.
- The plan needs one observable check per host: a headless run where the model runs the script from a project whose cwd is not the plugin. Copilot is the one to prove first (the unknown above). If its model can't find the path, the fallback is a build-time absolute path. That doesn't work for a marketplace install. The other fallback is for the skill to have the model locate the file (`find ~/.copilot -path '*jbit*/scripts/capture.mjs'`), which is ugly but works.
