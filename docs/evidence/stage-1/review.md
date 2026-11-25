# Stage 1 review: Antigravity spike

2026-11-25 · `jbit:review` with the security pass (risk: secrets, external services). Agents: wide, so two fresh reviewers ran in parallel, one on correctness and evidence fit and one on security. Neither wrote the stage. The triage below was checked against the files by the reviewing agent, which also wrote none of it. No files other than this one were edited, and `agy` was not run.

Scope: the uncommitted `hosts/antigravity/` (spike kit and fixtures), `docs/evidence/stage-1/`, `docs/research/antigravity-spike-2026-11.md` and the `docs/PLAN.md` diff.

Counts: fix now 6 · defer 2 · reject 6

## Checked clean

- **Secrets and personal data.** I grepped every file in scope for `@gmail`, `ya29.`, `1//`, `refresh_token`, `access_token`, `id_token`, `<home path>`, `<user name>`, `email`, `tier` and `quota`. The results:
  - There are no tokens and no home paths.
  - In `statusline-1..3.json`, `email`, `plan_tier` and all `quota`/usage values read `<removed>`.
  - The only email in scope is the public `support@anthropic.com` (`skills/09-tree-conversion.txt:27`).
  - `skills/06-run-command-env.txt` lists environment variable names only, with no values. Note that `ANTIGRAVITY_CSRF_TOKEN` reaches `run_command`.
  - `install/07` says the token's hash was deliberately left out.
- **Real `~/.gemini` unchanged.** The before and after hashes and stat listings match (`install/05`, `install/07`).
- **Token permissions.** Under `umask 077`, `.gemini` is created 700 and the token is `cp`'d and then set to 600 (`mkhome.sh:16-19`).
- **Empty output allows; `{}` blocks** (`hooks-deny/14`):
  - Empty output on `write_file` and on `run_command`: exit 0, step `DONE`, the file was written.
  - `{}`: step `ERROR` with "tool call denied by pre-tool hook:", and no `note.txt` was written.
  - Exit 1 also blocks.
  - The note and the PLAN decision match this evidence.
- **Stop cap of 10.**
  - `Stop` fired 11 times, with `executionNum` 0 to 10 once each.
  - The transcript holds 10 `Stop hook blocked termination` lines (`hooks-stop/02:129-131`), and the response holds 10 `CONTINUED-AGAIN` (`hooks-stop/01`).
  - `continuationActive` was `false` on every payload.
  - The note matches.

## Fix now

1. **`mkhome.sh` can write inside the real `.gemini`.**
   - `mkhome.sh:11` runs `mkdir -p "$1"` before the guards at :14-15. Running `mkhome.sh ~/.gemini/x` creates the empty `~/.gemini/x` and only then refuses.
   - :15 compares against the unresolved `$real_home/.gemini/`. If `~/.gemini` is a symlink, a target under its real path passes the guard.
   - :11-18 follow a pre-existing `<dir>/.gemini` or token-path symlink, so the token can be written to a planted location in a shared directory.
   - :11 creates the target dir 755, because the umask is only set at :16.
   - Fix: set `umask 077` first. Resolve the real `.gemini` with `pwd -P`. Run the guards on the resolved parent before any `mkdir`. Refuse a target that exists and isn't empty.
2. **The probe hook logs everything, world-readable.** `hook.mjs:11,61-65` writes raw stdin for every event to `~/probe-log` with default modes (755/644): prompts, tool inputs, and the full `write_file`/`edit_file` content. The plugin has an ordinary manifest, so it can be installed for real. Fix: create the log dir with mode 0700 and the files with 0600, and add a "spike only, logs everything" warning to `plugin.json`'s description and the README.
3. **Copied tokens are never cleaned up.**
   - Ten or more throwaway homes holding a token copy are still under the scratchpad's `agy/home-*`. The scratch root is 700, so the copies aren't world-readable, but they linger.
   - The README has no cleanup step.
   - Fix: add an `rm -rf` (or trap) step to `hosts/antigravity/spike/README.md`, and delete the stage's homes once evidence is final.
4. **The README contradicts the note on `denied_actions`.**
   - `hosts/antigravity/spike/README.md:16` says to judge a run by `denied_actions`.
   - The note (`antigravity-spike-2026-11.md:46,111`, evidence `hooks-deny/06-10`) shows that hook denies are absent from `denied_actions`, with exit 0 and `SUCCESS`.
   - Fix: say "by `ERROR` steps and the deny text; `denied_actions` omits hook denies".
5. **"Now corrected" isn't true for the research note.**
   - `antigravity-spike-2026-11.md:50` says the earlier note was corrected, but `docs/research/antigravity-hooks-2026-11.md:81` still says a `PreToolUse` hook "fails closed in every case".
   - A stage 2 builder reading that note would treat a silent crash as safe, which is the opposite of the truth.
   - Fix: add a dated correction under `antigravity-hooks-2026-11.md:81` (empty output allows), or reword :50.
6. **The note and the plan disagree on `CLAUDE.md`.**
   - `antigravity-spike-2026-11.md:115` says "write the link into `AGENTS.md`".
   - The new unattended decision in `PLAN.md` says point at `CLAUDE.md`, and that JBIT doesn't write `AGENTS.md`.
   - Fix: change :115 to state the finding and defer to the plan's decision, so stage 2 reads one answer.

## Defer (to the plan's open questions)

- **`executionNum` across resume.** The new decision allows "reads `executionNum`" for the carry-on count, but no evidence shows whether it resets on a `--conversation` resume. Only `invocationNum` was checked (`hooks-context/04`). Stage 2 should count per prompt itself, or the stage 3 live run should probe this.
- **Unattended settlement of a user question.** The `CLAUDE.md`/`AGENTS.md` question was marked "For the user; it shapes stage 2" and was settled by its default under unattended autopilot. The default is the safe one, since JBIT doesn't write the user's `AGENTS.md`. List it first in the report to the user so they can overturn it.

## Rejected

- **"Empty output was only tested on `write_file`."** Wrong: `run_command` was tested too (`hooks-deny/14:47-90`).
- **"The timeout claim is cited to the spike."** The PLAN decision cites both notes. The timeout result comes from `antigravity-hooks-2026-11.md:88`, which still stands.
- **`hook.mjs:66-67` returns `{}` for non-`PreToolUse` events when logging fails.** This affects spike observations only, and the evidence shows injection and continue worked.
- **`PROBE_MODE` is read from `$HOME`.** This is a deliberate knob. Anything that can write `$HOME` already owns the user, and `continue` is capped at 10 by the host.
- **Some topics lack an `answers.md`.** The note covers them, and the raw captures are present.
- **The target dir is created 755.** The token is still in a 700 dir with mode 600. This is folded into fix 1 anyway.
