// Node only: materialises a scenario's fixture as a real git repo, for adapters that run a command hook (Copilot, Codex).
// The Claude runner uses runner.mjs's memoryRepo instead, since its test kit can't reach the file system or git.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] }).toString()

const put = (dir, files) => {
  for (const [p, text] of Object.entries(files ?? {})) {
    const at = join(dir, p)
    if (text === null) rmSync(at, { force: true })
    else {
      mkdirSync(dirname(at), { recursive: true })
      writeFileSync(at, text)
    }
  }
}

/** A temp git repo holding `fixture.committed` as HEAD and `fixture.staged` added to the index: { dir, remove() }. */
export function makeRepo(fixture) {
  const dir = mkdtempSync(join(tmpdir(), 'jbit-parity-'))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'parity@example.invalid')
  git(dir, 'config', 'user.name', 'parity')
  git(dir, 'config', 'commit.gpgsign', 'false')
  put(dir, fixture.committed)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'fixture')
  put(dir, fixture.staged)
  if (Object.keys(fixture.staged ?? {}).length) git(dir, 'add', '-A')
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) }
}
