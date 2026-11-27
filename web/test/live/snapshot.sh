#!/usr/bin/env bash
set -euo pipefail
out=${ORDER_LIVE_SNAPSHOT:-/var/tmp/order-live/snapshot.json}
mkdir -p "$(dirname "$out")"
umask 077
tmp=$(mktemp)
figaro state show --id @arias-global -j > "$tmp.global"
figaro state show --id @topology -j > "$tmp.topology"
ids=$(jq -r '[.. | objects | select(.kind? == "form") | .id] | unique | .[]' "$tmp.global")
: > "$tmp.forms"
for id in $ids; do
  if figaro state show --id "$id" -j 2> /dev/null | jq -c --arg id "$id" '{key: $id, value: .}' >> "$tmp.forms"; then :; fi
done
jq -n --arg taken "$(date -u +%FT%TZ)" --slurpfile global "$tmp.global" --slurpfile topology "$tmp.topology" --slurpfile forms "$tmp.forms" \
  '{taken: $taken, global: $global[0], topology: $topology[0], forms: ($forms | from_entries)}' > "$out"
rm -f "$tmp" "$tmp.global" "$tmp.topology" "$tmp.forms"
echo "$out"
