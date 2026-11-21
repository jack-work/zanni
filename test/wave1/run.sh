#!/usr/bin/env bash
set -u
bundle=$(realpath "$1")
cd "$(dirname "$0")"
fail=0
for t in tree fork pills glyphs lag; do
  [ -f "$t.test.py" ] || continue
  echo "== $t"
  python3 "$t.test.py" "$bundle" || fail=1
done
exit $fail
