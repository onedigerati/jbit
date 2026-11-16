# Stage 3 · Research fetches — evidence
Verified 2026-11-15 on 8acb3f6, plus uncommitted changes (the stage's work)

| Check | Result | Evidence |
|---|---|---|
| Under autopilot, a read-only `curl` or `wget` GET (no body, upload, method other than GET/HEAD, auth or cookie header or credentials, and no output piped or substituted into another network command) passes the outward check, e.g. `curl -s https://en.wikipedia.org/wiki/Fargo` (proof: test) | pass | [tests.txt](tests.txt): "a read-only curl or wget GET passes the outward check; a body, upload, method, credentials, config or fed output does not" (passing rows), "under autopilot, a research read goes through and a send is held with a pointer to WebFetch"; [outward-samples.txt](outward-samples.txt) |
| Anything else stays blocked as before: `-d`/`--data*`/`--json`/`-F`/`-T`/`--upload-file`, `-X POST\|PUT\|PATCH\|DELETE`, `-H 'Authorization: …'`/`Cookie`/`-u`/`-b`/`--oauth2-bearer`, `wget --post-data\|--post-file\|--method\|--body-*\|--header=Authorization`, a config file (`-K`/`--config`, `-e`/`--execute`), and a GET whose output feeds another network command (proof: test) | pass | [tests.txt](tests.txt): the same table test (blocked rows), "a pipe feeds the command after it, and only that one", "nothing in CLAUDE.md loosens the built-in outward check: wget sending data" and "…: a fetch fed to another network command"; [review-probes.txt](review-probes.txt): all 120 of the security review's send probes blocked |
| The outward block message for a network command points to WebFetch/WebSearch for reading pages (proof: test) | pass | [tests.txt](tests.txt): "under autopilot, a research read goes through and a send is held with a pointer to WebFetch" |
| The autopilot and stage skills say research reads go through WebFetch/WebSearch, and that a read-only `curl`/`wget` GET is allowed while a send is not (proof: docs check) | pass | [docs-check.txt](docs-check.txt): "stage and autopilot send research reads through WebFetch and WebSearch: a read-only curl or wget GET passes, a send waits" |
| Suite, docs check and validate green (proof: command) | pass | [tests.txt](tests.txt) 499/499 · [docs-check.txt](docs-check.txt) 34/34 · [validate.txt](validate.txt) passes with warnings |

Project checks: validate pass with warnings ([validate.txt](validate.txt)) · tests 499/499 ([tests.txt](tests.txt)) · docs checks 34/34 ([docs-check.txt](docs-check.txt)) · no build step
Audit: no lockfile or dependencies; nothing to audit

## History
- 2026-11-15 · First suite run: 2 timing tests failed under load ("the evidence scan stays linear on long lines" at 500 ms, "long pathological lines parse in well under 100 ms"); both passed on two re-runs, and the parser's timing before and after this stage is comparable, well under the limit ([flaky-timing.txt](flaky-timing.txt)). Flaky, already noted in the plan.
- 2026-11-15 · `curl -G --data-urlencode` (a query-string read, likely the eVelo case) was blocked; now a read unless a value reads a file or holds `$`.
- 2026-11-15 · Security review got a local file out with real curl and wget through lines called reads: `${…}` operators and arrays, brace and glob expansion into flags, the local-host shortcut ignoring `-x`/`--connect-to`/`--resolve`/`-K`/wget `-i`/`-e` and proxy variables, `CURL_HOME`/`WGETRC`, and `$` in option values. Fixed: all blocked ([review-probes.txt](review-probes.txt)); downloads into `.curlrc`, `.wgetrc` or `.git/hooks` blocked too.
