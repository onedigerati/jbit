## Starting the next plan

A plan covers one body of work with one Goal: a single feature, several features, or a whole milestone. Its stages can span all of them. Size it to what the user is driving toward, not to one feature.

- **New work that fits the current Goal** joins this plan: add its stages (see "Updating a plan"), even if it's a new feature.
- **New work beyond the Goal while stages are still open:** ask the user whether to widen the Goal and add it here, or hold it for the next plan (note it under open questions).
- **A change that fits `jbit:fix`'s bar** (see "Is it plan-sized?") isn't new work for a plan, whether or not the Goal is met: recommend `jbit:fix`, which logs it under the current plan's `## Fixes` without archiving anything.
- **The Goal is met and the next work goes beyond it:** start a fresh plan rather than adding stages to the old one. If any stages are still open, ask first: finish them, drop them (logged as a decision), or carry them into the new plan.

1. **Archive.** Move the finished plan to `docs/plans/<date finished>-<plan-slug>.md` (`git mv`, so its history follows it). If `docs/evidence/` exists, move it beside the plan: `mkdir -p docs/plans/<date finished>-<plan-slug>` then `git mv docs/evidence docs/plans/<date finished>-<plan-slug>/evidence`. That moves the whole folder, its `.gitignore` and local (ignored) files included. The plan stays unchanged except for one line under its Goal, `Evidence: [<date finished>-<plan-slug>/evidence/](<date finished>-<plan-slug>/evidence/)`, and any links it had into `docs/evidence/` rewritten to the new place. The new plan starts with no `docs/evidence/`; `jbit:verify` recreates it. `docs/research/` isn't moved: its notes outlive the plan. With a roadmap, fill its ledger from the archived evidence now (see "With a roadmap").
2. **Carry forward only what binds**, into a new plan at the old one's path, so a plan file always exists. Read the archived plan's decisions and the current standing decisions (`## Standing decisions`, and `docs/decisions.md` if it exists). Each one that still constrains the work (data formats, conventions, technology choices, product rules) goes into the new plan's `## Standing decisions`, word for word, with its original date and a link to the plan it came from; scale answers always carry. Leave out what only mattered to the finished work. If that makes more than ten, or `docs/decisions.md` already exists, they go to that file instead and the plan keeps its pointer line (see Layout). Open questions that are still open carry into the new plan's `## Open questions`.
3. **Record what shipped.** Add a line to the new plan's `## Shipped`: date, the plan's name, what it delivered, link to the archive, and link to its evidence folder if it has one. Keep earlier lines.
4. **Plan the new work as usual** (Creating a plan above) in that file: new Goal, a survey of what it touches, a fresh `## Baseline` taken now (the last plan's work is part of the project now, failures included), and stages numbered from 1. The Agents and Models lines carry over unless the user changes them (with no Models line yet, the `CLAUDE.md` default's); a `Mode:` line never does (a new plan's stages start only on the user's yes, `jbit:autopilot` included). The scale answer is logged in this plan. If it's to chart, run `jbit:charter`, then cut this plan from the roadmap's current milestone, keeping the standing decisions and Shipped lines already in it. With a roadmap, whether it already existed or the charter just wrote it, follow "With a roadmap" below: when the fill left the current milestone covered, this plan's first work is closing it, and its stages are cut only after the close.
5. **Commit the switch on its own** (archive, evidence, the ledger fill with a roadmap, new plan), then, once the plan has stages to build, suggest the user clear the conversation (`/clear`) or start a new session before building. Nothing is lost: the plan, the archive and git carry everything, and `jbit:resume` picks it up from there.

## Updating a plan

When the user decides something, changes direction, or a stage reveals something the plan got wrong: edit the plan in place (decisions log, stages, Now) and say in one line what changed. If the change invalidates finished stages, say which, and ask before redoing them.

## With a roadmap

When `docs/ROADMAP.md` exists (`jbit:charter` writes it), plans are cut from it one at a time. Without one, skip this section; nothing here applies.

