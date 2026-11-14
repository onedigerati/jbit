// Text checks on the skills, READMEs and manifests: `node --test plugins/jbit/tests/docs.check.mjs`.
// `claude plugin test` runs hooks code in a sandbox with no file access, so the words Claude and users read are checked
// here, against the files themselves, with Node's own test runner.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(plugin, '..', '..')
const read = path => readFileSync(path, 'utf8')
const skills = readdirSync(join(plugin, 'skills')).sort()
const skill = name => read(join(plugin, 'skills', name, 'SKILL.md'))
const description = name => skill(name).split('\n').find(l => l.startsWith('description: ')) ?? ''
const readmes = { root: read(join(repo, 'README.md')), plugin: read(join(plugin, 'README.md')) }
const manifest = JSON.parse(read(join(plugin, '.claude-plugin', 'plugin.json')))
const marketplace = JSON.parse(read(join(repo, '.claude-plugin', 'marketplace.json')))
const hook = read(join(plugin, 'hooks', 'register.ts'))
const guide = read(join(repo, 'docs', 'field-guide.html'))
const manifests = { 'plugin.json': manifest.description, 'marketplace.json': `${marketplace.description}\n${marketplace.plugins[0].description}` }

/** The field guide as prose: scripts, styles and code spans dropped, tags turned to spaces, entities decoded. */
const guideProse = guide
  .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<code\b[\s\S]*?<\/code>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')

/** Markdown as prose: fenced blocks and code spans dropped. */
const markdownProse = text => text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')

/** The hook's approval reply (`APPROVAL_REPLY`), read from its source. */
const approvalReply = (() => {
  const m = /const APPROVAL_REPLY =\s*'([^']*)'/.exec(hook)
  assert.ok(m, 'APPROVAL_REPLY not found in register.ts')
  return m[1]
})()

/** The hook's command words (`COMMAND_VOCABULARY`), read from its source. */
const vocabulary = (() => {
  const m = /const COMMAND_VOCABULARY = new Set\(\[([\s\S]*?)\]\)/.exec(hook)
  assert.ok(m, 'COMMAND_VOCABULARY not found in register.ts')
  return [...m[1].matchAll(/'([a-z]+)'/g)].map(w => w[1])
})()

/** A doc's list of command words, "The command words are a, b, … and z": the words in order. */
const listedWords = text => {
  const m = /The command words are ([a-z, ]+?) and ([a-z]+)[,.]/.exec(text)
  return m ? [...m[1].split(/,\s*/), m[2]] : undefined
}

/** Phrases of the old opt-in design (2026-11-13): only the typed `unattended` word armed, a plain command ended it. */
const OLD_RULE = [
  /only `\/jbit:autopilot unattended`/i,
  /typing `\/jbit:autopilot unattended`/i,
  /types? `\/jbit:autopilot unattended`/i,
  /a plain `\/jbit:autopilot`/i,
  /armed again without the word/i,
  /doesn't open with `\/jbit:autopilot unattended`/i,
  /Only your own typed (?:message|command) arms/i,
]

test('plugin.json is version 0.13.0', () => {
  assert.equal(manifest.version, '0.13.0')
})

test('no skill, README or hook text describes the old opt-in arming rule', () => {
  const texts = { ...Object.fromEntries(skills.map(s => [`skills/${s}`, skill(s)])), ...readmes, hook, 'field-guide.html': guide, ...manifests }
  for (const [name, text] of Object.entries(texts))
    for (const old of OLD_RULE) assert.doesNotMatch(text, old, `${name} still says ${old}`)
})

test('autopilot describes the new rule: typed or JBIT command runs unattended, attended, outward, plain words attended', () => {
  const text = skill('autopilot')
  for (const words of [
    'Unattended is the default for the user\'s own autopilot command',
    '"JBIT, just build it. Autopilot, lean."',
    '`attended` anywhere keeps the stops',
    '`outward` also lets push, publish, deploy',
    'migrating or deleting real data and spending money still pause',
    'The level holds until the user\'s next command or a new plan Goal',
    'Plain words without the name ("just build it", "take it from here", "just build it, autopilot lean") never set it: they start autopilot at the level that stands (attended, unless the user\'s own command set one for this plan), or approve a held stage',
    'Neither do you starting this skill, its args, a plugin\'s prompt, a Mode line',
    'An Agents level in the user\'s words',
  ])
    assert.ok(text.includes(words), `autopilot SKILL.md lacks: ${words}`)
  assert.match(description('autopilot'), /"just build it"/)
  assert.match(description('autopilot'), /"JBIT autopilot"/)
})

