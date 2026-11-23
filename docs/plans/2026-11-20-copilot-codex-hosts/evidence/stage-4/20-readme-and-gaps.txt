# Stage 4 check 4: README Copilot CLI section and generated gap list (2026-11-20T18:18:57Z)

$ node --test 'hosts/**/*.test.mjs'   (lines for each test, then totals)
exit 0
ok 1 - building twice gives identical bytes, and the second run writes nothing
ok 2 - the committed package is current: --check passes on the repo
ok 3 - plugin.json, marketplace and hooks.json follow the spike's working layout
ok 4 - skills keep bare names and get one mapping section at the end
ok 5 - scripts are copied with their imports rewritten inside the package, and a source hash manifest
ok 6 - frontmatter scalars a strict YAML parser would reject are quoted (Copilot failed on `: ` in a description)
ok 7 - drift: --check fails when a skill changed, and passes after a rebuild
ok 8 - drift: --check fails when a hook module changed, and passes after a rebuild
ok 9 - drift: --check fails when a core module changed, and passes after a rebuild
ok 10 - drift: --check fails when the capability file changed, and passes after a rebuild
ok 11 - drift: a stray file in the package, or an edited generated file, fails --check
ok 12 - README gap list: the root README's block lists every capability.json gap, in order, and nothing else
ok 13 - README gap list: a gap changed in capability.json fails --check naming README.md, and a rebuild fixes it
ok 14 - README gap list: a hand edit inside the block fails --check; prose outside it is the README's own
ok 15 - README gap list: a README without the markers fails the build
ok 16 - leak check: the real output has no leak
ok 17 - leak check: a Claude-only name planted outside the mapping section fails the build and --check
ok 18 - leak check: the same names inside the mapping section are allowed
ok 19 - --check also leak-scans the files on disk: a hand-planted term outside the mapping section reports leak:
ok 20 - Copilot wording: no compaction promise, lowercase explore agents, security-review marked as listed but unseen
ok 21 - a substitution that no longer matches its source fails the build
ok 22 - a rewrite that no longer matches fails the build
ok 23 - an import that leaves the package fails the build
ok 24 - a hooks.json event the hook does not handle fails the build
ok 25 - the generated hook, copied alone outside the repo, denies `git push` under armed autopilot
ok 26 - the repo's own generated hook denies `git push` under armed autopilot
ok 27 - parsePatch reads Add, Update, Delete and Move to
ok 28 - parsePatch reads the captured spike patch
ok 29 - parsePatch refuses what it cannot read
ok 30 - parsePatch tolerates CRLF and surrounding blank lines
ok 31 - paths resolve against the project, normalising .., absolute paths and symlinks
ok 32 - mapTool maps Copilot tools to the Claude tool calls the core judges
ok 33 - mapTool: a toolArgs of the wrong type never means allow
ok 34 - mapTool: unknown tools carrying a path or a command are denied, naming the tool
ok 35 - preToolUse: a commit with a secret staged is denied
ok 36 - preToolUse: a commit closing a stage with an unticked check is denied
ok 37 - preToolUse: in a held stage, writes and builder agents are denied through every Copilot tool
ok 38 - preToolUse: outside a held stage the same calls go through
ok 39 - preToolUse: an unparseable patch and wrong-typed args are denied even with no plan
ok 40 - preToolUse: unknown tools carrying a path or command are denied, naming the tool
ok 41 - preToolUse: an outward command under autopilot is denied
ok 42 - no project dir: guarded tools are denied and prompts get no context
ok 43 - COPILOT_PROJECT_DIR stands in when stdin has no cwd
ok 44 - a crash in the core fails closed for preToolUse and stays silent elsewhere
ok 45 - userPromptTransformed appends the plan to transformedPrompt, never replacing it
ok 46 - sessionStart gives the plan as additionalContext
ok 47 - agentStop blocks while autopilot is armed with stages left, and not otherwise
ok 48 - S1: git output past the buffer limit fails the commit check closed
ok 49 - S2: a lone carriage return or an indented directive makes a patch unparseable
ok 50 - C1: the model starting jbit:autopilot after the user asked arms autopilot
ok 51 - C1: a skill call with no user prompt before it does not arm
ok 52 - C2: a run that pauses tells the user at the next prompt
ok 53 - C3: a prompt composes before it submits, as Claude Code does
ok 54 - C4: on a Node without TypeScript stripping, the deny says what Node it needs
ok 55 - C5: the held notice is said once per stage, not at every turn end
ok 56 - C5/C6: the unheld notice is said once, even across a multi-file patch and later calls
ok 57 - C7: removed keys drop their versions, and stale post: keys are pruned
ok 58 - C8: Windows backslash and drive-letter paths are denied with a reason
ok 59 - copilot parity: a commit closing a stage with an unticked check is denied
ok 60 - copilot parity: a stage close without an evidence report is denied
ok 61 - copilot parity: a stage close with its checks ticked and its report passes
ok 62 - copilot parity: a secret in a staged commit is denied, named by kind and never by value
ok 63 - copilot parity: a clean commit passes
ok 64 - copilot parity: under attended autopilot, an edit in a held risky stage is denied, the plan itself is not
ok 65 - copilot parity: under attended autopilot, a builder agent in a held risky stage is denied
ok 66 - copilot parity: the user's approval releases a held stage
ok 67 - copilot parity: an outward command under autopilot is denied
ok 68 - copilot parity: turn end under armed autopilot with stages left keeps the run going
ok 69 - copilot parity: turn end without autopilot lets the turn end
ok 70 - copilot parity: a prompt carries the plan's \#\# Now into context
# tests 70
# pass 70
# fail 0

