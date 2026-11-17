<h1 align="center">
  <picture>
    <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)" srcset="docs/assets/jbit-hero-dark.png">
    <source media="(prefers-reduced-motion: reduce)" srcset="docs/assets/jbit-hero-light.png">
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/jbit-hero-dark.webp">
    <img src="docs/assets/jbit-hero-light.webp" width="900" alt="JBIT. Just build it. Plans it. Proves it. Sees it through. A terminal where the user types “JBIT, just build it.” and stages 1 to 3 tick off as proven and committed.">
  </picture>
</h1>

**JBIT** (*jay-bit*, for Just Build It). You bring the goal; JBIT **plans it**. Approve the plan and say `JBIT, just build it.` JBIT does the rest: it **proves it** and **sees it through**, logging the calls it makes for you and stopping before anything it can't take back.

It's a Claude Code plugin for long, multi-stage work, on new projects and existing ones. All project state lives in one plan file plus git, with no tracker or codebase map to keep current.

For a visual walkthrough (the stage loop, autopilot and roadmaps), download [docs/field-guide.html](docs/field-guide.html) and open it in a browser.

## From goal to done

1. **You state a goal.** Say what you want built, or point Claude at a spec.
2. **One plan.** `/jbit:plan` writes `docs/PLAN.md`: the goal, stages with a risk line and acceptance checks you can observe, dated decisions and open questions. In existing code it surveys what the work touches and records a test baseline first. Facts from outside the repo are researched into dated, sourced notes in `docs/research/`. The plan's `## Now` rides in Claude's context, so it survives long sessions and compaction.
3. **Build a stage.** `/jbit:stage` builds the next stage, handing independent parts to builder agents.
4. **Verify it, with evidence.** `/jbit:verify` runs the project's checks, proves each acceptance check by a test or against the running product, and saves the report and output to `docs/evidence/stage-<n>/`.
5. **Review it.** The risk line is checked against what the code actually touches. Anything beyond UI gets `/code-review`, plus `/security-review` where it matters.
6. **Commit it.** One commit per stage, evidence included. Then it stops for your review.
7. **Autopilot sees it through.** `JBIT, just build it.` (or `/jbit:autopilot`) runs the remaining stages in a row, logging each call it makes as an `(autopilot)` decision. It stops when a check still fails after three fix rounds, when a report and the evidence disagree, when the Goal or scope would change, and before anything outward or hard to undo. Your go or `/loop` carries it across turns.
8. **Next plan.** When the goal is met, `/jbit:plan` archives the plan and its evidence and starts the next one fresh.

Any command also works by name at the start of a message, in any case: "JBIT plan a CSV tool", "JBit, resume", "jbit: verify". Along the way, `/jbit:stage` takes a small, low-risk change as a quick fix (one line under `## Fixes`, committed alone), `/jbit:charter` turns a PRD too big for one plan into a roadmap of milestones, and `/jbit:resume` picks things up after a break.

## In short

- **State.** One plan file plus git. With a PRD too big for one plan, `docs/ROADMAP.md` adds milestones and a requirement ledger, and a milestone closes only on evidence that its requirements are covered.
- **Evidence.** Each verified stage leaves a per-check report and its output in `docs/evidence/`, committed with the stage.
- **Role agents.** `builder`, `reviewer`, `verifier` and `researcher` run as the session by default. To pick a model and effort for a role, copy its file to `.claude/agents/<role>.md` (one project) or `~/.claude/agents/<role>.md` (every repo) and change `model:` and `effort:`.
- **Hook.** It puts the plan's `## Now` in Claude's context, with a status line, and refuses a commit that carries a secret (`jbit:allow-secret` marks a false positive).
- **Safety.** Push, deploy and other outward steps are left to Claude Code's permission modes and sandbox; autopilot stops before them.

## Install

```
claude plugin marketplace add onedigerati/jbit
claude plugin install jbit@jbit-local
```

Upgrading from 0.18? `/jbit:fix`, `/jbit:approve`, `/jbit:review`, the Agents and Models lines and the autopilot levels are gone; old lines in your plans are ignored. See [plugins/jbit/README.md](plugins/jbit/README.md) for that, every skill, role agents, evidence, roadmaps, the hook and evals.
