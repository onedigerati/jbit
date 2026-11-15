#!/usr/bin/env bash
# A tiny CSV totals CLI mid-plan: stage 1 (a "Total: " label) is small, UI only and ready to build, and stage 2 (a row
# count) is left after it, so a headless autopilot run builds both and its final report covers each stage.
set -euo pipefail
mkdir -p docs src test
cat > package.json <<'JSON'
{ "name": "tally", "version": "1.0.0", "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > sample.csv <<'CSV'
date,amount
2026-11-01,0.29
2026-11-02,1.10
CSV
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
cat > CLAUDE.md <<'MD'
# tally
Run: `node src/cli.js sample.csv`. Test: `npm test`.
MD
cat > docs/PLAN.md <<'MD'
# Tally plan

## Goal
A tiny CLI that totals expense rows from a CSV, for one person tracking spending. Done: `node src/cli.js file.csv` prints a labelled total and the row count.

## Baseline
2026-11-01 · tests: 1 pass, 0 fail (`npm test`)

## Now
Stage 1 of 2 · Total label
Risk: UI only
Checks:
- [ ] `node src/cli.js sample.csv` prints `Total: 1.39` (proof: test that runs the CLI on sample.csv)
Open: none

## Stages
- [ ] 1. Total label — the CLI prints `Total: ` before the amount
- [ ] 2. Row count — the CLI prints `Rows: <n>` after the total

## Decisions
- 2026-11-01 · Amounts are summed in integer cents — floats drift

## Open questions
- none
MD
git init -q
# a repo-local author, so the agent can commit on a machine with no global git identity
git config user.name eval
git config user.email eval@example.com
git add -A
git commit -qm "Plan: tally labels"
