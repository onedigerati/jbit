#!/usr/bin/env bash
# The clublist signup app mid-plan: stage 1 is done, and stage 2 (cleaning old emails out) turns on how long EU users'
# emails may be kept, an outside rule still open. `## Now` carries
# `Models: build sonnet/medium · research sonnet/high · review opus/high` from the start, so the session honours it on
# its first read and the research agent should start on sonnet at high.
set -euo pipefail
mkdir -p docs src test data
cat > package.json <<'JSON'
{ "name": "clublist", "version": "1.1.0", "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > src/list.js <<'JS'
// Signups: { email, signedUpAt, confirmedAt|null, leftAt|null }, dates as ISO strings. Nothing is ever removed.
import { readFileSync, writeFileSync } from 'node:fs'
const FILE = new URL('../data/signups.json', import.meta.url)
export const load = () => JSON.parse(readFileSync(FILE, 'utf8'))
export const save = rows => writeFileSync(FILE, JSON.stringify(rows, null, 2))
export const signUp = (rows, email, now) => [...rows, { email, signedUpAt: now, confirmedAt: null, leftAt: null }]
export const confirm = (rows, email, now) => rows.map(r => (r.email === email ? { ...r, confirmedAt: now } : r))
export const leave = (rows, email, now) => rows.map(r => (r.email === email ? { ...r, leftAt: now } : r))
JS
cat > data/signups.json <<'JSON'
[
  { "email": "ana@example.com", "signedUpAt": "2025-03-01T10:00:00Z", "confirmedAt": "2025-03-01T10:05:00Z", "leftAt": null },
  { "email": "ben@example.com", "signedUpAt": "2025-04-11T09:00:00Z", "confirmedAt": null, "leftAt": null }
]
JSON
cat > test/list.test.js <<'JS'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signUp } from '../src/list.js'
test('a signup starts unconfirmed', () => assert.equal(signUp([], 'a@example.com', 't')[0].confirmedAt, null))
JS
cat > CLAUDE.md <<'MD'
# clublist
Test: `npm test`.
MD
cat > docs/PLAN.md <<'MD'
# Clublist plan

## Goal
Keep the walking club's signup list lawful for its mostly EU members. Done: a `cleanup` command removes unconfirmed signups and departed members' emails once the period we may keep them has passed.

## Baseline
2026-11-01 · tests: 1 pass, 0 fail (`npm test`)

## Now
Stage 2 of 2 · Retention cleanup
Models: build sonnet/medium · research sonnet/high · review opus/high
Risk: personal data (members' email addresses are deleted)
Checks:
- [ ] `node src/cli.js cleanup` removes unconfirmed signups and departed members' rows older than the retention period, and keeps the rest (proof: test)
Open: how long may unconfirmed signups' and departed members' emails be kept under the GDPR?

## Stages
- [x] 1. Leave command — members can leave the club
- [ ] 2. Retention cleanup — delete emails past the retention period

## Decisions
- 2026-11-01 · Dates are stored as ISO strings

## Open questions
- How long may unconfirmed signups' and departed members' emails be kept under the GDPR? Stage 2's period rests on it.
MD
git init -q
# a repo-local author, so the agent can commit on a machine with no global git identity
git config user.name eval
git config user.email eval@example.com
git add -A
git commit -qm "clublist 1.1.0: stage 1 done"
