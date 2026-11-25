# Fix round 2, part 1: how agy 1.5.17 matches permissions.allow rules for run_command, probed live.
# Each probe: a throwaway home (mkhome.sh, no plugin installed), a scratch git repo with one commit, then
#   HOME=<home> AGY_CLI_DISABLE_AUTO_UPDATE=1 agy -p "Call run_command exactly once with this exact CommandLine ...: <cmd>" \
#     --model gemini-3.8-flash-low --output-format stream-json --mode accept-edits --settings '<rules>'
# RAN = the step has command output and result.denied_actions is empty; DENIED = denied_actions lists the command (agy's soft deny, exit 0).
# Batches c, j, k ran one at a time; d, e, f, g ran a few at once in the same home (each with its own --settings). No --dangerously-skip-permissions anywhere.

## No rules: every shell command asks (accept-edits), so headless denies it
  DENIED	git status

## Plain-word rules are a token prefix: command(git) covers git push; command(git status) covers only git status ...
# rules: command(git)
  RAN   	git push origin main   (agy ran it unprompted; git itself then failed: the scratch repo has no remote)
# rules: command(git status)
  DENIED	git push origin main
  RAN   	git status --short

## ... and a compound command is split: every part must match a rule. Redirects to a file and $(...) are refused.
# rules: command(git status), command(ls)
  RAN   	git status && ls -la
# rules: command(git log), command(echo)
  RAN   	git log -1 && echo ok || echo no
# rules: command(git status), command(head)   (2>&1 and a pipe are fine)
  RAN   	git status 2>&1 | head -n 3
# rules: command(echo)
  DENIED	echo hi > out5.txt
  DENIED	echo $(touch zz6.txt)
# rules: command(find)   (agy refuses find -delete even when find is allowed)
  DENIED	find . -name zz1.txt -delete

## Regex rules match the whole command line, so a `.*` tail lets anything after && through
# rules: command(regex:git (status|log)( .*)?)
  RAN   	git log --oneline
  DENIED	git push origin main
  RAN   	git status && ls
  RAN   	git status && touch zz1.txt
  RAN   	git log -1 || touch zz5.txt
  RAN   	git status | head -n 1
  DENIED	git status; touch zz.txt
  DENIED	git status; ls
# rules: command(regex:git status)
  RAN   	git status --short
  DENIED	git status && ls
# rules: command(regex:git stat)
  DENIED	git status
# rules: command(regex:git (status|log)( [^;&|]*)?)
  DENIED	git status && touch zz7.txt

## ... and regex rules do not combine across the parts of a compound: a narrow tail makes ordinary compounds fail
# rules: command(regex:git (status|log)( [^;&|<>$`]*)?), command(regex:ls…), command(regex:head…), command(regex:echo…)  (same tail on each)
  DENIED	git status && ls -la
  DENIED	git status 2>&1 | head -n 3
  DENIED	git log -1 && echo ok || echo no
  DENIED	git status > out3.txt
  DENIED	echo $(touch zz6.txt)
  DENIED	git status && touch zz7.txt
# rules: command(git status), command(regex:ls( [^;&|<>$`]*)?)
  DENIED	git status && ls -la

## The capture script: a plain-word rule with its full path works quoted, unquoted and in a compound; a regex is fragile
# rules: command(node <home>/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs)
  RAN   	node "<scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs" where
  RAN   	node <scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs where
  RAN   	node "<scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs" where && node "<scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs" --help
  DENIED	node <scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjsx where
# rules: command(regex:node "?/[^ "]*/\.gemini/config/plugins/jbit/skills/verify/scripts/capture\.mjs"?)
  DENIED	node "<scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs" where
  DENIED	node <scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs where
  DENIED	node "<scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs" where && node "<scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs" --help
  DENIED	node -e "require('fs').writeFileSync('zz6.txt','x')"
  DENIED	node "<scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs" where > zz7.txt
  DENIED	node ./x/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs where
# rules: command(regex:node .*capture\.mjs)
  RAN   	node <scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs where
# rules: command(regex:node [^ ]*/plugins/jbit/skills/verify/scripts/capture\.mjs)   (no tail)
  DENIED	node <scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs where
# rules: command(regex:node [^ ]*/scripts/capture\.mjs( [^;&|<>$`]*)?)
  RAN   	node <scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs where
# rules: command(regex:node [^ ]*/plugins/jbit/skills/verify/scripts/capture\.mjs( [^;&|<>$`]*)?)
  RAN   	node <scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs where
# (a regex form that runs the capture alone still fails the model's usual `capture shot … && capture compare …`, per e1/f7)

## --settings also takes a file path:
# --settings <scratch>/agy/rd/k4.json (a file holding command(node <home>/…/capture.mjs))
  RAN   	node <scratch>/agy/home-rdp/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs where

## Conclusion: use plain-word rules, one per read-only command and per git subcommand, plus the capture script by its full path. No regex.
