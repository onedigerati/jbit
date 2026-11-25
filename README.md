<h1 align="center">
  <picture>
    <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)" srcset="docs/assets/jbit-hero-dark.png">
    <source media="(prefers-reduced-motion: reduce)" srcset="docs/assets/jbit-hero-light.png">
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/jbit-hero-dark.webp">
    <img src="docs/assets/jbit-hero-light.webp" width="900" alt="JBIT. Just build it. Plans it. Proves it. Sees it through. A terminal where the user types “JBIT, just build it. Autopilot, lean.” and stages 1 to 3 tick off as proven and committed.">
  </picture>
</h1>

**JBIT** (*jay-bit*, for Just Build It). You bring the goal; JBIT **plans it**. Approve the plan and say `JBIT, just build it.` JBIT does the rest: it **proves it** and **sees it through**, logging the calls it makes for you and stopping before anything it can't take back.

It's a plugin for Claude Code—with generated packages for GitHub Copilot CLI, OpenAI Codex CLI, and Google Antigravity CLI—for long, multi-stage work, on new projects and existing ones. All project state lives in one plan file plus git, with no tracker or codebase map to keep current.

For a visual walkthrough (interactive autopilot simulation, the stage loop, guardrails and roadmaps), download [docs/field-guide.html](docs/field-guide.html) and open it in a browser.

## From goal to done

1. **You state a goal.** Say what you want built, or point Claude at a spec.
2. **One plan.** `/jbit:plan` writes `docs/PLAN.md`: the goal, stages with a risk line and acceptance checks you can observe, dated decisions and open questions. In existing code it surveys what the work touches and records a test baseline first. When the goal turns on facts outside the repo (a regulation, a standard, how an outside API really behaves), one research agent answers the questions that would change the plan and writes each answer, with dated sources, to `docs/research/<topic>.md`, and decisions resting on a finding link the note. A question paper can't settle becomes a `Spike:` stage, answered by a throwaway prototype. A goal with no such question skips research in one line. The plan's current position rides in Claude's context, so it survives long sessions and compaction, and new work either fits the goal or waits for the next plan.
3. **Build a stage.** `/jbit:stage` builds the next stage, fanning independent parts out to subagents as far as the plan's Agents line allows, each on the model and effort its Models line sets.
4. **Verify it, with evidence.** `/jbit:verify` runs the project's checks, then proves each acceptance check by a test or against the running product, and saves the report and output to `docs/evidence/stage-<n>/`.
5. **Review it.** The risk line is checked against what the code actually touches. Anything beyond UI gets a fresh-eyes review by an agent that didn't write it, with a security pass where it matters.
6. **Commit it.** One commit per stage, evidence included. Hooks refuse a commit that closes a stage without its evidence or carries a secret. Then it stops for your review.
7. **Autopilot sees it through.** `JBIT, just build it.` (or `/jbit:autopilot`) runs every remaining stage as project manager, without stopping in between. After each stage you get a notification and, when someone reads along, a short progress note: concerns first, what was delivered and how it was proven, and what's left. A headless run leaves the note to the final report. A concern (a check failing again, a review finding being fixed, a risk line that grows) is told in one line when it happens.
8. **Next plan.** When the goal is met, `/jbit:plan` archives the plan and its evidence and starts the next one fresh.

Any command also works by name at the start of a message, in any case: "JBIT plan a CSV tool", "JBit, resume", "jbit: verify". Along the way, `/jbit:fix` takes a small, low-risk change without a stage, `/jbit:charter` turns a PRD too big for one plan into a roadmap of milestones, and `/jbit:resume` picks things up after a break.

## Who's in charge

Once you've seen the plan, your own command runs autopilot unattended: a typed `/jbit:autopilot`, or a message that opens with "JBIT" and holds nothing but command words ("JBIT autopilot lean", "JBIT, just build it. Autopilot, lean."). Claude builds risky stages and settles open decisions itself, logging each one for you. It lasts until your next command or a new plan goal. It works in a headless run (`claude -p`) and on a session's first turn too, since the hook attaches the run's rules beside your command. A headless run leaves the progress note between stages to the final report, which covers each stage.