test('every skill Claude can start says "JBIT <command>" triggers it; approve lists its JBIT and plain forms', () => {
  for (const name of skills.filter(s => s !== 'approve' && s !== 'autopilot'))
    assert.ok(description(name).includes(`opens with "JBIT ${name}"`), `${name}'s description lacks "JBIT ${name}"`)
  const approve = skill('approve')
  assert.match(approve, /^disable-model-invocation: true$/m)
  for (const words of ['"JBIT approve"', '"just build it"']) {
    assert.ok(description('approve').includes(words), `approve's description lacks ${words}`)
    assert.ok(approve.split('\n## ')[0].split('---').slice(2).join('---').includes(words), `approve's body lacks ${words}`)
  }
})

test('the approval reply the skills give is the hook\'s APPROVAL_REPLY', () => {
  // the hook's text carries an example in brackets the skills leave out; the rest must be word for word
  const reply = approvalReply.replace(/ \(as in "[^"]*"\)/, '')
  assert.ok(reply.includes('"just build it"') && reply.includes('"JBIT approve"'), `APPROVAL_REPLY: ${approvalReply}`)
  for (const name of ['autopilot', 'approve']) assert.ok(skill(name).includes(reply), `${name} SKILL.md doesn't give the hook's reply: ${reply}`)
})

test('the command words the docs list are the hook\'s COMMAND_VOCABULARY', () => {
  for (const [name, text] of [['skills/autopilot', skill('autopilot')], ['plugin README', readmes.plugin]])
    assert.deepEqual(listedWords(text), vocabulary, `${name}'s command words differ from COMMAND_VOCABULARY`)
})

test('"JBIT approve" is described as releasing the hold, not as running the approve skill', () => {
  assert.match(skill('approve'), /^disable-model-invocation: true$/m)
  for (const [name, text] of [['approve', skill('approve')], ['plugin README', readmes.plugin]]) {
    assert.ok(text.includes('releases the hold as `/jbit:approve` does') || text.includes('releases the hold as /jbit:approve does') || text.includes('releases a held stage as `/jbit:approve` does'), `${name} doesn't say "JBIT approve" releases the hold as /jbit:approve does`)
    assert.doesNotMatch(text, /"JBIT approve" is `\/jbit:approve`/, name)
  }
})

test('no doc says plain words run attended without saying the level that stands', () => {
  // plain words never set the level: they run at the one that stands, attended only when no command of the user's
  // set one for this plan; a sentence that ties plain words to an attended run must carry that qualifier
  const qualifier = /stands|unless|no command|without a command/i
  const docs = { ...Object.fromEntries(skills.map(s => [`skills/${s}`, markdownProse(skill(s))])), root: markdownProse(readmes.root), plugin: markdownProse(readmes.plugin), 'field-guide.html': guideProse, ...manifests }
  for (const [name, text] of Object.entries(docs))
    for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
      if (!/plain words|"just build it[^"]*"|plain "just/i.test(sentence)) continue
      if (!/\b(?:runs?|starts?|start(?:ing)?|running)\b[^.]*\battended\b|\battended run\b|\brun it attended\b/i.test(sentence)) continue
      assert.match(sentence, qualifier, `${name}: "${sentence.trim()}"`)
    }
})

test('the product is JBIT in prose, not jbit', () => {
  // `jbit` stays in command names (`/jbit:plan`, `jbit:stage`), the status line (`jbit · …`) and code
  const prose = /(?<![/:`@\w-])jbit(?![:\w@-]| ·)/
  for (const name of skills) assert.doesNotMatch(markdownProse(skill(name)), prose, `skills/${name} says jbit in prose`)
  for (const [name, text] of Object.entries(readmes)) assert.doesNotMatch(markdownProse(text), prose, `${name} README says jbit in prose`)
  for (const [name, text] of Object.entries(manifests)) assert.doesNotMatch(text, prose, `${name} says jbit in prose`)
  const hit = prose.exec(guideProse)
  assert.equal(hit, null, hit ? `field guide says jbit in prose: "${guideProse.slice(Math.max(0, hit.index - 60), hit.index + 40).replace(/\s+/g, ' ')}"` : '')
})

test('READMEs, plugin.json and the marketplace lead with "Just build it." and the promise line', () => {
  const promise = 'Plans it. Proves it. Sees it through.'
  for (const [name, text] of Object.entries(readmes)) {
    const top = text.split('\n').filter(Boolean).slice(0, 3).join('\n')
    assert.match(top, /^# JBIT\n\*\*Just build it\.\*\*\n\*Plans it\. Proves it\. Sees it through\.\*$/, `${name} README top`)
  }
  for (const desc of [manifest.description, marketplace.description, marketplace.plugins[0].description])
    assert.ok(desc.startsWith(`Just build it. ${promise}`), `description leads with: ${desc.slice(0, 60)}`)
  assert.equal(marketplace.plugins[0].description, manifest.description)
})

test('READMEs describe the arming rule', () => {
  for (const [name, text] of Object.entries(readmes)) {
    for (const words of ['JBIT, just build it. Autopilot, lean.', '`attended`', '`outward`', 'Plain words without the name'])
      assert.ok(text.includes(words), `${name} README lacks ${words}`)
  }
})
