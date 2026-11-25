# Fix round 2: the settings file every run below used ($HOME = the throwaway home <scratch>/agy/home-rd1, made by hosts/antigravity/spike/mkhome.sh).
# settings-v1 (run 1, run 2) lacked pwd, wc, tail, date; run 2 was denied on `date`, so those four were added. Runs 3, 4 and the push/negative runs used the final file.
$ cat settings.json
{"permissions":{"allow":[
"command(node <scratch>/agy/home-rd1/.gemini/config/plugins/jbit/skills/verify/scripts/capture.mjs)",
"command(git status)","command(git diff)","command(git log)","command(git show)","command(git add)","command(git commit)","command(git check-ignore)","command(git rev-parse)",
"command(ls)","command(cat)","command(head)","command(find)","command(grep)","command(mkdir)","command(test)","command(echo)","command(pwd)","command(wc)","command(tail)","command(date)"
]}}

$ diff settings-v1.json settings.json
4c4
< "command(ls)","command(cat)","command(head)","command(find)","command(grep)","command(mkdir)","command(test)","command(echo)"
---
> "command(ls)","command(cat)","command(head)","command(find)","command(grep)","command(mkdir)","command(test)","command(echo)","command(pwd)","command(wc)","command(tail)","command(date)"

# Setup: agy 1.5.17; plugin installed by path from the working tree (plugins/jbit-antigravity, diff -r identical to the installed copy); standing in for the user, Playwright installed into the throwaway home's JBIT capture cache:
$ HOME=$H agy plugin install ~/src/repos/jbit/plugins/jbit-antigravity   -> [ok] jbit: 9 skills, 1 rule, 1 hook
$ HOME=$H node plugins/jbit-antigravity/skills/verify/scripts/capture.mjs install   -> Installed and launched: playwright-core@1.65.0
# Scratch project: the verifier's proj-v3e2e (verify/05-06) reset to 889aa2f 'Plan: new heading' (index.html, style.css, docs/PLAN.md with one UI stage, Mode: stage), no remote. Each run gets a fresh copy and its own static server (python3 -m http.server 47611 --directory <copy>) outside agy.
# Each run:
$ cd <copy> && HOME=$H AGY_CLI_DISABLE_AUTO_UPDATE=1 timeout 900 agy -p "$(cat p1.txt)" --model gemini-3.8-flash-low --output-format stream-json --mode accept-edits --settings <scratch>/agy/rd/settings.json
# p1.txt:
#   /jbit:stage
#   The site is served at http://127.0.0.1:47611/ by a static file server on this folder; it is already running. For screenshots, Playwright is already installed in the JBIT capture cache, and I say yes to using it for this project.
