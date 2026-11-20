// Reads the files an `apply_patch` call touches. Strict on purpose: a patch this can't read is denied, so a line that
// looks like a directive but isn't one, content outside a file, or anything after `*** End Patch` fails the parse.

const FILE = /^\*\*\* (Add|Update|Delete) File: (.*)$/
const MOVE = /^\*\*\* Move to: (.*)$/
const OPS = { Add: 'add', Update: 'update', Delete: 'delete' }

const fail = reason => ({ ok: false, reason })

/** A path as the patch names it: non-empty, one line, no NUL. */
function pathOf(raw) {
  const p = raw.trim()
  return p && !p.includes('\0') ? p : undefined
}

/**
 * `{ ok: true, files: [{ op: 'add' | 'update' | 'delete', path, moveTo?, content? }] }`, or `{ ok: false, reason }`.
 * An added file's `content` is its `+` lines joined.
 */
export function parsePatch(text) {
  if (typeof text !== 'string') return fail('the patch is not a string')
  // a lone carriage return splits a line for some readers and not others
  if (/\r(?!\n)/.test(text)) return fail('a carriage return not followed by a newline')
  const lines = text.replace(/^(?:[ \t]*\r?\n)+/, '').replace(/\s+$/, '').split(/\r?\n/)
  if (lines[0]?.trimEnd() !== '*** Begin Patch') return fail('the patch does not open with `*** Begin Patch`')
  if (lines[lines.length - 1]?.trimEnd() !== '*** End Patch' || lines.length < 2) return fail('the patch does not end with `*** End Patch`')
  const files = []
  let file
  for (const raw of lines.slice(1, -1)) {
    const line = raw.trimEnd()
    // a directive with anything before it reads as one to a lenient applier and as content here: neither, so refused
    if (!line.startsWith('***') && line.trimStart().startsWith('***')) return fail(`an indented patch directive \`${line.trim().slice(0, 60)}\``)
    if (line.startsWith('***')) {
      const f = FILE.exec(line)
      if (f) {
        const path = pathOf(f[2])
        if (!path) return fail(`a \`*** ${f[1]} File:\` line names no path`)
        file = { op: OPS[f[1]], path, lines: [], moved: false }
        files.push(file)
        continue
      }
      const m = MOVE.exec(line)
      if (m) {
        // only right after its Update header, once
        if (!file || file.op !== 'update' || file.lines.length || file.moveTo !== undefined) return fail('a `*** Move to:` line does not follow an `*** Update File:` header')
        const path = pathOf(m[1])
        if (!path) return fail('a `*** Move to:` line names no path')
        file.moveTo = path
        continue
      }
      if (line === '*** End of File' && file && file.op !== 'delete') continue
      return fail(`unknown patch line \`${line.slice(0, 60)}\``)
    }
    if (!file) return fail('content before the first file header')
    if (file.op === 'delete') {
      if (line === '') continue
      return fail(`content under \`*** Delete File: ${file.path}\``)
    }
    if (file.op === 'add') {
      if (!raw.startsWith('+')) return fail(`a line under \`*** Add File: ${file.path}\` does not start with \`+\``)
      file.lines.push(raw.slice(1))
      continue
    }
    if (!(raw === '' || raw.startsWith(' ') || raw.startsWith('-') || raw.startsWith('+') || raw.startsWith('@@'))) return fail(`an unreadable line under \`*** Update File: ${file.path}\``)
    file.lines.push(raw)
  }
  if (!files.length) return fail('the patch names no file')
  return {
    ok: true,
    files: files.map(f => ({
      op: f.op,
      path: f.path,
      ...(f.moveTo !== undefined ? { moveTo: f.moveTo } : {}),
      ...(f.op === 'add' ? { content: f.lines.length ? `${f.lines.join('\n')}\n` : '' } : {}),
      ...(f.op === 'update' ? { hunks: f.lines } : {}),
    })),
  }
}
