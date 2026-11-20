#!/usr/bin/env node
// Spike hook: logs everything, behaviour driven by $WORK/mode.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORK = '/tmp/claude-1000/-home-jonah-src-repos-jbit/85ea5585-cff8-4585-b029-f1589ec3abd5/scratchpad/spike-hooks';
const LOG = path.join(WORK, 'hooklog.jsonl');
const event = process.argv[2] || 'unknown';
const tag = process.argv[3] || 'main';

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch (e) { raw = 'STDIN_ERR ' + e.message; }
let input = null;
try { input = JSON.parse(raw); } catch { input = raw; }

const envSubset = {};
for (const [k, v] of Object.entries(process.env)) {
  if (/PLUGIN|COPILOT|CLAUDE|^PWD$|^MYROOT$|^HOME$/.test(k) && !/TOKEN|SECRET|KEY/.test(k)) envSubset[k] = v;
}
let mode = {};
try { mode = JSON.parse(fs.readFileSync(path.join(WORK, 'mode.json'), 'utf8')); } catch {}

let out = null;
const ctr = (name) => {
  const f = path.join(WORK, `ctr-${name}`);
  let n = 0; try { n = parseInt(fs.readFileSync(f, 'utf8')) || 0; } catch {}
  n++; fs.writeFileSync(f, String(n)); return n;
};

if (tag === 'main') {
  if (event === 'sessionStart' && mode.sessionStart) out = { additionalContext: 'Session note from hook: the session codeword is SS-OTTER.' };
  if (event === 'userPromptSubmitted' && mode.ups) out = { modifiedPrompt: (input.prompt || '') + '\n(The UPS codeword is UPS-HERON.)', additionalContext: 'The UPS context codeword is UPS-CTX-HERON.' };
  if (event === 'userPromptTransformed' && mode.upt) {
    const n = ctr('upt');
    out = { modifiedTransformedPrompt: (input.transformedPrompt || input.prompt || '') + `\n\n[Project note injected by hook #${n}: the project codeword is UPT-ZEBRA${n}.]` };
  }
  if (event === 'postToolUse' && mode.post) out = { additionalContext: 'Post-tool note from hook: the tool codeword is PT-WALRUS.' };
  if (event === 'preToolUse' && mode.deny) {
    const t = input.toolName;
    if (mode.deny.includes(t)) out = { permissionDecision: 'deny', permissionDecisionReason: `JBIT policy blocked ${t}; codeword PELICAN-${t}.` };
  }
  if (event === 'agentStop' && mode.block) {
    const n = ctr('stop');
    if (n <= mode.block) out = { decision: 'block', reason: `Not done yet (stop-hook block #${n}). Reply with exactly: CONT${n} followed by the codeword from the latest injected project note.` };
  }
}

const rec = { t: new Date().toISOString(), event, tag, argv: process.argv.slice(1), cwd: process.cwd(), scriptDir: path.dirname(fileURLToPath(import.meta.url)), env: envSubset, stdin: input, out };
fs.appendFileSync(LOG, JSON.stringify(rec) + '\n');
if (out) process.stdout.write(JSON.stringify(out));
process.exit(0);
