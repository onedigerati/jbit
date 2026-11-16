#!/usr/bin/env bash
# A tiny slug library with a plan and no Models line. The user's own `JBIT models … — my default` should set the line
# for this plan and save it as their default for every repo. The eval can't seed or read the per-user store from
# another session, so the cross-repo part (a fresh session in a second repo starting its plan from the saved default)
# is proven by a headless run, not here.
set -euo pipefail
mkdir -p docs src test
cat > package.json <<'JSON'
{ "name": "slugs", "version": "1.0.0", "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > src/index.js <<'JS'
// Public entry point; stage 1 adds slugify.
export {}
JS
cat > test/index.test.js <<'JS'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as lib from '../src/index.js'
test('the entry point loads', () => assert.equal(typeof lib, 'object'))
JS
cat > CLAUDE.md <<'MD'
# slugs
Test: `npm test`.
MD
cat > docs/PLAN.md <<'MD'
# Slugs plan

## Goal
A tiny library that turns titles people type into URL slugs, for a small blog. Done: `slugify(title)` returns a lowercase, hyphenated, ASCII slug and refuses input it can't use.

## Baseline
2026-11-01 · tests: 1 pass, 0 fail (`npm test`)

## Now
Stage 1 of 1 · Slugify
Risk: user input (titles typed by people, passed straight to the function)
Checks:
- [ ] `slugify(title)` in `src/slug.js`, exported from `src/index.js`, lowercases and hyphenates (proof: test)
Open: none

## Stages
- [ ] 1. Slugify — `slugify(title)` with tests

## Decisions
- 2026-11-01 · Slugs are ASCII only

## Open questions
- none
MD
git init -q
# a repo-local author, so the agent can commit on a machine with no global git identity
git config user.name eval
git config user.email eval@example.com
git add -A
git commit -qm "Plan: slugify"
