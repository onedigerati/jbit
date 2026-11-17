# JBIT plan

## Goal
Make sure the 20-line handoff never loses findings without anyone knowing. Each role agent (`builder`, `verifier`, `reviewer`, `researcher`) still hands back a report of 20 lines at most. When the detail doesn't fit, the agent writes all of it to a file, puts the path in the report, and says how much it left out. The reviewer gets the Write tool for this, saves its full review to `docs/evidence/stage-<n>/review.md` with fix-now findings first, and still edits no project files. Done when the four agent files carry the rule, a docs check holds it, a headless run shows a reviewer with more findings than 20 lines can hold saving all of them to `review.md` while handing back a short report with the path, the same run settles whether a subagent can write its own `.md` report today, and the plugin is 1.2.0.

## Baseline
2026-11-17 · tests: 43 pass, 0 fail (`claude plugin test plugins/jbit`) · docs checks: 31 pass (`node --test plugins/jbit/tests/docs.check.mjs`) · validate: passes (`claude plugin validate .`)

## Now
All stages done: the goal is met. Next: a new plan (`jbit:plan`) if more is wanted.

## Stages
- [x] 1. Handoff overflow — overflow rule in the four agent files, reviewer gets Write and `review.md`, docs check, headless proof, 1.2.0 · 2026-11-17 · evidence: [docs/evidence/stage-1/report.md](evidence/stage-1/report.md) (check 4 accepted by the user; see Decisions)

## Decisions
- 2026-11-17 · The reviewer gets the Write tool and saves its full review to `docs/evidence/stage-<n>/review.md`. The user chose this over keeping it read-only and having it report a count of what it cut. Why: the report is the only copy of a review's findings, unlike a builder's diff, a verifier's `report.md` or a researcher's note.
- 2026-11-17 · (pm) The overflow rule goes in the four agent files, not the skills. Why: the six skills are at 4,996 of their 5,000-word cap, and every skill already starts these roles by name, so the agent file always reaches them.
- 2026-11-17 · (pm) Each role overflows into a file it already owns or one next to it: the builder to `build-<part>.md` in the stage's evidence folder, the verifier to `report.md`, the reviewer to `review.md`, the researcher to its note. Outside a plan stage, the reviewer writes `docs/reviews/<date>-<topic>.md`. Why: the detail lands where archiving already carries it, with no new place to look.
- 2026-11-17 · (pm) Every overflowing report says how much it left out. Why: a silent cut is the failure this plan is about.
- 2026-11-17 · (pm) Version 1.2.0: new behaviour, nothing removed.
- 2026-11-17 · (pm) Scale: one stage, no PRD, so one plan. No research: everything this plan depends on is inside the repo, and the subagent-write question is tested directly.
- ~~2026-11-17 · (pm) The 2026-11-08 finding that subagents can't write report `.md` files looks out of date. In 1.1.0's headless run ([run](plans/2026-11-17-fan-out-limit/evidence/stage-1/stage-run.jsonl.txt)) the verifier subagent wrote `report.md` itself; only shell redirection was blocked, and the main session then rewrote the file. The fourth check confirms it in a clean run instead of resting on that one sighting.~~ — wrong: that run's verifier Write was refused too, and the main session wrote the file.
- 2026-11-17 · (autopilot) Settled by check 4, but not as the plan expected: Claude Code refuses a subagent's Write of `report.md` with "Subagents should return findings as text, not write report files." This happened in this stage's run and also in 1.1.0's. The same run let the reviewer write `review.md` and the verifier write `.txt` evidence. The 2026-11-08 finding still holds, so the verifier's overflow into `report.md` can't work. Stopped for the user ([evidence](evidence/stage-1/subagent-writes.txt)).
- 2026-11-17 · The verifier hands back its full results table as text, and the main session writes `report.md`, which is what already happened in practice. `jbit:verify` says so. Builder, reviewer and researcher keep their overflow files, which worked. Checks 1 and 4 were reworded to match. This was the user's choice, after the stop; the risk is that Claude Code widens the refusal to other `.md` files.
- 2026-11-17 · (autopilot) The reviewer always saves its full review to `review.md`, not only when it overflows. Why: that is the user's choice and the Goal's wording; the builder had made it overflow-only.

