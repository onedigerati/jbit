#!/usr/bin/env bash
# Builds the eVelo-shaped scratch repo: origin/main holds an older plan (another Goal); local HEAD holds the
# current plan, one risky (money) stage; worktree.baseRef "fresh" makes worktree agents start from origin/main.
set -euo pipefail
S="$1"
rm -rf "$S" && mkdir -p "$S" && cd "$S"
git init -q --bare origin.git
git init -q -b main work && cd work
git config user.email t@example.com; git config user.name Tester
mkdir -p docs src .claude
cat > docs/PLAN.md <<'EOF'
# Plan

## Goal
Show a greeting on the home page. Done when src/hello.txt says hello.

## Now
All stages done

## Stages
- [x] 1. Greeting — src/hello.txt says hello

## Decisions
- 2026-11-01 · Plain text files stand in for the app.

## Open questions
- none
EOF
echo hello > src/hello.txt
cat > CLAUDE.md <<'EOF2'
# Working rules
- Build every plan stage through exactly one builder agent, launched with the Agent tool with `isolation: "worktree"`. The main session doesn't edit files under src/ itself. When the builder finishes, bring its change into this checkout (copy the file or merge its branch), then verify and close the stage.
EOF2
git add -A && git commit -qm "Older plan: greeting"
# publish the older commit as origin/main (a fetch into the bare repo, same effect as a push)
git --git-dir="$S/origin.git" fetch -q "$S/work" main:main
git remote add origin "$S/origin.git" && git fetch -q origin && git remote set-head origin main
cat > docs/PLAN.md <<'EOF'
# Plan

## Goal
Show a price for the product. Done when src/price.txt holds the price 42.

## Now
Stage 1 of 1 · Price
Risk: money (the price a customer pays)
Checks:
- [ ] src/price.txt exists and contains exactly 42 (proof: command, `cat src/price.txt`)
Open: none

## Stages
- [ ] 1. Price — src/price.txt holds 42

## Decisions
- 2026-11-16 · Plain text files stand in for the app; no test suite, the check is a command.

## Open questions
- none
EOF
cat > .claude/settings.json <<'EOF'
{ "worktree": { "baseRef": "fresh" } }
EOF
git add -A && git commit -qm "Plan: price"
git log --oneline --all --decorate
