# Stage 2 · Small agents — evidence
Verified 2026-11-16 on 9e9d06d, plus uncommitted changes

| Check | Result | Evidence |
|---|---|---|
| `plan` and `stage` say a fan-out (research or build) gives each agent a small batch, a few items at most (a nine-item research list goes to agents of at most three each), and say why: an agent's cost grows with its turns and context | pass | [docs-check.txt](docs-check.txt): `plan and stage give a fan-out small batches, a few items each, and say why: cost grows with turns and context` |
| `stage`, `autopilot` and `review` briefs tell each delegated agent to read narrowly (grep and read the lines it needs, not whole large files, no re-reading) and to stop when its brief is done | pass | [docs-check.txt](docs-check.txt): `stage, autopilot and review briefs tell each agent to read narrowly and stop when its brief is done` |
| Every delegating skill (plan, stage, autopilot, review, verify) asks for a short handoff report: what changed or was found, how it was checked, a line count cap, no diffs or file dumps | pass | [docs-check.txt](docs-check.txt): `every delegating skill asks for a short handoff report with a line cap and no diffs or dumps` (20 lines at most) |
| The rules cost nothing for small work: they say a single small item needs no split, and nothing in them adds an agent | pass | [docs-check.txt](docs-check.txt): `the small-agent rules cost nothing for small work: no split for a single small item, and they add no agent` |

Break check: with stage's "Keep each agent small" bullet removed, checks 39 and 42 fail ([break-check.txt](break-check.txt)); restored afterwards.

Project checks: type check n/a · lint n/a · tests 514/514 ([tests.txt](tests.txt)) · docs checks 42/42 ([docs-check.txt](docs-check.txt)) · validate pass ([validate.txt](validate.txt))
Audit: no package manifest or lockfile in the repo; `npm audit` does not apply
