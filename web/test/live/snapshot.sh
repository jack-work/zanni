#!/usr/bin/env bash
set -euo pipefail
out=${ORDER_LIVE_SNAPSHOT:-/var/tmp/order-live/snapshot.json}
mkdir -p "$(dirname "$out")"
umask 077
tmp=$(mktemp)
figaro state show --id @arias -j > "$tmp.arias"
figaro state show --id @topology -j > "$tmp.topology"
ids=$(jq -r '[.. | objects | select(.kind? == "form") | .id] | unique | .[]' "$tmp.arias")
: > "$tmp.forms"
for id in $ids; do
  if figaro state show --id "$id" -j 2> /dev/null | jq -c --arg id "$id" '{key: $id, value: .}' >> "$tmp.forms"; then :; fi
done
jq -n --arg taken "$(date -u +%FT%TZ)" --slurpfile arias "$tmp.arias" --slurpfile topology "$tmp.topology" --slurpfile forms "$tmp.forms" \
  '{taken: $taken, arias: $arias[0], topology: $topology[0], forms: ($forms | from_entries)}' > "$out"
rm -f "$tmp" "$tmp.arias" "$tmp.topology" "$tmp.forms"
echo "$out"
