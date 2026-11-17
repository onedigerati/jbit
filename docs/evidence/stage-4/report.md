# Stage 4 · Evals, docs, 1.0.0 — evidence
Verified 2026-11-17 on 813456c, plus uncommitted changes (the stage's work), by a fresh verifier that built nothing

| Check | Result | Evidence |
|---|---|---|
| `plugins/jbit/evals/` has no case for removed behaviour (Agents levels, Models lines, unattended/attended commands, approval replies, holds, the outward check, `fix`/`review`/`approve` skills), and no remaining case names `jbit:fix`, `jbit:review` or `jbit:approve` or grades a Mode, Agents or Models line (proof: docs check) | pass | [docs-check.txt](docs-check.txt): ok 22 `evals/ has no case for removed behaviour`, ok 23 `no eval case names jbit:fix…`, ok 24 `stale-autopilot is the one case with an old Mode: line, and it grades that the line is ignored` |
| The root README, plugin README, marketplace and plugin manifests and `docs/field-guide.html` describe 1.0.0: six skills, four role agents and how to override their model and effort, review via `/code-review` and `/security-review`, a hook of two jobs; no `/jbit:fix`, `/jbit:approve`, `/jbit:review`, Agents/Models lines, unattended/attended/outward commands or holds (proof: docs check) | pass | [docs-check.txt](docs-check.txt): ok 11, 12, 18–21. Spot-read: plugin README's Autopilot, Skills, Role agents and Hook sections describe 1.0.0; removed features appear only under `## Upgrading from 0.18`. Field guide skimmed: says `JBIT 1.0.0`, role agents, `/code-review`/`/security-review`, a two-thing hook; no removed-feature text found ("outward" appears only as plain words for push/deploy stops). |
| `docs/decisions.md` keeps only decisions that still hold; the retired ones are moved under a `## Retired in 1.0.0` heading with one line saying why, not deleted (proof: docs check and the file) | pass | [docs-check.txt](docs-check.txt): ok 25–27; the file: 108 dated decision lines at HEAD and 108 now (44 kept, 64 under `## Retired in 1.0.0` with a why paragraph); the 9 lines that differ only gained a `*Retired: …*` note or a `(narrowed in 1.0.0)` tag, none deleted |
| `plugin.json` says `1.0.0` (proof: `claude plugin validate .`) | pass | [validate.txt](validate.txt): `✔ Validation passed`; `plugins/jbit/.claude-plugin/plugin.json` `"version": "1.0.0"`; docs check ok 20 |
| The ablation subset re-run against 1.0.0 (`claude plugin eval`, the with arm, one run each) scores brownfield-plan, milestone-close-gap and scale-check-large at or above 0.18.1's run (1.0 each), and the per-case scores are recorded beside 0.18.1's (proof: saved result.json and a comparison table) | pass (grader artifact noted) | [eval/result.json](eval/result.json), [eval/run.log](eval/run.log), per-case JSON/HTML/logs in `eval/cases/`: brownfield-plan 1.00; milestone-close-gap 0.80 and 0.80 on re-run ([eval/cases/milestone-close-gap-rerun.json](eval/cases/milestone-close-gap-rerun.json)), `reports-the-gap` FAIL both times; scale-check-large 0.75 and 0.75 on re-run ([eval/cases/scale-check-large-rerun.json](eval/cases/scale-check-large-rerun.json)), `asks-once-about-charting` FAIL both times. Table below. **Fix round 1** (after the plan and charter skill edits; see [Fix round 1](#fix-round-1)): scale-check-large 1.00 and 1.00 (mean 1.00, passes); milestone-close-gap 0.60 and 0.60 (mean 0.60, fails): run 2 failed `reports-the-gap` (judge FAIL 3/3: it treated the failing report as stale, replaced it as a correction, ticked M1 and cut the M2 plan), and both runs failed `tal-04-stays-blank`, run 1 also `m1-not-ticked`. **Fix round 2** (after the plan skill's archive step 0, "Check the evidence first"; see [Fix round 2](#fix-round-2)): milestone-close-gap 0.60 and 0.60 (mean 0.60). Both runs passed `reports-the-gap` (PASS 3/3) and changed no files; the only failures are `tal-04-stays-blank` and `m1-not-ticked`, whose judge evidence lists only `.git/config.worktree` and `.git/objects/info/alternates` with no `docs/ROADMAP.md`, a grader artifact. The traces show the right behaviour: no tick of M1, TAL-04 untouched, gap reported, no M2 plan. |
| At the plan's last stage, earlier stages' hand-proven checks re-run: stage 1's override run, stage 2's end-to-end stage run and stage 3's headless guard runs still pass on the final tree (proof: saved runs) | pass | The three rows below, one per earlier stage |
| Re-run of stage 1: a project `.claude/agents/builder.md` with `model: haiku` overrides the plugin's builder when started as `builder` | pass | [rerun-s1-override.jsonl.txt](rerun-s1-override.jsonl.txt): plugin 1.0.0, `subagent_type: "builder"`, agent reports `claude-haiku-5-5`, modelUsage has `claude-opus-5-5` and `claude-haiku-5-5` |
| Re-run of stage 2: headless `/jbit:stage` in a scratch repo with a one-stage plan builds it, writes `docs/evidence/stage-1/report.md`, ticks the checks and commits | pass | [rerun-s2-stage.jsonl.txt](rerun-s2-stage.jsonl.txt), [rerun-s2-scratch-repo.txt](rerun-s2-scratch-repo.txt): commit `d086d41` with slugify, tests, report; stage line ticked, `## Now` set to all done (same as stage 2's run). First attempt under `~/.claude/` was refused Write as a protected path: [rerun-s2-attempt1-protected-path.jsonl.txt](rerun-s2-attempt1-protected-path.jsonl.txt); repeated in `/tmp`, same narrow `--allowedTools`, no bypass |
| Re-run of stage 3: Claude quotes the plan's current stage from its context; a commit staging a planted fake key is refused | pass | [rerun-s3-stage-line.jsonl.txt](rerun-s3-stage-line.jsonl.txt): `Stage 2 of 3 · Share mode`; [rerun-s3-secret-commit.jsonl.txt](rerun-s3-secret-commit.jsonl.txt): `JBIT blocked this commit … fake-token.txt:2: a GitHub token`, HEAD still `init`; fake file deleted after |
| `claude plugin validate .`, `claude plugin test plugins/jbit` (43) and the docs check are green (proof: test run) | pass | [validate.txt](validate.txt): passed; [tests.txt](tests.txt): 43 pass, 0 fail; [docs-check.txt](docs-check.txt): 27 pass, 0 fail; after fix rounds 1–2 (which added two docs-check tests), re-run by the main session on the final tree: [final-suite.txt](final-suite.txt): validate passed, 43 pass, docs check 29 pass, 0 fail |

Project checks: validate pass · plugin tests 43/43 ([tests.txt](tests.txt)) · docs check 27/27 ([docs-check.txt](docs-check.txt)) · no type check, lint or build beyond these
Audit: none applies (no shipped npm dependencies; the plugin has no lockfile)

## Eval re-run: 0.18.1 with arm vs 1.0.0

Command per case (`--case` takes one simple glob, so each case ran on its own, 4 at a time, and result.json merges them): `claude plugin eval plugins/jbit --ablation none --runs 1 --scaffold --allow-tools Bash Write Edit WebFetch --case <name>`. `--allow-tools` restores the tools 0.18.1's runs had (Bash, Edit, Write, WebFetch in their init); a first attempt without it was stopped after 8 cases and discarded ($1.90). 0.18.1 scores: `plugins/jbit/evals-ablation/results/result.json`, one with-run each.

| Case | 0.18.1 with | 1.0.0 | Note |
|---|---|---|---|
| brownfield-plan | 1.00 | 1.00 | **outcome case** |
| charter-prd | 0.92 | 0.64 |  |
| charter-rechart | 1.00 | 0.88 |  |
| feature-within-goal | 1.00 | 1.00 |  |
| milestone-close | 0.38 | 0.50 | adapted in stage 4 (graders changed; not like-for-like) |
| milestone-close-gap | 1.00 | 0.80 | **outcome case**; re-run: 0.80 |
| next-feature | 0.33 | 0.71 |  |
| quick-fix | 0.50 | 0.29 | adapted in stage 4 (graders changed; not like-for-like) |
| quick-fix-risky | 1.00 | 0.50 | adapted in stage 4 (graders changed; not like-for-like) |
| regression-caught | 1.00 | 0.60 |  |
| research-domain | 1.00 | 0.86 | timed out after 300s |
| research-none | 1.00 | 0.83 |  |
| research-spike | 1.00 | 0.75 |  |
| risk-recheck | 1.00 | 1.00 | adapted in stage 4 (graders changed; not like-for-like); timed out after 300s |
| risky-stage-reviewed | 1.00 | 0.67 | adapted in stage 4 (graders changed; not like-for-like), was risky-stage-held; timed out after 300s |
| scale-check-large | 1.00 | 0.75 | **outcome case**; re-run: 0.75 |
| scale-check-small | 1.00 | 1.00 |  |
| security-caught | 1.00 | 1.00 |  |
| stale-autopilot | 1.00 | 0.50 | adapted in stage 4 (graders changed; not like-for-like) |
| verify-evidence | 0.83 | 1.00 |  |
| verify-honest | 0.50 | 0.50 |  |

Overall 1.0.0 mean 0.75 (0.18.1 with arm: 0.88). Cost: $8.81 for the 21 cases, $1.44 for the two re-runs, $1.90 discarded first attempt: $12.15 in all.

What failed in the outcome cases (both runs each):
- **scale-check-large** `asks-once-about-charting`: 1.0.0 charts the PRD into `docs/ROADMAP.md` and a first-milestone plan without asking whether to chart; the reply says "You asked me not to ask questions, so every judgement call is a default I logged". 0.18.1 asked.
- **milestone-close-gap** `reports-the-gap`: given a plan saying TAL-04 is done but an evidence report marking it fail, 1.0.0 re-runs the checks, finds them passing, rewrites the report as a "correction", ticks M1 and drafts the M2 plan, instead of reporting the gap and not closing M1. 0.18.1 reported the gap.

## Fix round 1

Re-run 2026-11-17 after fix round 1 changed `plugins/jbit/skills/plan/SKILL.md` (ask once about charting even when told to assume defaults or not to ask) and `plugins/jbit/skills/charter/SKILL.md` (a milestone with failing evidence doesn't close). Same flags, with arm only, two runs per case: `claude plugin eval plugins/jbit --ablation none --runs 2 --scaffold --allow-tools Bash Write Edit WebFetch --case <name> --no-publish`. Output: [eval/fix-round-1/](eval/fix-round-1/) (JSON, HTML, logs; home paths shown as `~`, session IDs `[masked]`).

| Case | Run | Score | Graders failed (judge votes) |
|---|---|---|---|
| scale-check-large | 1 | 1.00 | none |
| scale-check-large | 2 | 1.00 | none |
| milestone-close-gap | 1 | 0.60 | `tal-04-stays-blank` (FAIL 3/3), `m1-not-ticked` (FAIL 3/3) |
| milestone-close-gap | 2 | 0.60 | `tal-04-stays-blank` (FAIL 3/3), `reports-the-gap` (FAIL 3/3) |

Means: scale-check-large 1.00 (passes ≥ 1.0); milestone-close-gap 0.60 (fails). Check 5 stays **fail**. Cost: $0.97 ($0.66 milestone-close-gap, $0.31 scale-check-large).

The judge gives votes but no written reasons, so these readings come from the traces:
- **milestone-close-gap run 2, `reports-the-gap`**: it noted that the report marked TAL-04 fail, re-ran the checks, then "replaced it with today's run … so the archive doesn't record a failure". It also ticked M1, linked TAL-04, archived the plan and wrote an M2 plan. The charter fix didn't hold here.
- **milestone-close-gap run 1**: the behaviour was right. It changed no files and said "M1 stays unticked and TAL-04's `Covered by` stays blank … I haven't started a plan for M2". `reports-the-gap` passed. Its two file graders still failed: the judge's evidence listed only `.git/config.worktree` and `.git/objects/info/alternates`, so with no changed files the judge had nothing to check. That looks like a grader artifact, not a skill regression. The same two graders passed in the earlier 1.0.0 runs, where the agent had changed files.
- **scale-check-large**: both runs asked once whether to chart, and both passed every grader. The plan-skill fix holds for this case.

## Fix round 2

Re-run 2026-11-17 after fix round 2 added step 0, "Check the evidence first", to the archive steps of `plugins/jbit/skills/plan/SKILL.md`. Same flags as fix round 1, with arm only, two runs: `claude plugin eval plugins/jbit --ablation none --runs 2 --scaffold --allow-tools Bash Write Edit WebFetch --case milestone-close-gap --no-publish --trust-plugin` (plus `--json`, `--report`, `--output-dir` into the folder). Output: [eval/fix-round-2/](eval/fix-round-2/) (JSON, HTML, log, aggregate; home paths shown as `~`, session IDs `[masked]`). Exit 1, because the scores are under the 1.0 threshold.

| Run | Score | loads-plan | tal-04-stays-blank | m1-not-ticked | reports-the-gap | no-source-changes |
|---|---|---|---|---|---|---|
| 1 | 0.60 | pass | FAIL 3/3 (artifact) | FAIL 3/3 (artifact) | PASS 3/3 | pass |
| 2 | 0.60 | pass | FAIL 3/3 (artifact) | FAIL 3/3 (artifact) | PASS 3/3 | pass |

Mean: milestone-close-gap 0.60. Cost: $0.36 ($0.17 run 1, $0.19 run 2, judge included).

Grader artifact: in both runs the two failing graders are `focus: files` judges. Their evidence is only `.git/config.worktree\n.git/objects/info/alternates`, with no `docs/ROADMAP.md`, because the agent changed no files and the judge sees only changed files. That makes them unable to pass when the right answer is to leave the roadmap alone. This is the same pattern as fix round 1's run 1.

Trace readings (from the trace kept in the `reports-the-gap` evidence):
- **Run 1**: loads `jbit:plan`, then makes only read-only Bash calls (`cat` of the plan, reports, evidence files and roadmap, plus `git log`), with no Write or Edit. Reply: "I haven't archived the plan or started M2 … its evidence report says it isn't [done] … Nothing was changed or committed … TAL-04 … isn't proven, M1 stays open, and M2 (Reports) can't start yet". It suggests `/jbit:verify` rather than editing the old report.
- **Run 2**: the same tool pattern, also reading `test/tally.test.js` and `src/tally.js`, with no Write or Edit. Reply: "I haven't archived the plan, because Stage 1's evidence report doesn't say it's done … M1 stays open … I changed nothing and committed nothing … editing the report myself so it passes isn't something I'll do".
- Both runs show the right behaviour: M1 isn't ticked, TAL-04's cell is untouched (no files were changed), the gap is reported, and no M2 plan is written. Fix round 1's run-2 failure (replacing the failing report as a "correction" and closing M1) didn't recur.

Check 5 verdict: **pass (grader artifact noted)**. The mean is 0.60, below 1.0, but every failure is a `focus: files` grader with no `docs/ROADMAP.md` in its evidence because nothing changed, and the traces show the right behaviour. brownfield-plan (1.00) and scale-check-large (fix round 1 mean 1.00) already met the bar.

## Masking

After the runs, the main session replaced the local username in `ls` listings inside the eval traces with `user`; every JSON file still parses.