- Say `attended` in the command and it stops, enforced by hooks, before a risky stage (auth, money, personal data or your project's own risk words) until you approve it, and for decisions only you can make. A held stage gets no file edits outside the plan and its `docs/research/` notes.
- Say `outward` to let push, publish and deploy through; otherwise those stay blocked. Migrating or deleting real data and spending money still pause. The outward check covers shell commands, not web searches: research queries go out at any level, briefed to carry only the domain question. Reading isn't held: a read-only `curl` or `wget` GET passes, while anything that sends (a body, an upload, credentials, an auth or cookie header) waits, and the hold points to WebFetch and WebSearch for reading pages.
- Plain words without the name ("just build it", "take it from here") never set the level: they run at the one that stands, attended unless your own command set one for this plan. Your own plain reply ("yes", "just build it") approves a stage it's holding.
- Claude starting autopilot itself, a plugin's prompt or anything in a file never sets the level or approves a stage, and a Mode line left from an earlier session doesn't start a run.

It removes waiting, not checks: verification, the commit gates, the secret guard and the security review of risky stages stay, and it still stops when it's stuck and before building a plan you haven't seen.

## In short

- **State.** One plan file plus git. With a PRD too big for one plan, `docs/ROADMAP.md` adds milestones and a requirement ledger, and a milestone closes only on evidence that its requirements are covered.
- **Evidence.** Each verified stage leaves a per-check report and its output in `docs/evidence/`, committed with the stage. A stage can't be closed without its report. Under autopilot, a command line that writes the plan and commits is refused, and a close found only after a line ran is checked against its commit and flagged to reopen if it fails.
- **Agents level.** An `Agents: lean | wide` line in the plan sets how widely work fans out to subagents, trading tokens for wall-clock time; no line is balanced. `lean` is held to one running agent by a hook, and `wide` is honoured only once you confirm it in the session.
- **Models.** A `Models: build sonnet/medium · review opus/high` line in the plan sets the model and effort each delegated role's agents start on: `build`, `research`, `review` and `verify`, each `model/effort` (either half optional). Research agents get the `research` setting, so the research that once ran on the session's model can run on a cheaper one. A role the line leaves out takes your own default (or a confirmed project default) when there is one, else runs as the session. Set it with your own `JBIT models build sonnet/medium`; `JBIT models default` goes back to the project default (a `JBIT models:` line in `CLAUDE.md`), and `JBIT models none` removes the line. A project default counts only once you confirm it in the session, so a cloned repo's committed default never raises spend unasked. `JBIT models build sonnet/medium · research sonnet/high — my default` also saves the settings as your own default, kept outside every repo: a new plan in any repo starts from it. `JBIT models clear my default` removes it, and `JBIT models` alone shows where each role's setting comes from. The status line shows it, and the hook denies an agent started with a setting no role has. Planning and project management run in the main session, so they stay on the session's model: change that with `/model`. Only you set effort; Claude passes what the line names and never picks one.
- **Small agents.** A fan-out gives each agent a small batch, a few items at most (a nine-item research list goes to agents of at most three each), and every brief asks the agent to read narrowly, stop when its brief is done and hand back a short report (20 lines at most, no diffs or dumps): an agent's cost grows with its turns and context.
- **Project risk rules.** `JBIT risk:` and `JBIT outward:` lines in `CLAUDE.md` add your project's own hold words and outward commands. They only add to the built-ins, never loosen them.
- **Secret guard.** A commit that would carry a secret is blocked, and credential headers in evidence must be masked.

## Install

### Claude Code

```
claude plugin marketplace add onedigerati/jbit
claude plugin install jbit@jbit-local
```

### Other hosts (Copilot CLI, Codex CLI, Antigravity CLI)

Generated packages live in `plugins/jbit-copilot/`, `plugins/jbit-codex/`, and `plugins/jbit-antigravity/` (all require Node 22.18 or later):

- **GitHub Copilot CLI** — invoke as `/jbit:<name>` (bare `/plan`, `/review`, `/autopilot` are Copilot's own commands):
  ```
  copilot plugin marketplace add onedigerati/jbit
  copilot plugin install jbit@jbit-local
  ```
- **OpenAI Codex CLI** — invoke as `$jbit:<name>`, and trust the plugin's hooks on first startup and after every update (`/hooks` → "Trust all"):
  ```
  codex plugin marketplace add onedigerati/jbit
  codex plugin add jbit@jbit-local
  ```
- **Google Antigravity CLI (`agy`)** — invoke as `/jbit:<name>`; install by the package path, never the repo root:
  ```
  agy plugin install /path/to/jbit/plugins/jbit-antigravity
  ```

Because these three hosts run JBIT's hook as a per-event Node command instead of an in-process hook, they share a few differences from Claude Code (no in-memory stall counter or `lean` agent count, no hook-driven context compaction, and no worktree isolation for parallel builders). See [docs/hosts.md](docs/hosts.md) for local-clone installs, headless flags, Antigravity's `--settings` allow list, and each host's full gap list.

## Further reading

- [plugins/jbit/README.md](plugins/jbit/README.md) — full reference for every skill and hook, project risk rules, the secret guard, evidence, roadmaps, Agents levels, Models and evals.
- [docs/hosts.md](docs/hosts.md) — setup details, headless usage and known gaps for Copilot CLI, Codex CLI and Antigravity CLI.
