#!/usr/bin/env bash
set -euo pipefail
umask 077
out=${ORDER_LIVE_SNAPSHOT:-/var/tmp/order-live/snapshot.json}
mkdir -p "$(dirname "$out")"
work=$(mktemp -d)
trap 'rm -rf "$work" "$out.partial"' EXIT
figaro state show --id @arias -j > "$work/arias"
figaro state show --id @topology -j > "$work/topology"
keep='select((.chartered? | type) == "object") | {chartered, name, "role-name": ."role-name", "target-aria": ."target-aria", "queue-contract": ."queue-contract", queue, system: (if .system.fanout? != null then {fanout: .system.fanout} else null end)} | with_entries(select(.value != null))'
: > "$work/forms"
for id in $(jq -r '[.. | objects | select(.kind? == "form") | .id] | unique | .[]' "$work/arias"); do
  figaro state show --id "$id" -j 2> /dev/null | jq -c --arg id "$id" "$keep"' | {key: $id, value: .}' >> "$work/forms" || true
done
jq -n --arg taken "$(date -u +%FT%TZ)" --slurpfile arias "$work/arias" --slurpfile topology "$work/topology" --slurpfile forms "$work/forms" \
  '{taken: $taken, arias: $arias[0], topology: $topology[0], forms: ($forms | from_entries)}' > "$out.partial"
mv "$out.partial" "$out"
echo "$out"
