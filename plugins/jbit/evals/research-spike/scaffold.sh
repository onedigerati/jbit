#!/usr/bin/env bash
# A tiny CSV totals CLI with a vendored streaming parser nobody has tried. Whether it keeps memory flat on a 2 GB
# export with multi-line quoted fields isn't written down anywhere: only running it answers that, so jbit:plan
# should make it a Spike stage.
set -euo pipefail
mkdir -p src test vendor/rowstream
cat > package.json <<'JSON'
{ "name": "tally", "version": "1.0.0", "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > README.md <<'MD'
# tally
Totals expense rows from a bank's CSV export (date,amount,memo). `node src/cli.js file.csv` prints the total.
MD
cat > src/tally.js <<'JS'
// Sums the amounts in a list of { amount } rows, in cents.
export function total(rows) {
  return rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0)
}
JS
cat > src/cli.js <<'JS'
// Reads the whole file into memory and splits on newlines: fine for small exports, wrong for quoted memos.
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
cat > vendor/rowstream/README.md <<'MD'
# rowstream 0.3.1
Streams CSV rows from a file.

    import { rows } from './index.js'
    for await (const row of rows('export.csv')) console.log(row)

Each row is an array of strings. Vendored from an internal tool; no tests, no benchmarks.
MD
cat > vendor/rowstream/index.js <<'JS'
import { createReadStream } from 'node:fs'
export async function* rows(path) {
  let field = '', row = [], quoted = false, pending = []
  for await (const chunk of createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 16 })) {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i]
      if (quoted) {
        if (c === '"' && chunk[i + 1] === '"') { field += '"'; i++ }
        else if (c === '"') quoted = false
        else field += c
      } else if (c === '"') quoted = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field.replace(/\r$/, '')); pending.push(row); row = []; field = '' }
      else field += c
    }
    while (pending.length) yield pending.shift()
  }
  if (field || row.length) { row.push(field); yield row }
}
JS
git init -q
# a repo-local author, so the agent can commit on a machine with no global git identity
git config user.name eval
git config user.email eval@example.com
git add -A
git commit -qm "tally 1.0.0 with vendored rowstream"
