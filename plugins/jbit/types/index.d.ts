declare module 'claude-code' {
  interface PluginState {
    jbit: {
      /** Autopilot may drive this session: set when the user starts jbit:autopilot here, never read from the repo. */
      armed: boolean
      /** How unattended this session's autopilot runs: set only by the user's own autopilot command (a typed `/jbit:autopilot`, or a message opening with "JBIT" made of nothing but command words) — `on` by default, `outward` with that word, `off` (attended) with `attended` — and held until their next command or a new plan Goal, which sets it to `off`. Talk, an approval, plain words without the name, Claude starting the skill and the Mode line changing leave it as it is. */
      unattended: 'off' | 'on' | 'outward'
      /** The plan's mode at the last look this session (`none` without a Mode line), to see it change. */
      seenMode: 'autopilot' | 'paused' | 'none'
      /** Risky stages (by their `## Now` heading line) the user has approved (`isApproval`) under autopilot, driving or paused. */
      cleared: string[]
      /** What this Goal's progress notices have told the user: stage numbers, and `all` once every stage is done; reset with a new Goal. */
      announced: string[]
      /** Stages whose close a commit landed without passing the stage gates (found after the line ran), checked again at each later commit until one closes them passing or unticks them; reset with a new Goal. */
      reopen: string[]
      /** For each stage number, the checks last seen unticked in `## Now` while that stage was current. */
      openChecks: Record<string, string[]>
      /** For each stage number, how many checks `## Now` listed when last seen while that stage was current; the evidence gate wants a report row per check. */
      checkCounts: Record<string, number>
      /** The plan's Goal at the last look; a change means a new feature, and resets the per-stage records. */
      goal: string
      /** The session's first look found no plan: the first plan it then reads counts as a new Goal. */
      noPlanSeen: boolean
      /** The main session's working directory, absolute, as its own last look saw it: a subagent's hooks read the plan at the top of its repository, not in the agent's worktree. Written only by the main loop. */
      mainRoot: string
      /** The plan's `Agents:` line as this session first read it (level and confirmation stamp); a `wide` already there is honoured only once restamped. */
      firstAgents: { level: 'lean' | 'balanced' | 'wide' | 'none' | 'unknown'; stamp?: string; at?: number }
      /** The plan's `Models:` line this session honours, as the hook writes it (`build sonnet/medium · review opus/high`; `''` for none): the line at the session's first look that read a plan, or one changed while the user's own latest prompt named all its models and efforts. */
      modelsHonoured: string
      /** The models and efforts the latest prompt named as words, when it was the user's own (empty otherwise): a changed Models line is honoured only when this names every value it sets. */
      modelsNamed: string[]
      /** The project's default Models line (`JBIT models:` in CLAUDE.md) as the session first read it, as the hook writes it (`''` for none): honoured only once the user confirms it this session (`modelsDefaultConfirmed`). */
      modelsDefault: string
      /** The user confirmed the project's default this session: their own prompt named its settings and roles, or they typed `JBIT models default`. A cloned repo's committed default never raises spend unasked. */
      modelsDefaultConfirmed: boolean
      /** The user's own Models default (`JBIT models … — my default`, kept in the plugin's store under `models`) as the session first read it, as the hook writes it (`''` for none, a value that doesn't parse, or a store that can't be read). */
      modelsMine: string
      /** The honoured Models line was set by the user's `JBIT models` command and the plan doesn't carry it yet: it applies at once, and the rules say to write it. */
      modelsPending: boolean
      /** The user's `JBIT models` command set the honoured Models line this session: it names every role it keeps, so the defaults fill in nothing more, and a line matching them needs the user like any other. */
      modelsChosen: boolean
      /** Every project rule (`JBIT risk:` / `JBIT outward:` in CLAUDE.md) seen this session, so a line removed mid-run still holds until a new session. */
      projectRules: { risk: string[]; outward: { words: string[]; file: string }[] }
    }
  }
}

/**
 * What JBIT keeps in its own `$.store` (one JSON file per user, under the Claude Code configuration directory, outside
 * every repo), written only by the user's own commands. The hook imports it as a type.
 */
export interface JbitStore {
  /** The user's Models default, as `modelsText` writes it (`build sonnet/medium · research sonnet/high`): set by `JBIT models … — my default`, removed by `JBIT models clear my default`. */
  models?: string
}
