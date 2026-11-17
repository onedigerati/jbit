# Stage 1 · Restore 0.18.1 as 2.0.0 — evidence
Verified 2026-11-17 on f2d8e01 (+ staged restore) · saved by the main session from the verifier's `## Report`

| Check | Result | Evidence |
|---|---|---|
| `git diff bdd4c76 -- plugins/jbit` shows only version strings (2.0.0) and the plugin description; `agents/` is gone, and `approve`, `fix` and `review` are back (proof: saved diff) | pass | [diff-plugin.txt](diff-plugin.txt): 2 files, 5 lines (plugin.json version, docs-check version test); description unchanged; listings at bdd4c76 and working tree identical, 103 files |
| The root `README.md`, `.claude-plugin/marketplace.json` and `docs/field-guide.html` match 0.18.1 apart from the version and the 2.0.0 wording (proof: saved diff) | pass | [diff-root.txt](diff-root.txt): only the field guide's header and footer differ (JBIT 2.0.0); hero images' sha256 match bdd4c76 |
| `claude plugin test plugins/jbit` passes the same number of tests 0.18.1 recorded (561), and the docs check passes all 47 of 0.18.1's checks with its version test at 2.0.0 (proof: test run) | pass | [plugin-test.txt](plugin-test.txt): 561 pass, 0 fail; [docs-check.txt](docs-check.txt): 47 pass, 0 fail |
| `claude plugin validate .` passes (proof: test run) | pass | [validate.txt](validate.txt) |

Project checks: plugin tests 561/561 · docs check 47/47 · validate pass · no type check, lint or build
Audit: n/a (no package manifest)
Also: a headless run with the plugin loaded didn't error ([hook-load.txt](hook-load.txt)); that the hook fired in it isn't shown.

## History
- 2026-11-17 · Check 3 was corrected from 477 to 561 tests before verifying: 477 was a miscount of `test(` lines.
