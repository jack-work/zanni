#!/bin/sh
src="${FIGARO_PARITY_DIR:-/var/tmp/figaro-parity/scripts/parity}"
here="$(cd "$(dirname "$0")" && pwd)"
cp "$src/scenarios.json" "$src/glyphs.json" "$here/"
