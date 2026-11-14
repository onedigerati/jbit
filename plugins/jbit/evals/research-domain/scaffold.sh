#!/usr/bin/env bash
# A tiny signup-list app with no plan yet. The requested cleanup turns on an outside rule (how long EU users' emails
# may be kept), so jbit:plan should research it before cutting stages.
set -euo pipefail
mkdir -p src test
cat > package.json <<'JSON'
{ "name": "clublist", "version": "1.0.0", "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > README.md <<'MD'
# clublist
The signup list for a walking club. People sign up with an email, confirm it from a link, and leave when they quit.
Members are mostly in the EU. `node src/cli.js list` prints the list.
MD
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
cat > src/cli.js <<'JS'
import { load } from './list.js'
if (process.argv[2] === 'list') for (const r of load()) console.log(r.email, r.confirmedAt ? 'confirmed' : 'unconfirmed', r.leftAt ? 'left' : '')
JS
mkdir -p data
cat > data/signups.json <<'JSON'
[
  { "email": "ana@example.com", "signedUpAt": "2025-03-01T10:00:00Z", "confirmedAt": "2025-03-01T10:05:00Z", "leftAt": null },
  { "email": "ben@example.com", "signedUpAt": "2025-04-11T09:00:00Z", "confirmedAt": null, "leftAt": null },
  { "email": "cleo@example.com", "signedUpAt": "2024-06-02T18:30:00Z", "confirmedAt": "2024-06-02T18:31:00Z", "leftAt": "2025-01-15T12:00:00Z" }
]
JSON
cat > test/list.test.js <<'JS'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signUp, confirm, leave } from '../src/list.js'
test('a signup starts unconfirmed', () => assert.equal(signUp([], 'a@example.com', 't')[0].confirmedAt, null))
test('confirm and leave stamp the row', () => {
  const rows = leave(confirm(signUp([], 'a@example.com', 't0'), 'a@example.com', 't1'), 'a@example.com', 't2')
  assert.deepEqual([rows[0].confirmedAt, rows[0].leftAt], ['t1', 't2'])
})
JS
git init -q
# a repo-local author, so the agent can commit on a machine with no global git identity
git config user.name eval
git config user.email eval@example.com
git add -A
git commit -qm "clublist 1.0.0"
