#!/bin/sh
# Make a throwaway HOME for agy holding only a copy of the sign-in token.
# Usage: mkhome.sh <dir>   (prints the absolute dir)
# Then run agy as: HOME=<dir> agy ...   Remove the dir after the run: it holds a token copy.
set -eu
umask 077
[ $# -eq 1 ] || { echo "usage: mkhome.sh <dir>" >&2; exit 2; }
die() { echo "mkhome: refusing: $*" >&2; exit 1; }
real_home=$(realpath "$HOME")
gem=$(realpath "$HOME/.gemini")          # follows a symlinked ~/.gemini
tok_rel=.gemini/antigravity-cli/antigravity-oauth-token
src="$gem/antigravity-cli/antigravity-oauth-token"
[ -f "$src" ] || { echo "mkhome: no sign-in token at \$HOME/$tok_rel" >&2; exit 1; }
dir=$(realpath -m -- "$1"); d=${dir%/}
# Every guard runs before anything is created.
[ "$d" = "$real_home" ] && die "$dir is the real home"
case "$d/" in "$gem/"*) die "$dir is or is inside the real $gem" ;; esac
for p in "$real_home" "$gem"; do case "$p/" in "$d/"*) die "$dir holds $p" ;; esac; done
p=$(case "$1" in /*) echo "$1" ;; *) echo "$PWD/$1" ;; esac)
while [ "$p" != / ] && [ -n "$p" ]; do  # no symlink anywhere on the given path
  [ -L "$p" ] && die "$p is a symlink"
  p=$(dirname "$p")
done
[ -d "$dir" ] && [ -n "$(ls -A "$dir")" ] && die "$dir exists and is not empty"
[ -e "$dir" ] && [ ! -d "$dir" ] && die "$dir exists and is not a directory"
mkdir -p "$dir"
[ -O "$dir" ] || die "$dir is not owned by you"
chmod 700 "$dir"
mkdir "$dir/.gemini" "$dir/.gemini/antigravity-cli"   # no -p: fails on anything planted
install -m 600 "$src" "$dir/$tok_rel"
echo "$dir"