$ node --test hosts/build.test.mjs   (subtests named 'README gap list')
# Subtest: README gap list: the root README's block lists every capability.json gap, in order, and nothing else
ok 12 - README gap list: the root README's block lists every capability.json gap, in order, and nothing else
# Subtest: README gap list: a gap changed in capability.json fails --check naming README.md, and a rebuild fixes it
ok 13 - README gap list: a gap changed in capability.json fails --check naming README.md, and a rebuild fixes it
# Subtest: README gap list: a hand edit inside the block fails --check; prose outside it is the README's own
ok 14 - README gap list: a hand edit inside the block fails --check; prose outside it is the README's own
# Subtest: README gap list: a README without the markers fails the build
ok 15 - README gap list: a README without the markers fails the build
# pass 26
# fail 0

$ node hosts/build.mjs copilot --check
copilot: up to date (27 files)
exit 0

$ node --test plugins/jbit/tests/docs.check.mjs
exit 0
# tests 51
# pass 51
# fail 0

$ claude plugin validate .
Validating marketplace manifest: $REPO/.claude-plugin/marketplace.json

Validating hooks: $REPO/plugins/jbit/hooks/hooks.json

  ❯ ./register.ts hooks: prompt.compose, session.compact, turn.start, prompt.submit, turn.complete, tool.call{tool=Skill}, tool.call, tool.call{tool=Agent}, tool.call{tool=Agent}, tool.call{tool=Bash}
  ❯ ./register.ts gating hook with .catch: session.compact
  ❯ ./register.ts gating hook with .catch: prompt.submit
  ❯ ./register.ts gating hook with .catch: tool.call{tool=Skill}
  ❯ ./register.ts gating hook with .catch: tool.call
  ❯ ./register.ts gating hook with .catch: tool.call{tool=Agent}
  ❯ ./register.ts gating hook with .catch: tool.call{tool=Agent}
  ❯ ./register.ts gating hook with .catch: tool.call{tool=Bash}
  ❯ ./register.ts calls: $.agent.list (via backgroundBusy), $.clock.after, $.clock.now (via clockNow), $.fs.exists, $.fs.read (via evidenceDenial, loadProjectRules, milestoneDenial, pendingChanges, readPlan, roadmapText), $.fs.stat (via loadProjectRules, roadmapText), $.process.run (via git), $.prompt.submit (via carryOn), $.session.compact (via carryOn), $.session.cwd, $.session.usage (via carryOn), $.settings.read, $.state.get, $.state.set, $.store.delete, $.store.get (via storedMine, userModels), $.store.set, $.ui.notify, $.ui.status, $.ui.toast
  ❯ ./register.ts state writes: jbit.announced, jbit.armed, jbit.checkCounts, jbit.cleared, jbit.firstAgents, jbit.goal, jbit.mainRoot, jbit.modelsChosen, jbit.modelsDefault, jbit.modelsDefaultConfirmed, jbit.modelsHonoured, jbit.modelsMine, jbit.modelsNamed, jbit.modelsPending, jbit.noPlanSeen, jbit.openChecks, jbit.projectRules, jbit.reopen, jbit.seenMode, jbit.unattended, jbit.worktreeNotice
  ❯ ./register.ts state reads: jbit.announced, jbit.armed, jbit.checkCounts, jbit.cleared, jbit.firstAgents, jbit.goal, jbit.mainRoot, jbit.modelsChosen, jbit.modelsDefault, jbit.modelsDefaultConfirmed, jbit.modelsHonoured, jbit.modelsMine, jbit.modelsNamed, jbit.modelsPending, jbit.noPlanSeen, jbit.openChecks, jbit.projectRules, jbit.reopen, jbit.seenMode, jbit.unattended, jbit.worktreeNotice

✔ Validation passed
exit 0

$ git diff --stat c087d40 -- plugins/jbit .claude-plugin   (empty: unchanged)
?? plugins/jbit/evals-ablation/
