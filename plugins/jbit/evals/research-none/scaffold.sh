#!/usr/bin/env bash
# A tiny working CLI with tests and no plan yet. The requested feature (a --min filter) turns on nothing outside the
# repo, so jbit:plan should skip research in one line.
set -euo pipefail
mkdir -p src test
cat > package.json <<'JSON'
{ "name": "tally", "version": "1.0.0", "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > README.md <<'MD'
# tally
Totals expense rows from a CSV (date,amount). `node src/cli.js file.csv` prints the total.
MD
cat > src/tally.js <<'JS'
// Sums the amounts in a list of { amount } rows, in cents.
export function total(rows) {
  return rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0)
}
JS
cat > src/cli.js <<'JS'
import { readFileSync } from 'node:fs'
import { total } from './tally.js'
const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').slice(1).map(l => ({ amount: Number(l.split(',')[1]) }))
console.log((total(rows) / 100).toFixed(2))
JS
cat > test/tally.test.js <<'JS'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { total } from '../src/tally.js'
test('sums amounts in cents', () => assert.equal(total([{ amount: 0.29 }, { amount: 1.1 }]), 139))
JS
git init -q
# a repo-local author, so the agent can commit on a machine with no global git identity
git config user.name eval
git config user.email eval@example.com
git add -A
git commit -qm "tally 1.0.0"
