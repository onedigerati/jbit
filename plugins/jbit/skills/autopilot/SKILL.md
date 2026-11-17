---
name: autopilot
description: Take over an approved plan as its project manager and see it through — run every remaining stage through build, verify, review and commit without stopping between stages, and come back to the user only when something is stuck or theirs to decide. Use when the user approves a plan and says to run it, "just build it", take it from here, see it through, or put it on autopilot; also when a message opens with "JBIT autopilot" or "JBIT, just build it" (any case, after a space, comma or colon), which works as `/jbit:autopilot`.
---

# Autopilot

Autopilot runs a plan the user has seen and approved. With no plan, or one the user hasn't seen, run `jbit:plan` first and get their yes before building.

## Your role

You are the project manager. Run each remaining stage as `jbit:stage` does, except that builders build and you don't stop between stages:

1. Scope it from the plan: its checks, risk line and the decisions that bear on it.
2. Hand the build to `builder` agents, split along independent parts. Start a role agent by its bare name (`builder`) when the session's agent list has it, else as `jbit:builder`, and never pass `model` or `effort` on the Agent call: the user sets those in the role's agent file. Each brief names the stage, its checks, the files in play and the applicable decisions, and asks the agent to read narrowly, stop when the brief is done, and hand back a report of 20 lines at most.
3. Prove the stage independently: run `jbit:verify`, or start a fresh `verifier` agent the same way, with evidence in `docs/evidence/stage-<n>/`. A builder's word is not proof.
4. Review risky stages with `/code-review` and `/security-review` as `jbit:stage` says. Fix what must be fixed now; log the rest.
5. Update the plan (stage ticked, `## Now` moved on, decisions logged) and commit the stage alone.

## Judgement calls

Calls inside the plan's intent are yours (a library, a name, an edge case the plan didn't spell out). Log each in the plan's decisions, dated and marked `(autopilot)`, with a one-line reason.

## When to stop for the user

Stop only when:

- a check still fails after three fix rounds;
- a builder's report and the evidence disagree and you can't settle it;
- the plan proves wrong and the Goal or scope would have to change;
- the next step is outward or hard to undo: push, publish, deploy, send data out, migrate or delete real data, spend money (permission modes also gate these).

To stop, commit what is finished and verified (never half a stage), then tell the user in a few lines what you need and recommend.

## Concerns don't wait

Some things the user should hear before the run ends, though they don't stop it: a check failing after the second fix round, a must-fix review finding, a risk line that grows. Say each in one line, `Concern: <what> — <what you're doing about it>`, and carry on.

## Progress notes

After each stage's commit, when someone is reading along, note briefly:

- concerns, or `No concerns.`;
- what the stage delivered and how it was proven, linking its evidence report;
- the `(autopilot)` decisions it made;
- what's left.

A headless `claude -p` run skips these and leaves everything to the final report.

## Long runs

Keep your context lean: diffs, logs and test output stay with the agents; work from their reports and the evidence files. A run can span turns; the user's go or `/loop` continues it from `## Now`.

## Finish

After the last stage's commit, report:

1. the `(autopilot)` decisions first, so the user can overrule them;
2. what was delivered against the Goal;
3. a line per stage: what it did and where its evidence is;
4. what was deferred, and why;
5. what you'd check before shipping.

With a roadmap, a milestone's close is a stop: cut the next plan with `jbit:plan` and wait for the user's yes.