- **The current milestone** is the first unticked `- [ ] M<n>.` under `## Milestones`, the one the hook shows. A plan's scope is that milestone's open requirements, the `## Requirements` rows with that milestone whose `Covered by` is blank, leaving out rows marked `dropped`, plus the roadmap's `- Rework <ID>: …` open questions for its IDs (and for IDs of milestones already ticked: a ticked box isn't reopened, so its rework rides with the next plan). The Goal names the milestone and the requirement IDs this plan takes on: all of them, or a slice that fits 3–8 stages, the rest left for the next plan from the same milestone.
- **Tag each check with what it proves**, at the end of the check, after its proof: `<outcome> (proof: test) (req: SEC-01)`, or `(req: SEC-01, SEC-02)`. Never first: the hook reads a leading number as a stage, and a tag leading a report row could look like a re-run row. Every requirement the Goal takes on needs at least one tagged check; verify copies the check, tag included, into its report row.

### Fill the ledger at archive

Fill a blank `Covered by` cell only for an ID that both:
- the archived plan took on itself: tagged on one of its own checks (in its `## Now` as each stage ran; `git log -p` of the plan holds the ones a later `## Now` replaced) or named in its Goal; and
- has a row tagged with it whose Result is `pass` in that plan's own stage reports (`docs/plans/<date>-<slug>/evidence/stage-*/report.md`; never a `milestone-*.md` file, and never another plan's report), and no later re-run row tagged with it (`Re-run of stage <k>: …`) that fails.

Set the cell to the archived plan's link, relative to `docs/`: `[<plan name>](plans/<date>-<slug>.md)`. That link and nothing else: never `TBD`, `n/a`, a dash or a note, since the hook counts any text as covered. An ID with only failing rows, or a passing row a later re-run failed, stays blank. A row marked `dropped` stays blank; its tag goes to the roadmap's `## Open questions` (`- <ID> is dropped but <plan> still tags it: <check>`), as does a tagged ID the ledger lacks. A cell that already names a plan stays as it is, unless the ID had a `Rework <ID>` line this plan took on: then the cell takes this plan's link and the Rework line is removed. The fill goes in the switch commit.

### The switch, the close, then the cut

A plan file exists at every step, so the hook always has a plan (and, under autopilot, a Mode line) to read:

1. **Commit the switch** ("Starting the next plan" steps 1–3 and 5): archive, ledger fill, and the new plan with its standing decisions, open questions and Shipped line. If the fill left a non-dropped row of the current milestone blank, the new plan is cut from it now (step 4 below) and goes in this commit; otherwise the milestone is covered and the new plan's first work is closing it: its Goal says it closes M<n> and then cuts the next plan, `## Stages` holds one unnumbered line, `- [ ] Close M<n> — full suite, coverage, evidence fit, milestone review`, and `## Now` reads:

   ```markdown
   ## Now
   Closing milestone M<n> · <name>
   Risk: <the milestone's risk lines, or UI only>
   Checks:
   - [ ] Full suite green on the archived state
   - [ ] Coverage: every non-dropped M<n> row links a plan whose reports pass it
   - [ ] Evidence fit: a fresh agent's sample shows each requirement delivered as written
   - [ ] Milestone review: no fix-now finding
   Open: none
   ```
2. **Close the milestone.** `jbit:verify`'s "Closing a milestone" runs the full suite, the coverage check and a fresh agent's evidence-fit sample, and writes `docs/evidence/milestone-M<n>.md`, a row per non-dropped requirement; then `jbit:review` runs the milestone review. Only when all pass, tick the milestone's box in `ROADMAP.md` and the close line in `## Stages`, and commit the tick with the evidence: the JBIT hook refuses a commit that ticks a milestone without `milestone-<ID>.md` holding a row for each of its non-dropped requirements.
3. **Close what's already covered.** After a tick, close each following milestone with no blank non-dropped row the same way, in order. A milestone whose rows are all dropped, or that has none, is ticked with a one-line dated note in the plan's decisions (`M3 ticked with no live requirements: all dropped`); it needs no evidence rows.
4. **Cut the plan's stages** from the new current milestone (its scope above), in this same plan file: Goal, a survey, a fresh Baseline, stages numbered from 1 under the ticked close line, tagged checks. Then show the user the plan and ask whether to start, as in Creating a plan. When the last milestone closes there's nothing to cut: say the roadmap is complete, set `## Now` to "Roadmap complete", and offer `jbit:plan` for whatever comes next.

**A failed close** keeps the box unticked. A red suite or a fix-now finding from the milestone review becomes this plan's stages: fix, re-verify, close again (the close line stays open, and the checks that failed stay unticked in the close's report). Where evidence fell short of a requirement (a coverage gap, the fit sample finding it undelivered), report it, and on the user's word clear that requirement's cell; the plan then takes it on as an open requirement of the milestone, cut into stages like any other. Never tick a box the close didn't pass.