- 2026-11-17 · (autopilot) Fix round 2: the reviewer's handback has a set layout (the review file's full path on line 1, one line per fix-now finding, one line counting the rest, one line on what is sound), and every role uses no blank lines. Why: a line limit stated alone still produced 23 lines.
- 2026-11-17 · (autopilot) Fix round 3: after a verifier, verify writes its table to `report.md` before any fix, and re-verifies with a fresh verifier rather than in the main session. Why: one run had replaced the verifier's fail rows with the main session's own re-check.
- 2026-11-17 · (autopilot) The reviewer may write probe scripts outside the repo; inside it, its only file is the review. Why: it confirms findings by running code, which `/tmp` probes did in every run.
- 2026-11-17 · (autopilot) Words cut from `verify` to pay for the new rules, keeping every rule and every checked phrase: the opening line, some examples (`pyproject.toml`, `govulncheck`, the "unproven" examples, a dev-server aside) and "its agent file sets those". Why: the six skills are at exactly 5,000 words.
- 2026-11-17 · Check 4 accepted as passed after three fix rounds. Round 4's run 2 wrote the verifier's rows word for word but in verify's report format, which meets the check's wording; "exactly as it came" was a stricter bar added in fix round 3. verify now says "rows as they came, in this format". The user chose this. The report keeps the verifier's fail row and adds a History line.
- 2026-11-17 · (autopilot) Code review, deferred: the field guide still says the skills hand work to all four role agents (left alone because the file has the user's uncommitted edits), and `docs/reviews/` isn't carried by archiving. Rejected: "Write is enforced by prompt alone" — the user chose to give the reviewer Write, and check 3 showed it keeps to the review file in the repo.
## Fixes
- 2026-11-17 · Lifted the 5,000-word total on the six skills, then the 1,500-word limit per skill (docs check and standing decision updated) — docs check, plugin tests and validate green
- 2026-11-17 · Restored the words cut from `verify` to fit 1.2.0 under the old cap (opening line, unproven examples, `pyproject.toml`, `govulncheck`, the dev-server aside, "The" in §3's heading, the role agent-file note, "With no plan stage involved"); 1.2.0's three rule changes stay — docs check, plugin tests and validate green; diff against 1.1.0 is only those three lines

## Open questions
- 2026-11-17 · Shipped: `main` pushed (1.2.0 and the word-limit fixes) and the installed plugin updated from 1.1.0 to 1.2.0; takes effect after a Claude Code restart.
- In every headless review the reviewer missed one planted bug (P7, `applyDiscount` returns the discount instead of the total) — review quality, outside this plan.
- The field guide's role-agent line and `docs/reviews/` archiving (deferred from code review) — for a later plan.
- `docs/field-guide.html` still has your uncommitted changes; the 1.2.0 commit took only its two version lines — for the user.
- milestone-close-gap's `tal-04-stays-blank` and `m1-not-ticked` graders judge changed files only, so a run that rightly changes nothing fails them — for a later plan.
- Single-run eval drops outside 1.0.0's pass condition: charter-prd 0.92 → 0.64, regression-caught 1.0 → 0.60, research-spike 1.0 → 0.75 — worth a two-run check before shipping, for the user.
- A `/jbit:stage` run in a repo with a project `builder.md` hasn't been shown to pick `builder` over `jbit:builder` — for a later plan.
- The secret guard can't see commits made through config-file git aliases (`git ci`), `git $x`, or scripts; 0.18.1 couldn't either — for a later plan.
- `shell.ts` still exports parser details nothing reads (`DEEP`, `BUILT`, `STDIN`, `FROM_INPUT`, the git `alias` flag) — safe to trim later.
- At a plan's last stage, the committed plan keeps the ticked stage line but not its ticked checks; they live in the evidence report — for the user.
- `plugins/jbit/evals-ablation/` (untracked) holds the ablation's case copies and raw results; delete it once the user has looked — for the user.
- Leftover agent worktrees in `.claude/worktrees/` (five, from 1.0.0's stages 1–2, all merged) — remove with `git worktree remove` once the user has looked.

## Standing decisions
- Standing decisions from earlier plans are in [decisions.md](decisions.md).

## Shipped
- 2026-11-07 · Verification evidence: verify saves a per-check report and its output to `docs/evidence/stage-<n>/`, stage and autopilot link it, archiving carries it along, and the commit guard refuses to close a stage without it (keel 0.5.0–0.5.2) — [plan](plans/2026-11-07-verification-evidence.md) · [evidence](plans/2026-11-07-verification-evidence/evidence/)
- 2026-11-17 · Fan-out limit: `stage`, `autopilot` and `plan` follow a `CLAUDE.md` limit on agents at once and worktrees; README "Slower machines" (1.1.0, pushed) — [plan](plans/2026-11-17-fan-out-limit.md) · [evidence](plans/2026-11-17-fan-out-limit/evidence/)
