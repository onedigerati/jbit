# Stage 3 review: Antigravity end to end

2026-11-25 · fresh-eyes review (`jbit:review`, security pass included) of `git diff c313447` plus the untracked `docs/evidence/stage-3/`. The reviewer built none of it. It ran as one agent, the reviewer the PM spawned, rather than the two `wide` asks for, because the brief came to an agent that was already fresh.

Method: read the diff and the code around it (`hosts/antigravity/map.mjs`, `handler.mjs`, core `dispatch.mjs`, `register.ts` compose, `capture.mjs` argument handling). Probed the generated hook (`plugins/jbit-antigravity/scripts/hook.mjs PreToolUse`) installed under a fake `HOME/.gemini/config/plugins/jbit`, with a scratch git project as cwd. The host and build tests ran green (`node --test hosts/antigravity/hook.test.mjs hosts/build.test.mjs`: 101 pass, 0 fail). No live `agy` was run.

Counts: fix now 3 · defer 2 · reject 4

## Fix now

1. **The home guard misses `.gemini/./config` and `antigravity-cli/./settings.json`** (`hosts/antigravity/map.mjs:94-104`, `shellNames`). The regexes need `.gemini/+config`, so a `/./` segment hides a name the command still spells out. Then `names.test` fails, and `writesProtected` returns false at line 261 before any write check runs. Probed:
   - `echo x > ~/.gemini/./config/x` → `{"decision":"allow"}`
   - `cp e.json ~/.gemini/./config/mcp_config.json` → allow
   - `touch ~/.gemini/antigravity-cli/./settings.json` → allow
   - `ln -s ~/.gemini/./config l && node <capture> shot … --out l/` → allow. The new list split lets this through in one command, since the capture part's `--out l/` is resolved before `ln` runs.

   This was already in `shellNames` at c313447, but the stage changes the guard, and its check and README line say the guard refuses shell commands "that name them". This command names them. Fix: run `names` against a copy of the command with `/./` segments (`/(?:\.\/)+/g` → `/`) and repeated slashes collapsed, as well as against the raw text. Add the four inputs above to the deny list in `hook.test.mjs`. Globs (`~/.gemin[i]/config`, also allowed) stay under the documented best-effort gap. Name them in the `home-guard` gap text.

2. **`isNode` trusts any absolute path ending in `/node`, a file in the project included** (`map.mjs:211-216`). Before this stage, the capture exemption needed the literal word `node`. Now `cp /bin/sh node && <project>/node ~/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs shot http://x/ --out docs/e/` → `{"decision":"allow"}` (probed), as does the second command alone once a fake `node` exists. That "node" is any script the model wrote. It gets the plugin's own path in `$1` and can overwrite `hooks.json` beside it, all from a command that spells out the protected path. The guard is best-effort against scripts that don't name the path, but this is one that names it and gets an exemption it didn't have before. Fix: also refuse a binary whose real path lies inside the project or cwd, or under any folder the hook treats as writable, or keep a short allowlist instead: `process.execPath`'s real path, plus `~/.nvm/versions/node/*/bin/node`, `/usr/bin/node`, `/usr/local/bin/node`, `/opt/homebrew/bin/node`. Test the project-local `node` as a deny.

3. **The README's allow rules are broader than the stage needs** (`README.md:165`). The README recommends `command(node)` and `command(git)`, and suggests saving them in `~/.gemini/antigravity-cli/settings.json` for every project.
   - `command(node)` pre-approves every `node …` command, including `node -e '<anything>'`, and per the headless research (`antigravity-headless-2026-11.md:81`) an allowed command runs outside agy's sandbox.
   - `command(git)` lets `git push` (and `git push --force`, `git remote set-url`) run unprompted. JBIT's outward block holds only while autopilot runs (`register.ts:1458`), so a plain `/jbit:stage` session can push with no prompt from agy or JBIT. That breaks the plan's own rule that pushing waits for the user.

   Fix: keep the line that was proven live, but add a warning and a narrower form, for example `command(regex:node "?[^ ]*/skills/verify/scripts/capture\.mjs( .*)?)` and `command(regex:git (status|diff|log|add|commit|show|rev-parse)( .*)?)`. Advise keeping the rules per run (`--settings`), not in the global settings file. Say plainly that with `command(git)`, push is not held outside autopilot. If the narrower rules aren't proven live, mark them as unproven.

## Defer (to the plan's open questions)

- **The list split resolves capture arguments before earlier parts of the same list run.** A symlink made earlier in the list (`ln -s X l && <capture> --out l/`) isn't followed when the hook checks the later part. Today this can only reach a protected path through a spelling that already evades `shellNames` (fix-now 1), so closing 1 closes it. If the names check ever gets weaker again, make the list exemption refuse a part that runs `ln`, `mv` or `cp` before a capture part.
- **The handler and core spot a composed section by different tests.** `handler.mjs:277` uses `startsWith('# JBIT')`, while `dispatch.mjs:172` uses `includes('# JBIT\n')`. They agree today, since every compose section and the armed entry fit both. A future submit entry that starts with `# JBIT` without a newline would be dropped by the swap. Share one predicate.

## Reject

- **A prompt forging an approval through the re-compose.** The re-compose only reads state that the prompt's submit handlers already set from `lastUserInput` on `invocationNum === 0`. A subagent's `lastUserInput` is empty (spike, `antigravity-spike-2026-11.md:44`), and the swap adds no path that writes an approval.
- **The swap injecting twice or dropping the plan text.** Every `prompt.compose` section is a `# JBIT` section (`register.ts:2405,2415`), so the filter removes the stale one and `fresh.context` adds exactly one. Repeated notices are filtered out. The compose read path (`sync`, `userModels`) has no one-shot state that a second run would lose.
- **List parsing tricks.** `$(…)`, backticks, a single `|` or `&`, `>`, here-docs, `<(…)`, `#`, `\`, `{}` and globs all make `plainWords` return null, so the list is refused and the command falls back to the existing checks. `cd`/`export`/`env`/`A=b` are refused by `SETS_UP` or the assignment regex. A path that only contains `skills/verify/scripts/capture.mjs` fails the exact `root + CAPTURE` match. `..` is refused, and so are a `node` inside config and `--out` or `--out=` into config. All were probed or are covered by the new tests. `--name` is limited to `[\w.-]` in `capture.mjs:270`.
- **capability.json substitutions leaking.** Each of the three new `from` strings occurs only in `plugins/jbit/skills/verify/SKILL.md`, and the build fails on a substitution that matches nothing. No other generated skill mentions the host's browser tools, apart from the shared "Script paths" placeholder line.

Evidence hygiene: `docs/evidence/stage-3/` holds no token, real email (only `test@example.invalid`) or home path (`<scratchpad>` and `$HOME` are redacted).
