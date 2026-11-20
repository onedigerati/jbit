# Copilot CLI spike — 2026-11-20

What a throwaway plugin showed on GitHub Copilot CLI 1.0.114 (npm `@github/copilot`), run headlessly from the scratchpad. The plugin was installed into an isolated `COPILOT_HOME`, with the user's `gh` login. It answers the "Open for the spike" list in [copilot-cli-2026-11.md](copilot-cli-2026-11.md). Every claim names its evidence under [docs/evidence/stage-1/](../evidence/stage-1/): `install/`, `hooks/` and `skills/`. Each file starts with the command that produced it.

Setup: 2 agents spent about 24 model calls, roughly 6 AI credits in all. The auto model on this account was MAI Code 2 Flash or GPT-6 Luna. `--model` rejected every Claude and Gemini id.

## Answers

**Install and sign-in.** `npm i -g @github/copilot` installed it. `copilot -p` answered with no separate login, because it picked up the existing `gh` login (`install/01`).

**9 · `COPILOT_HOME` isolation keeps the login.** A run in a fresh empty `COPILOT_HOME` answered, and the home was populated with its own config, plugins and sessions (`install/02`). Each test install can get its own home and still be signed in.

**2 · How a hook finds its script.** A plugin hook runs with its working directory at the installed plugin root, `$COPILOT_HOME/installed-plugins/_direct/plugin-<hash>`, not the project.
- Copilot sets `PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT`, `CLAUDE_PLUGIN_ROOT`, `COPILOT_HOOK_DIR`, `COPILOT_PLUGIN_DATA`, `CLAUDE_PLUGIN_DATA`, `COPILOT_PROJECT_DIR` and `CLAUDE_PROJECT_DIR`.
- `${PLUGIN_ROOT}` expands in a `bash` string, in `exec` args and in `env`. A plain relative path such as `node scripts/hook.mjs` works too.
- The project is known only from stdin `cwd` or `$COPILOT_PROJECT_DIR`.
- Installing copies the plugin, so an edit to the source needs a reinstall.
- Limit: the `${PLUGIN_ROOT}` and relative-path forms were proven on `sessionStart` probe entries, from a direct (`_direct`) install. The entries that ran the deny, block and context tests used an absolute scratchpad path. Stage 4 proves the `${PLUGIN_ROOT}` form on every event under a marketplace install.
- Evidence: `hooks/02`–`04`.

**3 · Plugin hooks under `-p`: yes.** Every event the spike logged fired with no trusted folder, no `--trust-folder` and no `GITHUB_COPILOT_PROMPT_MODE_REPO_HOOKS` (`hooks/03`–`05`, `skills/41`).

**8 · A `preToolUse` deny holds under `-p --allow-all-tools`.**
- Output `{"permissionDecision":"deny","permissionDecisionReason":"…"}` stopped `bash` and `apply_patch`, and the files stayed unchanged.
- The model sees `Denied by preToolUse hook: <reason>` and repeated the reason's codeword (`hooks/06`, `07`, `09`).
- With `apply_patch` excluded, the model fell back to writing through `bash` (`printf`, `sed`), which was also denied. The guard must cover both.

**4 · Tool argument shapes.**
- `bash`: `toolArgs` is `{command, description}`.
- `apply_patch`: `toolArgs` is a raw string, not an object: `*** Begin Patch` / `*** Add File: <path>` / `*** Update File: <path>` / … with paths relative to the project.
- `view`: `{path}`, absolute. `glob`: `{pattern, paths}`.
- `edit` and `create` never ran: neither model this account offers writes through them, even with `apply_patch` excluded (`hooks/08`, `10`, `14`, `15`). Their shapes are unproven here.

**7 · `agentStop` block-and-continue.**
- `{"decision":"block","reason":"…"}` makes the agent continue, with the reason arriving as a new user prompt.
- Stdin carries `stop_hook_active`, which is false on a prompt's first stop and true after that.
- The cap is 8 blocks per prompt, and the 9th is ignored (`hooks/12`).
- Under `--autopilot --max-autopilot-continues 2`, each autopilot continuation resets the budget to 8. Hook blocks don't count against the autopilot limit (`hooks/13`).
- `sessionEnd` (`reason: "complete"`) fires at the end of every prompt cycle, not once per process.

**1 · Context on every prompt: yes.**
- `userPromptTransformed` → `{"modifiedTransformedPrompt": …}` is honoured on every turn, including stop-block continuations and autopilot continuations (`hooks/03`, `12`, `13`). Run 13 shows 53 codeword echoes.
- `transformedPrompt` already wraps the prompt in `<current_datetime>` and system-reminder blocks, so the hook appends to it rather than replacing it.
- `sessionStart` `additionalContext` reaches the model once per process.
- `postToolUse` `additionalContext` reaches the model after each tool call.
- Unlike the docs say, `userPromptSubmitted`'s `modifiedPrompt` and `additionalContext` were not dropped.

**Stdin shapes.** Every event carries `sessionId`, `timestamp` (ms) and `cwd`, which is the project.

| Event | Fields |
|---|---|
| `preToolUse` | `{toolCallId, toolName, toolArgs}` |
| `postToolUse` | `{toolCallId, toolName, toolArgs, toolResult: {resultType, textResultForLlm}}` |
| `userPromptTransformed` | `{prompt, transformedPrompt}` |
| `agentStop` | `{transcriptPath, stopReason, stop_hook_active}` |
| `sessionStart` | `{source: "new"\|"resume", initialPrompt}` |

The working `hooks/hooks.json` and logging script are `hooks/16-spike-hooks.json` and `hooks/17-spike-hook.mjs`.

