#!/usr/bin/env node
// Runs the parity scenarios against the Claude hook from outside plugins/jbit/: `node hosts/parity/run-claude.mjs`.
// `claude plugin test` loads only files under the folder it tests (no imports from outside it, no symlinks followed, no
// re-exports from a hooks module), so this copies plugins/jbit/hooks/ and plugins/jbit/types/ here byte for byte, checks
// the copies match, and runs `claude plugin test hosts/parity`. Nothing under plugins/jbit/ is written.
import { spawnSync } from 'node:child_process'
import { cpSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const plugin = join(here, '..', '..', 'plugins', 'jbit')

for (const dir of ['hooks', 'types']) {
  rmSync(join(here, dir), { recursive: true, force: true })
  cpSync(join(plugin, dir), join(here, dir), { recursive: true })
  for (const f of readdirSync(join(plugin, dir))) {
    if (!readFileSync(join(plugin, dir, f)).equals(readFileSync(join(here, dir, f)))) throw new Error(`copy of ${dir}/${f} differs from plugins/jbit`)
  }
}

const r = spawnSync('claude', ['plugin', 'test', here], { stdio: 'inherit' })
process.exit(r.status ?? 1)
