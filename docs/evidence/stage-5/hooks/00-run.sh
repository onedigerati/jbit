#!/bin/bash
# usage: run.sh NN-name "<extra codex flags>" "<prompt>"
S=$SCRATCH
name=$1; flags=$2; prompt=$3
: > $S/log/hook.log; rm -f $S/log/stopcount
out=$S/log/$name.jsonl
cd $S/fixture
start=$(date +%s)
HOME=$S/home CODEX_HOME=$S/home/.codex timeout 300 codex exec --skip-git-repo-check --json $flags "$prompt" < /dev/null > $out 2> $S/log/$name.err
rc=$?
end=$(date +%s)
E=$S/evidence/$name.txt
{
echo "COMMAND: cd \$SCRATCH/fixture && HOME=\$SCRATCH/home CODEX_HOME=\$SCRATCH/home/.codex timeout 300 codex exec --skip-git-repo-check --json $flags \"$prompt\""
echo "MODE FILES:"; for f in $S/mode/*; do [ -e "$f" ] && echo "  $(basename $f)=$(cat $f | head -c 80)"; done
echo "EXIT: $rc  DURATION: $((end-start))s"
echo "--- HOOK LOG ---"; cat $S/log/hook.log
[ -f $S/log/stopcount ] && echo "--- stopcount: $(cat $S/log/stopcount)"
echo "--- STDERR (tail) ---"; tail -n 15 $S/log/$name.err
echo "--- JSONL (items) ---"; cat $out
echo "--- FIXTURE AFTER ---"; for f in $S/fixture/*; do echo "## $(basename $f)"; cat "$f"; done
} | sed -E 's/eyJ[A-Za-z0-9._-]+/[REDACTED]/g' > $E
echo "rc=$rc dur=$((end-start)) -> $E"
