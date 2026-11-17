#!/usr/bin/env bash
# A tiny invoice CLI with no plan yet. The requested feature turns on nine outside facts (each country's standard VAT
# rate and its rate for e-books), so jbit:plan's research step has a nine-item list to split across small agents.
# The research batches may run side by side.
set -euo pipefail
mkdir -p src test
cat > package.json <<'JSON'
{ "name": "invoicer", "version": "1.0.0", "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > README.md <<'MD'
# invoicer
Prints an invoice for an e-book shop: `node src/cli.js <price> <country>`. Today it adds no VAT.
MD
cat > src/invoice.js <<'JS'
// An invoice line: { net, vat, gross }. VAT is always 0 today.
export const invoice = net => ({ net, vat: 0, gross: net })
JS
cat > src/cli.js <<'JS'
import { invoice } from './invoice.js'
console.log(JSON.stringify(invoice(Number(process.argv[2]))))
JS
cat > test/invoice.test.js <<'JS'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invoice } from '../src/invoice.js'
test('no VAT yet', () => assert.deepEqual(invoice(10), { net: 10, vat: 0, gross: 10 }))
JS
cat > CLAUDE.md <<'MD'
# invoicer
Test: `npm test`.
MD
git init -q
# a repo-local author, so the agent can commit on a machine with no global git identity
git config user.name eval
git config user.email eval@example.com
git add -A
git commit -qm "invoicer 1.0.0"
