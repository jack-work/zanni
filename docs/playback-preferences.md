# Shared playback preferences

Source contract for filo and its app adapters. Browser localStorage only,
key `zanni.playback.v1`; no HTTP cache, cookie or server preference endpoint.
This is origin-local: tv.kelliher.info and files.kelliher.info have separate
browser stores. A shared origin or later server preferences would be needed
for cross-origin/device synchronization; that is not implemented here.

## Allowed fields

`{version:1, volume, muted, rate, qualityCap, captionsEnabled, captionLanguage}`.
volume is0..1, rate0.25..4, qualityCap is a maximum numeric video height or
null for Auto. Caption preference is enablement plus a language tag. Never
serialize an item key, itemId, track ID, private URL, credentials or resume
position. Saved positions remain the existing server feature.

`zanni.filo.preferences.read()` returns a validated whitelist. Before a shared
record exists it imports legacy juglar.speed and numeric/v-prefixed rung height
from juglar.quality; it never writes either old key. Malformed or unavailable
storage falls back safely. `write(patch)` is the low-level whitelisted store
and returns `{preferences,stored}`. A false stored flag is not a playback error.

## App integration

After attaching filo with the CURRENT authorized track/quality offers, call
`player.restorePreferences()` before choosing/loading the source. It applies
volume/mute/rate and resolves captions by language against those offers only.
No match or more than one same-language match means Off, not a guessed track.
It returns `{preferences,quality,qualityResolution}`. A later changed itemId also
resolves from its new authorized offers; no old track ID crosses the item boundary.

Quality offers add a numeric `height`: `{value:'v720',label:'720p',height:720}`.
`zanni.filo.preferences.quality(offers)` resolves the highest offer at or below
the saved cap, or Auto when no bounded offer is known. It never persists the
value/rung ID. The page owns engine-specific quality selection/capping and
source loading. Audio/original choices are not saved as item-independent caps.
`preferences.qualityResolution(offers)` returns
`{value,requestedCap,resolvedHeight,status}` with status auto/resolved/unsupported.
This is an offer resolution, not proof the engine applied a cap. Auto/Original-only
native HLS has no numeric bounded offer: a saved cap returns Auto, null resolvedHeight
and unsupported. Never describe that fallback as an honored cap. The caller may
retain the saved request for a future capable source without lying about this one.

Remove app-local juglar.speed/juglar.quality reads/writes, not just add another
listener. Use shared read().rate after metadata if the browser resets rate on
source changes. Standalone and aguatv should consume the same contract, not
maintain parallel preference stores. No automatic engine switch is emitted
while attach is constructing; restoration is explicit for app source ordering.

## User intent versus restoration

Player menu/keyboard rate, volume/mute controls, quality and subtitle choices
remember user intent. Native caption chooser changes use the same language
preference. `player.rememberPreferences(patch)` is for a genuine user action in
an app/native adapter; do not call it in response to restoration/state reports.
It emits `filo:preferences {source:'user',preferences,stored}` after the whitelist
write attempt. For a rate choice this precedes filo:rate; for quality it precedes
filo:quality. A subtitle choice may first emit its load/state update, then writes
preferences and emits the user preference event before filo:subtitle. A programmatic
state report or controller-open action must not call rememberPreferences.

Explicit Off saves captionsEnabled=false while retaining the previous language for
later use. A missing or ambiguous offered language restores Off without rewriting
the stored preference; another item may offer that language. Restore is never a
permission to fetch a new descriptor or select a remote target.

`restorePreferences()` emits `filo:preferences {source:'restore',preferences,quality,qualityResolution}`.
Programmatic rate calls are not remembered and filo:rate includes source
user/restore/programmatic. Programmatic setSubtitle retains the existing
no-user-event contract. This prevents restore/save/cast feedback loops.
`preferences:false` on attach opts out of preference storage/restoration.

Restoration never calls play, seeks, opens a cast target, obtains new offers
or sends a remote command. Media volume APIs may be platform-controlled on
phones. iOS system volume cannot be promised by assigning media.volume; Safari
may leave it under hardware/system control. No restored hardware-volume or
cross-device behavior is claimed.
