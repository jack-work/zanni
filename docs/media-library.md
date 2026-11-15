# catalogo and titolo

Shared media UI, not another app. Link catalogo.css/js and titolo.css/js from
their asset directories, loading catalogo before titolo. They use gesso and
fontpack tokens with fallbacks, and v2 spacing/control tokens when available.
These are linked-file components, not zanni-inline marker blocks. The example
is examples/media-library.html. It labels its sample records as synthetic and
uses no invented movie artwork.

## Input

Pass already-authorized records with existing fields:
`{key, title, poster, duration, position, kind}`. kind is audio or video,
not inferred Movies/Series. position is null or `{position, duration}` in
seconds. A duration must be known before resume/progress can be shown.
Resume uses the existing rule: position >5 seconds and <duration-10 seconds.
Near the end, Play/Listen starts at0. No watched/NextUp/series semantics are
invented. A modified-desc list must not be labelled recently watched.

poster must be a same-origin HTTP(S) image URL without embedded credentials.
The component cannot decide authorization: the caller filters records first
and the existing server read gate protects artwork. No API/library/cast request
is made by either component. Absent or failed art remains an honest labelled
landscape frame, never a fabricated poster or a cropped landscape movie still
pretending to be portrait artwork.

## Catalog

```js
const shelf = zanni.catalogo.mount(host, {
  title: 'Continue watching',
  layout: 'shelf',
  resumeOnly: true,
  mode: 'tv',
  items,
  onSelect(item) { showTitle(item.key); }
});
```

layout defaults to grid; mode defaults to desktop. TV cards are larger and
fewer, with the same data. Labels always remain visible below artwork.
`setItems(items)` preserves focus by exact key, not title or global content
identity; if the focused item disappears it chooses the nearest surviving
index. `focus(key)` restores an item, and `focusedKey` exposes the current key.
`setMode('tv'|'desktop')` changes density without a component fork. `destroy()`
removes this mounted UI. An empty list says so, without extra sample content.

Arrows traverse actual rows; vertical movement remembers the intended column
through a short final row. Home/End reach the row edges. One roving tab stop
keeps a long library from filling the tab order. `key(key)` accepts remote
D-pad/Enter through this same path, including real activation for synthetic
Enter. Ordinary keyboard Enter uses the browser's button activation.
Pointer input removes the explicit remote focus class. At a boundary,
`catalogo:edge {key,direction}` bubbles so the app can enter another shelf or
header. `catalogo:select {key,item}` also bubbles for app event wiring.

## Title surface

```js
const title = zanni.titolo.mount(host, {
  item,
  onBack() { returnToLibrary(); },
  onPlay(item, position) { startWatch(item.key, position); }
});
```

The surface never starts playback itself. It offers Play, Listen or Resume
using the actual record and saved position. The optional Back callback remains
app routing, not a second history stack in zanni. `setItem(item)`, `focus()`,
`setBusy(bool)`, `setMode(mode)` and `destroy()` are available. A Play action
bubbles `titolo:play {key,item,position}`. Missing metadata is omitted rather
than filled with ratings, dates, genres or invented seasons.

Apps own route URLs, authenticated API calls, selected receiver, cast actions,
player source selection and return item/scroll position. Preserve the origin
before entering the title/watch surface and use catalogo.focus(key) when
returning. The example demonstrates that wiring without an app-local UI fork.
Existing proscenio owns shell/navigation and filo owns the watch controls and
native captions. These components neither replace them nor fetch new media.
