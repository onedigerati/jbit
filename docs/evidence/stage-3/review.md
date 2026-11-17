# Stage 3 · Small hook — security review

Fresh reviewer (built nothing), 2026-11-17, against the uncommitted stage 3 diff. Done by hand with the security-review lens, since that skill reviews committed branch changes.

**Verdict:** no fix-now findings. The guard can't be passed by a secret-carrying commit that 0.18.1 caught.

- Guard code byte-identical to HEAD: `register.ts` `git`, `pendingChanges`, `repoPath`, `secretDenial`, commit selection, per-commit scan and fail-open toast; `shell.ts` `gitCall`, `commitScope`, `addScope`, `joinPath`; `secrets.ts` unchanged.
- Commit detection unchanged: 31 lines parsed by HEAD's and the new `shell.ts`, all outputs equal (`git -C`, `-a`/`-am`/`-qam`/`--all`/`--amend`, pathspecs, `&&`/`;`/`|`/newlines, subshells, `bash -c`, `eval`, `sh -s <<<`, env/sudo/command/nohup/xargs prefixes, heredoc messages, `git add` on the same line with untracked files, `--dry-run` skipped).
- Same diff scanned (index, working tree for `-a`, HEAD for pathspecs, earlier `git add` paths); same fail-open when git can't be read.
- Removed `shell.ts` code was the outward check only; commit detection never read it.
- Plan text enters the system prompt verbatim, as in 0.18.1: no new injection surface.

**Triage**
- Reject (intended): under autopilot, 0.18.1's outward check also blocked lines it couldn't see into, including `git -c alias.c=commit c`, as a side effect. That goes with the planned removal of the outward check; it was never a secret check.
- Defer: commits the guard can't see in either version — config-file aliases (`git ci`), `git $x`, commits from scripts or interpreters. Logged in the plan's open questions.
