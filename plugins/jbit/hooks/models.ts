/**
 * The `Models:` line: which model and effort each delegated JBIT role (build, research, review, verify) starts its agents on.
 * Shared by the hook and the project rules, which read a `JBIT models:` default from `CLAUDE.md`.
 */

/** The delegated roles a `Models:` line can set; planning and project management stay on the session's model. */
export const MODEL_ROLES = ['build', 'research', 'review', 'verify'] as const
export type ModelRole = (typeof MODEL_ROLES)[number]
const MODEL_NAMES = ['sonnet', 'opus', 'haiku', 'fable'] as const
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type RoleSetting = { model?: (typeof MODEL_NAMES)[number]; effort?: (typeof EFFORT_LEVELS)[number] }
/** What the `Models:` line sets, per role; a role left out runs as the session would have it. */
export type Models = Partial<Record<ModelRole, RoleSetting>>

/**
 * The roles a `Models:` line sets (`Models: build sonnet/medium · review opus/high · verify haiku`): entries split on
 * `·`, `•`, `—`, `–`, `,`, `;` or `|`, each a role, an optional colon, and a value: a model, an effort, or `model/effort`
 * (either half optional, in any case). An entry with an unknown role, an unknown model or effort, two models, two efforts or anything more is
 * no setting for that role; a role named twice keeps its first entry. Undefined when no role is set.
 */
export function parseModels(line: string): Models | undefined {
  const body = line.replace(/^\s*Models:/i, '')
  const models: Models = {}
  for (const entry of body.split(/[·•—–,;|]/)) {
    const m = entry.trim().toLowerCase().match(/^([a-z]+)(?:\s*:\s*|\s+)([a-z]*(?:\s*\/\s*[a-z]*)?)$/)
    if (!m) continue
    const role = m[1] as ModelRole
    if (!MODEL_ROLES.includes(role) || models[role]) continue
    const setting: RoleSetting = {}
    let ok = true
    for (const part of (m[2] ?? '').split('/').map(p => p.trim()).filter(Boolean)) {
      if ((MODEL_NAMES as readonly string[]).includes(part) && !setting.model) setting.model = part as RoleSetting['model']
      else if ((EFFORT_LEVELS as readonly string[]).includes(part) && !setting.effort) setting.effort = part as RoleSetting['effort']
      else ok = false
    }
    if (ok && (setting.model || setting.effort)) models[role] = setting
  }
  return Object.keys(models).length ? models : undefined
}

/** A role's setting as the line writes it: `sonnet/medium`, `sonnet` or `medium`; `short` abbreviates the effort for the band. */
export function settingText(s: RoleSetting, short = false): string {
  const effort = short && s.effort === 'medium' ? 'med' : s.effort
  return [s.model, effort].filter(Boolean).join('/')
}

/** Every model and effort the roles set, each once: what the user's prompt must name to confirm the line. */
export function modelsValues(models: Models): string[] {
  return [...new Set(MODEL_ROLES.flatMap(r => [models[r]?.model, models[r]?.effort]).filter((v): v is string => !!v))]
}

/** The accepted form, for the note on a Models line that sets nothing. */
export const MODELS_FORM =
  '`Models: build sonnet/medium · research sonnet/high · review opus/high · verify sonnet/medium` (roles build, research, review, verify; model sonnet, opus, haiku or fable; effort low, medium, high, xhigh or max; either half optional)'

/** The roles set, in role order (`build sonnet/medium · review opus/high`): also the canonical form the session compares. */
export function modelsText(models: Models | undefined, short = false): string {
  if (!models) return ''
  return MODEL_ROLES.filter(r => models[r])
    .map(r => `${r} ${settingText(models[r]!, short)}`)
    .join(' · ')
}
