# Stage 1 spike: skills, tree install, includes (agy 1.5.17, 2026-11-25)

## 1. `${...}` substitution in skills

- **Nothing is substituted, in either form.** `${PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_SKILL_DIR}`, `${SKILL_DIR}`, `${PLUGIN_DATA}`, `$ARGUMENTS`, `${ARGUMENTS}`, `$PLUGIN_ROOT`, `${SKILL_PATH}`, `${extensionPath}`, `${workspacePath}` and `$1` all reach the model literally.
  - Slash form `/varprobe:vars alpha beta`: the host puts the body (frontmatter stripped) into `<SKILL>` in the USER_INPUT step with every variable literal. The arguments stay in `<USER_REQUEST>` only and are not put into `$ARGUMENTS` (02-run1.txt).
  - Description form: the model calls `read_file` on the installed SKILL.md and gets the raw file, literal too (03-run2.txt).
- **No variable gives the skill folder, but the model already knows the path.** The slash expansion holds the body only, with no path. Still, the model gave `SKILLDIR=$SCRATCH/agy/home-skills/.gemini/config/plugins/varprobe/skills/vars` with no tool call, so the skill listing in its system context includes the SKILL.md path (04-run3.txt). In the description form it went straight to `read_file` on that absolute path (03-run2.txt).
- **Skill-relative scripts work if the text says so.** "Run `scripts/marker.sh` that sits in this skill's folder" led to `run_command` `sh <abs>/skills/runner/scripts/marker.sh`. The cwd stays the workspace (05-run4.txt). So the JBIT capture script can be written as "`scripts/<x>` in this skill's folder", with no variable.
- **The run_command environment has no `PLUGIN_ROOT`, `PLUGIN_DATA` or `SKILL_*`.** It does have `ANTIGRAVITY_*` (06-run-command-env.txt, variable names only).

## 2. GitHub `tree/` install

- **It works with a branch ref.** `agy plugin install https://github.com/anthropics/claude-plugins-official/tree/main/plugins/example-plugin` cloned the repo (to `/tmp/plugin-install-<n>`, removed afterwards) and installed only that subfolder (07-tree-install.txt).
- **A commit SHA as `<ref>` fails.** agy runs `git clone --branch <ref>`, so it says "Remote branch … not found" (10-tree-sha-ref.txt).
- **It was converted from Claude Code format.** `config/import_manifest.json` records `"source": "claude-code"`, and `agy plugin list` shows `Source: claude-code` (08-tree-landed.txt).
  - A native `plugin.json` was generated, and `.claude-plugin/` was kept.
  - `.mcp.json` became `mcp_config.json` (`url` became `serverUrl`, and `type` was dropped).
  - `commands/example-command.md` became the skill `example-plugin-cmd-example-command`. `argument-hint` and `allowed-tools` were dropped, and `$ARGUMENTS` was left literal (09-tree-conversion.txt).
  - The plugin's own `skills/example-command` was also installed, so the old command now exists twice as skills.

## 3. `@path` includes and instruction files

- **`@CLAUDE.md` and `@./CLAUDE.md` in AGENTS.md are not inlined.** The host rewrites them to `@<absolute path>/CLAUDE.md`, and the model saw only that line. The codeword was NONE, with no tool calls (01-at.txt, 02-atdot.txt). The CLAUDE.md codeword appears nowhere in the home (07-transcript-has-no-rules.txt).
- **`@[claude rules](CLAUDE.md)` is inlined.** CLAUDE.md's content replaced the line in the rules the model saw, and the codeword was found (03-atlink.txt).
- **Without includes, agy reads AGENTS.md and GEMINI.md but not CLAUDE.md** (06-agents.txt, 05-gemini.txt, 04-claude.txt).
- **Limit on the ground truth.** The system prompt and rules are not stored in `transcript*.jsonl`, which holds only USER_INPUT and model steps. For rules, the ground truth is the model's verbatim quote under "do not run any tools", backed by a tool-call count of 0 (07-transcript-has-no-rules.txt).
