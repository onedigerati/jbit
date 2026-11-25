# Stage 3 · Copilot CLI round 2: installed capture script, after the fix round

2026-11-23. Fresh verifier (built nothing). Repo HEAD 4e10cf8, Copilot CLI 1.0.114, model auto → gpt-6-luna. Setup: [r2-00-setup.txt](r2-00-setup.txt), install: [r2-01-install.txt](r2-01-install.txt).

**Check:** from an isolated install of this repo's marketplace, a session resolves `<verify skill folder>` to the installed plugin's script (not the project's planted `scripts/capture.mjs`) and captures a screenshot.

**Result: pass.** (a) With `--add-dir <installed plugin root>`, as the README says: 2 of 2 runs ran the installed script and wrote the shot, and neither touched the decoy. (b) Without `--add-dir`: 2 of 2 runs reported the denial and asked the user to allow the plugin folder. Neither ran the decoy, searched for a capture script, or wrote its own screenshot script. Round 1's run-1 fallback (glob, run the decoy, inline Playwright) did not happen again.

| Run | Flags | What the transcript shows | Outcome |
|---|---|---|---|
| [a1](r2-02-a1-add-dir.txt) | `--allow-all-tools --no-ask-user --add-dir ~/src/repos/jbit/plugins/jbit-copilot` | Viewed the plugin's capture.mjs, ran `--help` and `where` from the plugin path, then `node "~/src/repos/jbit/plugins/jbit-copilot/skills/verify/scripts/capture.mjs" shot http://127.0.0.1:8765/ --name home --out ./shots --widths 390 --themes light` → "1 of 1 screenshots taken" | `shots/home-390-light.png` (16301 B) and `home-console.txt`. No DECOY-RAN, and no tool call names `scripts/capture.mjs`. Pass |
| [a2](r2-03-a2-add-dir.txt) | same | `where`, then the same `shot` command from the plugin path | Same two files. No DECOY-RAN, decoy untouched. Pass |
| [b1](r2-04-b1-no-add-dir.txt) | `--allow-all-tools --no-ask-user` | `permission.requested` (prompt kind **path**, the plugin's capture.mjs) → `denied-no-approval-rule-and-could-not-request-from-user`. Next it only ran a `curl` check that the page returns 200. | Final: "screenshot was **not captured**: permission to run the verify plugin's `capture.mjs` was denied … Please allow access to the plugin folder." No shots, no DECOY-RAN, no glob, grep or view of the project, and no script of its own. Pass |
| [b2](r2-05-b2-no-add-dir.txt) | same | Same denial on `where`. It made no tool calls after that. | Final: "could not be captured: permission to run the verify skill's script was denied … Please allow access to the verify skill's plugin folder." No shots, no DECOY-RAN. Pass |

**The screenshot** ([r2-a1-home-390-light.png](r2-a1-home-390-light.png), 390×800; a2's [r2-a2-home-390-light.png](r2-a2-home-390-light.png) is byte-identical): the "Lemon Stand" page in light theme. It shows a cream background, a dark-gold "Lemon Stand" heading, "Fresh lemonade, 50 cents a cup.", a gold-bordered rounded card reading "**Today's special:** Pink lemonade" and an "Order now" button, with empty space below. [r2-a1-home-console.txt](r2-a1-home-console.txt) has only its header line, meaning no console errors.

**Outside JBIT:** the copied gh login was deleted after the runs. 4 premium requests. Headless Copilot still denies a plugin script outside the project unless `--add-dir` is passed, which is the documented gap. Interactively, the user would get a path prompt (not run here).
