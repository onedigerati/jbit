# JBIT

JBIT (`/jbit:plan`, `/jbit:stage`, `/jbit:autopilot` and the other `/jbit:<name>` skills) runs a project from one plan file, `docs/PLAN.md`.

- **Read `CLAUDE.md` first.** A project using JBIT keeps its working rules in `CLAUDE.md` at the repo root, which this host doesn't load. At the start of a session, and before any JBIT skill, read that file if it exists and follow it as you would `AGENTS.md`. Where a skill reads or writes `CLAUDE.md`, use that file, not `AGENTS.md`; JBIT never writes the project's `AGENTS.md`.
- **Skills.** Type a skill as `/jbit:<name>` (for example `/jbit:plan`); that form expands it. When a skill says to run another JBIT skill, open that skill's `SKILL.md` and follow it.
- **Host names.** Each JBIT skill ends with an "On Antigravity CLI" section that maps the names its text and its hook's messages use to this host's tools. Read it before acting on a skill.
