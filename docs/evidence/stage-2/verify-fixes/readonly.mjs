import { repo, show, isAllow, pre, prompt, planOn2, done } from './harness.mjs'
const RISKY = planOn2('Risk: auth, user input', 'Mode: autopilot', 'Checks:', '- [ ] login works')
const p = repo(RISKY), parent = 'a5000000-0000-4000-8000-00000000000a'
show('parent armed attended on a held risky stage', 'PreInvocation', prompt('/jbit:autopilot attended'), p, parent)
for (const [n, a] of [['read_file', { Path: 'src/a.ts' }], ['view_file', { AbsolutePath: `${p}/src/a.ts` }], ['list_dir', { DirectoryPath: p }], ['grep_search', { Query: 'a', SearchPath: `${p}/src` }], ['find_by_name', { Pattern: '*.ts', SearchDirectory: p }], ['run_command', { CommandLine: 'ls -la' }], ['run_command', { CommandLine: 'git status' }]])
  show(`${n} in a held stage (stage reading tools must not be blocked)`, 'PreToolUse', { ...pre(n, a), lastUserInput: '/jbit:autopilot attended' }, p, parent, isAllow)
done()
