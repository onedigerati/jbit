// Shared parity scenarios: host-neutral data run against the Claude hook (claude.test.ts) and each command hook
// (through runner.mjs's adapter interface). Shapes are documented at the top of runner.mjs.
//
// Expected phrases are what the Claude hook (plugins/jbit/hooks/register.ts) says today; a host that answers with other
// words fails parity, which is the point.

// fake credentials are assembled at run time so this file never trips a secret scanner itself
export const FAKE_KEYS = { GH: 'ghp_' + 'a1B2'.repeat(9), AWS: 'AKIA' + 'Q'.repeat(16) }

const STAGES = ['## Stages', '- [x] 1. Foundation — engine', '- [ ] 2. Share mode — viewer controls', '- [ ] 3. Polish — copy and layout']

/** A plan on stage 2 of 3, `## Now` carrying `lines` (Mode, Risk, Checks…). */
export const planOn2 = (...lines) => ['# Plan', '', '## Goal', 'Share boards read-only.', '', '## Now', 'Stage 2 of 3 · Share mode', ...lines, '', ...STAGES, ''].join('\n')

/** The same plan with stage 2 ticked in the stage list: what a closing commit stages. */
const closed = text => text.replace('- [ ] 2. Share mode', '- [x] 2. Share mode')

/** A verify report whose table has `rows` check rows. */
export const reportWith = rows =>
  ['# Stage 2 · Share mode — evidence', '', '| Check | Result | Evidence |', '|---|---|---|', ...Array.from({ length: rows }, (_, i) => `| check ${i + 1} | pass | out-${i + 1}.txt |`), '', 'Project checks: tests pass', ''].join('\n')

const REPORT = 'docs/evidence/stage-2/report.md'
const SHOT = 'docs/evidence/stage-2/shot-390-light.png'
/** A two-row report whose second row links a screenshot, with its `Screenshots:` line. */
const reportWithShot = () => reportWith(2).replace('| check 2 | pass | out-2.txt |', '| check 2 | pass | [390 light](shot-390-light.png) |') + 'Screenshots: shot-390-light.png shows the board read-only at 390px\n'
const TICKED = planOn2('Checks:', '- [x] link opens read-only', '- [x] controls work on touch')
const UNTICKED = planOn2('Checks:', '- [x] link opens read-only', '- [ ] controls work on touch')
const RISKY = planOn2('Risk: auth, user input', 'Mode: autopilot', 'Checks:', '- [ ] login works')
const DRIVING = planOn2('Mode: autopilot', 'Checks:', '- [ ] link opens read-only')
const LEFT_UNATTENDED = planOn2('Mode: autopilot — unattended', 'Checks:', '- [ ] link opens read-only')

const user = text => ({ kind: 'prompt', text, fromUser: true })
const commit = message => ({ kind: 'tool', tool: 'Bash', input: { command: `git commit -m "${message}"` } })
const edit = path => ({ kind: 'tool', tool: 'Edit', input: { path, old: 'a', new: 'b' } })
const agent = { kind: 'tool', tool: 'Agent', input: { description: 'build', prompt: 'build stage 2' } }

