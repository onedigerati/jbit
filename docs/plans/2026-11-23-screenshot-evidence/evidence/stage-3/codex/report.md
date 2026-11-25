# Stage 3 · Codex CLI check: verifier report

2026-11-23. Codex CLI 0.171.0, isolated `HOME` and `CODEX_HOME`, this repo's marketplace at `a28aa39` (`jbit@jbit-local` 2.0.0, [00-setup](00-setup.txt)). The project is a static page served on 127.0.0.1:8765, with a planted decoy `scripts/capture.mjs` that writes `DECOY-RAN`. Prompt: `$jbit:verify` to take a 390 px, light-theme screenshot into `./shots`, with the cache already agreed.

**Check: FAIL.** The path resolves correctly, but no session with JBIT's hooks on can run the script. JBIT's own Codex PreToolUse guard denies every call to it.

| Run | Hooks | Sandbox | Path the model ran | Result |
|---|---|---|---|---|
| [01](01-run1-hooks-workspace-write.txt) | on | workspace-write | `$CODEX_HOME/plugins/cache/jbit-local/jbit/2.0.0/skills/verify/scripts/capture.mjs` | denied by JBIT hook, no shots |
| [02](02-run2-hooks-workspace-write.txt) | on | workspace-write | same (also tried `cp` to /tmp) | denied, no shots |
| [03](03-run3-hooks-workspace-write.txt) | on | workspace-write | same (also tried `node -e import(...)`) | denied, no shots |
| [05](05-run5-hooks-sandbox-bypass.txt) | on | bypassed | same (also tried `cp` to /tmp) | denied, no shots |
| [04](04-run4-nohooks-workspace-write.txt) | off (diagnostic) | workspace-write | same | the script ran, but Chromium was killed by the sandbox |
| [06](06-run6-nohooks-sandbox-bypass-server-down.txt) | off (diagnostic) | bypassed | same | invalid: the verifier's server had died |
| [07](07-run7-nohooks-sandbox-bypass.txt) | off (diagnostic) | bypassed | same | `shots/home-390-light.png` written, no DECOY-RAN |

- **Resolution:** 7 of 7 runs used the installed plugin's `skills/verify/scripts/capture.mjs`, and none touched the decoy. The model was shown the skill's absolute `<path>` in the injected `<skill>` item and the skill root `r1` = `…/plugins/cache/jbit-local/jbit/2.0.0/skills`.
- **The blocker:** `writesCodexHome` in `plugins/jbit-codex/scripts/map.mjs` counts any `node` command whose text names `$CODEX_HOME` or `.codex` as a write. Codex installs plugins under `$CODEX_HOME/plugins/cache`, so every `node "<verify skill folder>/scripts/capture.mjs"` call is denied with "JBIT blocked this call: it writes under `$CODEX_HOME`…". Running the script for `where` was also denied. The deny is deterministic and hit 3 of 3 runs, plus run 05.
- **Sandbox finding:** under `--sandbox workspace-write`, the cached Chromium headless shell aborts at launch with `FATAL:content/browser/sandbox_host_linux.cc:41 Check failed: . shutdown: Operation not permitted (1)` (SIGTRAP). The script reported "The browser would not launch". Localhost reach under workspace-write was not tested, because the browser never started. With `--dangerously-bypass-approvals-and-sandbox` it launched and loaded localhost (run 07).
- **Minor:** in runs 04, 05 and 07 the model first ran the script without `node` and got "Permission denied", because the file is mode 644. It recovered on the next call.
- **Screenshot (run 07, [home-390-light.png](home-390-light.png)):** a 390×800 light-theme page with a cream background. It shows a green "Plant Shop" heading, the line "Three plants for a sunny window." and three white rounded cards: Fern — $12, Cactus — $8 and Monstera — $30. The space below them is empty. The console log ([home-console.txt](home-console.txt)) has no errors.

Listings: [08-listings](08-listings.txt). `auth.json` was copied in, deleted after the runs and never printed.