**6 · Skill names: keep them bare. This reverses the research note.**
- Copilot namespaces plugin skills itself, as `/<plugin>:<name>`. A plugin `jbit` with `name: plan` gives `/jbit:plan`, which ran the skill (`skills/36`–`39`).
- `name: jbit:plan` double-prefixes, to `/<plugin>:jbit:plan` (`skills/23`, `24`, `32`, `33`).
- The prefix followed the marketplace entry's name. Seen once, with entry `jbit-copilot` and `plugin.json` name `jbit`, which gave `jbit-copilot`.
- Built-ins keep their bare names when typed interactively: `/plan` switched to plan mode and `/review` ran the built-in review. `/resume` wasn't tried.
- Under `-p`, the CLI doesn't dispatch plugin commands; the text goes to the model, which calls the `skill` tool (`{"skill":"review"}`). That worked for `/jbit:plan`, `/jbit:review`, `/jbit:autopilot` and plain words.
- The exception is a bare `/autopilot` under `-p`, which switched Copilot's own autopilot mode and got no reply (`skills/13`–`20`, `40`).

**5 · The `task` tool.**
- Captured args: `{"description", "prompt", "agent_type", "name", "mode": "background"|"sync", "model"}`, for example `"agent_type":"jbit-copilot:jbit-probe"` and `"mode":"background"` (`skills/25`, `41`, `42`).
- The model also listed optional `reasoning_effort` and `context_tier` (`skills/26`, self-reported, medium confidence).
- A plugin agent `agents/<name>.agent.md` registered as `jbit-copilot:jbit-probe`, taking its prefix from the marketplace entry's name like the skills, and a skill reached it by naming it. The install named `jbit` had no agent, so `jbit:<role>` is inferred, not seen.
- A background run returns an `agent_id`, which the model polls with `read_agent`.
- A per-call `model` the account doesn't offer fails with a 400 and is then retried without it.

**10 · Marketplace precedence: `.github/plugin/marketplace.json` wins.** With both files present, `copilot plugin marketplace add <local path>` read the `.github` file, and browse listed only its plugin. With that file removed, it fell back to `.claude-plugin/` (`skills/06`–`08`, `27`, `28`). `file://` URLs are rejected. GitHub `owner/repo` was not tried, since that needs a push. Direct local `plugin install <path>` prints a deprecation warning: only `plugin@marketplace` will be supported. A directory marketplace loads its plugins live from disk.

## What it changes for stages 2–4

**Stage 2 (hook core + Copilot adapter)**
- The adapter reads the project from stdin `cwd`, or from `COPILOT_PROJECT_DIR`, never from `process.cwd()`.
- `## Now` rides on `userPromptTransformed`, appended to `transformedPrompt` every turn including continuations. `sessionStart` and `postToolUse` aren't needed for it. The open question about per-prompt context is settled: yes.
- The guard parses `bash` `{command}` and the raw `apply_patch` string: `*** Add/Update/Delete File: <path>` lines and also `*** Move to: <path>`.
  - It resolves each path against the project root, normalising `..`, absolute paths and symlinks.
  - It denies a patch it can't parse.
  - It checks the type of `toolArgs` (a string for `apply_patch`, an object elsewhere), so a field it can't read never means allow.
- Any other tool whose args carry a path or a command, including MCP tools and a Windows `powershell`, is denied or at least logged. `capability.json` lists the tools the guard knows.
- Project directory: stdin `cwd` first, then `COPILOT_PROJECT_DIR`. With neither, the hook fails closed: it denies guarded tools and adds no context. Never the process's working directory, which is the plugin folder.
- The spike didn't show two things the guard relies on:
  - whether `preToolUse` fires for tool calls inside `task` subagents (only `subagentStart` was seen);
  - what Copilot does when a hook crashes, exits non-zero or times out.
  Stage 2 tests both with fixtures, and stage 4 proves them live: a deny inside a subagent, and a crashing hook.
- `edit` and `create` are guarded on the documented `{path, …}` shape, with fixture tests only. The spike couldn't make either one run, and the README says so.
- The autopilot continuation uses `agentStop` `{"decision":"block"}`. It gets 8 blocks per prompt. A plain `copilot -p` run is one prompt, so an unattended JBIT run there stops quietly at its 9th turn end. A long run needs Copilot's `--autopilot`, whose continuations reset the budget, or a README note to re-prompt. Stage 4 measures it.
- `sessionEnd` fires per prompt, so nothing should hang end-of-session work on it.

**Stage 3 (package)**
- The skills in the generated package keep bare names (`name: plan`), with no `jbit:` prefix.
- The `.github/plugin/marketplace.json` entry and `plugin.json` are both named `jbit`, while the package's folder stays `plugins/jbit-copilot/`. That gives `/jbit:plan` and agent ids `jbit:<role>`.
- Hook entries use `node "${PLUGIN_ROOT}/scripts/hook.mjs" <event>`.
- The generated mapping section tells the model to:
  - call a role agent through `task` with `agent_type: "jbit:<role>"`;
  - pass `model` only from the plan's Models line, knowing that an id the account lacks is retried without it.
- The README notes that typed `/plan`, `/review` and `/autopilot` are Copilot's own commands, so users should use `/jbit:…`.
- The `jbit:<role>` agent id is checked once the package installs, since the spike only saw the prefix follow the marketplace entry's name.

**Stage 4 (end to end)**
- Install through a marketplace, not a direct path: `copilot plugin marketplace add <repo path>`, then `copilot plugin install jbit@<marketplace>`.
- Each run gets its own `COPILOT_HOME`, which keeps the login.
- Test from a local path. `owner/repo` waits for the push.
- Expect MAI Code 2 Flash or GPT-6 Luna as the model. Checks shouldn't depend on Claude models through Copilot.
