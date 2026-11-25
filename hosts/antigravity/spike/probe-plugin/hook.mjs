#!/usr/bin/env node
// Probe hook for the Antigravity spike: logs every event's stdin and answers per mode.
// Usage (from hooks.json): node ./hook.mjs <Event>
// Knobs: see ../README.md. PROBE_LOG (dir), PROBE_MODE (env) or $HOME/PROBE_MODE (file).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const event = process.argv[2] || 'unknown';
const home = os.homedir();
const logDir = process.env.PROBE_LOG || path.join(home, 'probe-log');

function readMode() {
  if (process.env.PROBE_MODE) return process.env.PROBE_MODE;
  try { return fs.readFileSync(path.join(home, 'PROBE_MODE'), 'utf8'); } catch { return 'log'; }
}

// Modes, comma- or newline-separated: log | deny:<regex> | context | context-all | continue
function parseModes(text) {
  const m = { deny: null, context: null, cont: false };
  for (const raw of text.split(/[,\n]/)) {
    const s = raw.trim();
    if (s.startsWith('deny:')) m.deny = new RegExp(`^(?:${s.slice(5)})$`);
    else if (s === 'context' || s === 'context-all') m.context = s;
    else if (s === 'continue') m.cont = true;
  }
  return m;
}

function respond(input, modes) {
  switch (event) {
    case 'PreToolUse': {
      const tool = input?.toolCall?.name ?? '';
      if (modes.deny && modes.deny.test(tool)) return { decision: 'deny', reason: `probe deny ${tool}` };
      return { decision: 'allow' };
    }
    case 'PreInvocation': {
      const n = input?.invocationNum;
      if (modes.context === 'context-all' || (modes.context === 'context' && n === 0)) {
        return { injectSteps: [{ systemMessage: { systemMessage: `Probe context marker: OCELOT-VELVET-${n}. If asked for the probe marker, reply with it.` } }] };
      }
      return {};
    }
    case 'Stop':
      if (modes.cont) return { decision: 'continue', reason: 'probe continue: say CONTINUED-AGAIN and stop' };
      return {};
    default:
      return {};
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let out;
  try {
    let input = null;
    try { input = JSON.parse(raw); } catch { /* keep raw */ }
    out = respond(input, parseModes(readMode()));
    // Logs hold prompts and file contents: owner-only (dir 0700, files 0600).
    fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(logDir, 0o700);
    const stamp = `${Date.now()}-${process.pid}`;
    fs.writeFileSync(path.join(logDir, `${stamp}-${event}.json`), raw, { mode: 0o600 });
    const events = path.join(logDir, 'events.jsonl');
    fs.appendFileSync(events,
      JSON.stringify({ t: stamp, event, cwd: process.cwd(), pluginRoot: process.env.PLUGIN_ROOT, pluginData: process.env.PLUGIN_DATA, response: out }) + '\n', { mode: 0o600 });
    fs.chmodSync(events, 0o600);
  } catch (e) {
    out = event === 'PreToolUse' ? { decision: 'deny', reason: `probe hook error: ${e.message}` } : {};
  }
  process.stdout.write(JSON.stringify(out) + '\n');
});