export const SCENARIOS = [
  {
    name: 'a commit closing a stage with an unticked check is denied',
    fixture: { committed: { 'docs/PLAN.md': UNTICKED, [REPORT]: reportWith(2) }, staged: { 'docs/PLAN.md': closed(UNTICKED) } },
    steps: [user('close stage 2'), { ...commit('Stage 2: share mode'), expect: { kind: 'deny', has: ['closes stage 2', 'controls work on touch'], lacks: ['link opens read-only'] } }],
  },
  {
    name: 'a stage close without an evidence report is denied',
    fixture: { committed: { 'docs/PLAN.md': TICKED }, staged: { 'docs/PLAN.md': closed(TICKED) } },
    steps: [user('close stage 2'), { ...commit('Stage 2: share mode'), expect: { kind: 'deny', has: ['closes stage 2', REPORT, 'jbit:verify for stage 2'] } }],
  },
  {
    name: 'a stage close with its checks ticked and its report passes',
    fixture: { committed: { 'docs/PLAN.md': TICKED, [REPORT]: reportWith(2) }, staged: { 'docs/PLAN.md': closed(TICKED) } },
    steps: [user('close stage 2'), { ...commit('Stage 2: share mode'), expect: { kind: 'allow' } }],
  },
  {
    name: 'a stage close whose report links a missing screenshot is denied, naming the file',
    fixture: { committed: { 'docs/PLAN.md': TICKED, [REPORT]: reportWithShot() }, staged: { 'docs/PLAN.md': closed(TICKED) } },
    steps: [user('close stage 2'), { ...commit('Stage 2: share mode'), expect: { kind: 'deny', has: ['closes stage 2', SHOT, 'jbit:verify'] } }],
  },
  {
    name: 'the same stage close passes once the screenshot exists',
    fixture: { committed: { 'docs/PLAN.md': TICKED, [REPORT]: reportWithShot(), [SHOT]: '\x89PNG\r\n' }, staged: { 'docs/PLAN.md': closed(TICKED) } },
    steps: [user('close stage 2'), { ...commit('Stage 2: share mode'), expect: { kind: 'allow' } }],
  },
  {
    name: 'a secret in a staged commit is denied, named by kind and never by value',
    fixture: { committed: { 'docs/PLAN.md': TICKED }, staged: { 'src/client.ts': `export const token = "${FAKE_KEYS.GH}"\n` } },
    steps: [user('commit the client'), { ...commit('wire client'), expect: { kind: 'deny', has: ['src/client.ts:1: a GitHub token', 'environment variable'], lacks: [FAKE_KEYS.GH] } }],
  },
  {
    name: 'a clean commit passes',
    fixture: { committed: { 'docs/PLAN.md': TICKED }, staged: { 'src/client.ts': 'export const token = process.env.GH_TOKEN\n' } },
    steps: [user('commit the client'), { ...commit('wire client'), expect: { kind: 'allow' } }],
  },
  {
    name: 'under attended autopilot, an edit in a held risky stage is denied, the plan itself is not',
    fixture: { committed: { 'docs/PLAN.md': RISKY } },
    steps: [
      user('/jbit:autopilot attended'),
      { ...edit('src/login.ts'), expect: { kind: 'deny', has: ['JBIT autopilot is holding', 'Stage 2 of 3', 'auth'] } },
      { ...edit('docs/PLAN.md'), expect: { kind: 'allow' } },
    ],
  },
  {
    name: 'under attended autopilot, a builder agent in a held risky stage is denied',
    fixture: { committed: { 'docs/PLAN.md': RISKY } },
    steps: [user('/jbit:autopilot attended'), { ...agent, expect: { kind: 'deny', has: ['JBIT autopilot is holding', 'Stage 2 of 3'] } }],
  },
  {
    name: "the user's approval releases a held stage",
    fixture: { committed: { 'docs/PLAN.md': RISKY } },
    steps: [user('/jbit:autopilot attended'), user('yes, use the session cookie'), { ...edit('src/login.ts'), expect: { kind: 'allow' } }],
  },
  {
    name: 'an outward command under autopilot is denied',
    fixture: { committed: { 'docs/PLAN.md': DRIVING } },
    steps: [
      user('/jbit:autopilot'),
      { kind: 'tool', tool: 'Bash', input: { command: 'git push origin main' }, expect: { kind: 'deny', has: ['holds outward-facing steps for the user (git push)'] } },
      { kind: 'tool', tool: 'Bash', input: { command: 'git status' }, expect: { kind: 'allow' } },
    ],
  },
  {
    name: 'turn end under armed autopilot with stages left keeps the run going',
    fixture: { committed: { 'docs/PLAN.md': DRIVING } },
    steps: [user('/jbit:autopilot'), { kind: 'stop', expect: { kind: 'block', has: ['jbit:autopilot', 'Next: 2. Share mode'] } }],
  },
  {
    name: "a Mode line an earlier session left never drives a fresh session: the turn ends, a push isn't held",
    fixture: { committed: { 'docs/PLAN.md': LEFT_UNATTENDED } },
    steps: [
      user('where are we?'),
      { kind: 'tool', tool: 'Bash', input: { command: 'git push origin main' }, expect: { kind: 'allow' } },
      { kind: 'stop', expect: { kind: 'allow' } },
      { kind: 'stop', expect: { kind: 'allow' } },
    ],
  },
  {
    name: 'turn end without autopilot lets the turn end',
    fixture: { committed: { 'docs/PLAN.md': TICKED } },
    steps: [user('where are we?'), { kind: 'stop', expect: { kind: 'allow' } }],
  },
  {
    name: "a prompt carries the plan's ## Now into context",
    fixture: { committed: { 'docs/PLAN.md': TICKED } },
    steps: [{ ...user('what is next?'), expect: { kind: 'context', has: ['Stage 2 of 3 · Share mode'] } }],
  },
]
