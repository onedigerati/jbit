#!/usr/bin/env python3
# Spike hook: logs stdin per event; behaviour driven by files in $SPIKE/mode/
import json, os, sys, time
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ev = sys.argv[1]
raw = sys.stdin.read()
with open(os.path.join(S, "log", "hook.log"), "a") as f:
    f.write(f"=== {ev} {time.strftime('%H:%M:%S')}\n{raw}\n")
def mode(name):
    p = os.path.join(S, "mode", name)
    return open(p).read() if os.path.exists(p) else None
d = json.loads(raw) if raw.strip() else {}
if ev == "PreToolUse":
    m = mode("deny")
    if m:
        tn = d.get("tool_name", "")
        targets = m.split()
        if "all" in targets or tn in targets:
            r = "JBIT-DENY: blocked by spike hook (" + tn + ")"
            style = mode("denystyle") or "json"
            if style.strip() == "exit2":
                print(r, file=sys.stderr); sys.exit(2)
            print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                  "permissionDecision": "deny", "permissionDecisionReason": r}}))
elif ev == "UserPromptSubmit":
    m = mode("ups")
    if m == "plain":
        print("Session codeword: PLAINWOMBAT. If asked for the codeword, reply with it.")
    elif m == "json":
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit",
              "additionalContext": "Session codeword: JSONPELICAN. If asked for the codeword, reply with it."}}))
    elif m == "big":
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit",
              "additionalContext": open(os.path.join(S, "hooks", "big.txt")).read()}}))
elif ev == "Stop":
    m = mode("stop")
    if m:
        cf = os.path.join(S, "log", "stopcount")
        n = int(open(cf).read()) if os.path.exists(cf) else 0
        n += 1
        open(cf, "w").write(str(n))
        lim = int(m.strip())
        if n <= lim:
            print(json.dumps({"decision": "block",
                  "reason": f"Stop-block #{n}: reply with exactly the word CONTINUE{n} and nothing else."}))
sys.exit(0)
