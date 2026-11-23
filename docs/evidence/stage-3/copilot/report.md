# Stage 3 · Copilot CLI: installed capture script from an isolated install

2026-11-23. Verifier (built nothing). Copilot CLI 1.0.114, model auto → gpt-6-luna, repo HEAD a28aa39. Setup: [00-setup.txt](00-setup.txt), install: [01-install.txt](01-install.txt).

**Check:** from an isolated install of this repo's marketplace, a session resolves `<verify skill folder>` to the installed plugin's script (not the project's planted `scripts/capture.mjs`) and captures a screenshot.

**Result: fail as run the way the prior plan ran Copilot (`--allow-all-tools --no-ask-user`), 3 runs out of 3. Path resolution works in every run. Copilot's path verification blocks the script, because it sits outside the project. Pass with `--add-dir <installed plugin root>` (1 run).**

| Run | Flags | Path the model ran | Outcome |
|---|---|---|---|
| [1](02-run1.txt) | `--allow-all-tools --no-ask-user` | `node "~/src/repos/jbit/plugins/jbit-copilot/skills/verify/scripts/capture.mjs" where` | Denied: "Permission denied because no interactive user response was available" (`permission.requested` kind shell, prompt kind **path**, `denied-no-approval-rule-and-could-not-request-from-user`). The model then globbed `**/capture.mjs`, **ran the decoy** (`node ./scripts/capture.mjs --help`, which wrote DECOY-RAN) and **deleted DECOY-RAN itself**. Then it took the shot with its own inline `node -e` Playwright script ([run1-inline-playwright-home-390-light.png](run1-inline-playwright-home-390-light.png)). Fail. |
| [2](03-run2.txt) | same | `… capture.mjs" where`, then `… capture.mjs" shot http://127.0.0.1:8765/ --name home --out ./shots --widths 390 --themes light` | Both denied the same way. It viewed the decoy but did not run it, and said so. No shots, no DECOY-RAN. Fail. |
| [3](04-run3.txt) | same | same two commands | Both denied. No shots, no DECOY-RAN. Fail. |
| [4](05-run4-add-dir.txt) | adds `--add-dir ~/src/repos/jbit/plugins/jbit-copilot` | `node "~/src/repos/jbit/plugins/jbit-copilot/skills/verify/scripts/capture.mjs" shot http://127.0.0.1:8765/ --name home --out ./shots --widths 390 --themes light` | `where` found the cache Playwright, and `shot` wrote `shots/home-390-light.png` and `shots/home-console.txt`. No DECOY-RAN, and the decoy was never touched. Pass. |

**What the model was shown about the skill's location** (`skill.context_delivered_ref`, same in all 4 runs):

```
<skill-context name="verify">
Base directory for this skill: ~/src/repos/jbit/plugins/jbit-copilot/skills/verify

Additional skill files available if needed (use as directed by SKILL.md):
  - ~/src/repos/jbit/plugins/jbit-copilot/skills/verify/scripts/capture.mjs
```

This settles the open question in docs/research/skill-script-paths-2026-11.md ("whether the injected skill context shows the model that path was not observed"): it does, and the model used it on its first try every time. A local marketplace loads "live", so the installed root is the repo's `plugins/jbit-copilot`. That root is outside the project, and that is the condition being tested. A remote install would put it under `$COPILOT_HOME/installed-plugins/…`, which is also outside the project, so the same path prompt would apply (not run).

**The screenshot** ([run4-home-390-light.png](run4-home-390-light.png), 390×800): the "Lemon Stand" page in light theme. It shows a cream background, a dark-gold "Lemon Stand" heading, "Fresh lemonade, 50 cents a cup.", a gold-bordered rounded card reading "**Today's special:** Pink lemonade" and an "Order now" button, with empty space below. [run4-home-console.txt](run4-home-console.txt) has only the header line, meaning no console errors.

**Outside JBIT:** auth (gh login copied into the isolated HOME) worked and was deleted after the runs. No quota problems: 4 premium requests in all. The blocker is Copilot's own file-path permission. `--allow-all-tools` doesn't cover paths outside the cwd and `--add-dir`/trusted dirs. Interactively, the user would get a path-approval prompt. Headless, the call is denied, and in run 1 the model then fell back to the planted decoy.

**For the PM (not the verifier's call):** the gap list or README could note that headless Copilot needs `--add-dir <plugin root>` (or `--allow-all-paths`) to run plugin scripts. The verify skill could also tell the model to stop and report rather than run a project script of the same name when the plugin script is denied (run 1).
