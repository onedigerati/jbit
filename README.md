<h1 align="center">
  <picture>
    <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)" srcset="docs/assets/jbit-hero-dark.png">
    <source media="(prefers-reduced-motion: reduce)" srcset="docs/assets/jbit-hero-light.png">
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/jbit-hero-dark.webp">
    <img src="docs/assets/jbit-hero-light.webp" width="900" alt="JBIT. Just build it. Plans it. Proves it. Sees it through. A terminal where the user types “JBIT, just build it. Autopilot, lean.” and stages 1 to 3 tick off as proven and committed.">
  </picture>
</h1>

**JBIT** (*jay-bit*, for Just Build It). You bring the goal; JBIT **plans it**. Approve the plan and say `JBIT, just build it.` JBIT does the rest: it **proves it** and **sees it through**, logging the calls it makes for you and stopping before anything it can't take back.

It's a Claude Code plugin for long, multi-stage work, on new projects and existing ones. All project state lives in one plan file plus git, with no tracker or codebase map to keep current.

For a visual walkthrough (interactive autopilot simulation, the stage loop, guardrails and roadmaps), download [docs/field-guide.html](docs/field-guide.html) and open it in a browser.

## From goal to done

1. **You state a goal.** Say what you want built, or point Claude at a spec.
2. **One plan.** `/jbit:plan` writes `docs/PLAN.md`: the goal, stages with a risk line and acceptance checks you can observe, dated decisions and open questions. In existing code it surveys what the work touches and records a test baseline first. When the goal turns on facts outside the repo (a regulation, a standard, how an outside API really behaves), one research agent answers the questions that would change the plan and writes each answer, with dated sources, to `docs/research/<topic>.md`, and decisions resting on a finding link the note. A question paper can't settle becomes a `Spike:` stage, answered by a throwaway prototype. A goal with no such question skips research in one line. The plan's current position rides in Claude's context, so it survives long sessions and compaction, and new work either fits the goal or waits for the next plan.
3. **Build a stage.** `/jbit:stage` builds the next stage, fanning independent parts out to subagents as far as the plan's Agents line allows.
4. **Verify it, with evidence.** `/jbit:verify` runs the project's checks, then proves each acceptance check by a test or against the running product, and saves the report and output to `docs/evidence/stage-<n>/`.
5. **Review it.** The risk line is checked against what the code actually touches. Anything beyond UI gets a fresh-eyes review by an agent that didn't write it, with a security pass where it matters.
6. **Commit it.** One commit per stage, evidence included. Hooks refuse a commit that closes a stage without its evidence or carries a secret. Then it stops for your review.
7. **Autopilot sees it through.** `JBIT, just build it.` (or `/jbit:autopilot`) runs every remaining stage as project manager, without stopping in between. After each stage you get a notification and a short progress note: concerns first, what was delivered and how it was proven, and what's left. A concern (a check failing again, a review finding being fixed, a risk line that grows) is told in one line when it happens.
8. **Next plan.** When the goal is met, `/jbit:plan` archives the plan and its evidence and starts the next one fresh.

Any command also works by name at the start of a message, in any case: "JBIT plan a CSV tool", "JBit, resume", "jbit: verify". Along the way, `/jbit:fix` takes a small, low-risk change without a stage, `/jbit:charter` turns a PRD too big for one plan into a roadmap of milestones, and `/jbit:resume` picks things up after a break.

## Who's in charge

Once you've seen the plan, your own command runs autopilot unattended: a typed `/jbit:autopilot`, or a message that opens with "JBIT" and holds nothing but command words ("JBIT autopilot lean", "JBIT, just build it. Autopilot, lean."). Claude builds risky stages and settles open decisions itself, logging each one for you. It lasts until your next command or a new plan goal. It works in a headless run (`claude -p`) and on a session's first turn too, since the hook attaches the run's rules beside your command. A headless run leaves the progress note between stages to the final report, which covers each stage.

- Say `attended` in the command and it stops, enforced by hooks, before a risky stage (auth, money, personal data or your project's own risk words) until you approve it, and for decisions only you can make. A held stage gets no file edits outside the plan and its `docs/research/` notes.
- Say `outward` to let push, publish and deploy through; otherwise those stay blocked. Migrating or deleting real data and spending money still pause. The outward check covers shell commands, not web searches: research queries go out at any level, briefed to carry only the domain question.
- Plain words without the name ("just build it", "take it from here") never set the level: they run at the one that stands, attended unless your own command set one for this plan. Your own plain reply ("yes", "just build it") approves a stage it's holding.
- Claude starting autopilot itself, a plugin's prompt or anything in a file never sets the level or approves a stage, and a Mode line left from an earlier session doesn't start a run.

It removes waiting, not checks: verification, the commit gates, the secret guard and the security review of risky stages stay, and it still stops when it's stuck and before building a plan you haven't seen.

## Moving over from keel

JBIT was called keel up to 0.11.0. To switch an existing install:

```
claude plugin uninstall keel@keel-local
claude plugin marketplace remove keel-local
claude plugin marketplace add onedigerati/jbit
claude plugin install jbit@jbit-local
```

Use the path to your local clone in place of `onedigerati/jbit` if you install from a clone, then start a new session. Commands are now `/jbit:*`; the old `/keel:*` commands no longer exist. Your repos need no edits: `Keel risk:` and `Keel outward:` lines in `CLAUDE.md` and `keel:allow-secret` markers still work, alongside `JBIT risk:`, `JBIT outward:` and `jbit:allow-secret`.

## In short

- **State.** One plan file plus git. With a PRD too big for one plan, `docs/ROADMAP.md` adds milestones and a requirement ledger, and a milestone closes only on evidence that its requirements are covered.
- **Evidence.** Each verified stage leaves a per-check report and its output in `docs/evidence/`, committed with the stage. A stage can't be closed without its report.
- **Agents level.** An `Agents: lean | wide` line in the plan sets how widely work fans out to subagents, trading tokens for wall-clock time; no line is balanced. `lean` is held to one running agent by a hook, and `wide` is honoured only once you confirm it in the session.
- **Project risk rules.** `JBIT risk:` and `JBIT outward:` lines in `CLAUDE.md` add your project's own hold words and outward commands. They only add to the built-ins, never loosen them.
- **Secret guard.** A commit that would carry a secret is blocked, and credential headers in evidence must be masked.

## Install

```
claude plugin marketplace add onedigerati/jbit
claude plugin install jbit@jbit-local
```

See [plugins/jbit/README.md](plugins/jbit/README.md) for the full story, every skill and hook, project risk rules, the secret guard, evidence, roadmaps, Agents levels and evals.
