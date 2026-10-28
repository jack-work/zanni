---
name: proscenio
description: The shared page header, taken from keel's viewer bar. Read before building the component, wiring a page to it, or changing keel's or aguatv's header. 
---

# proscenio

The arch that frames the stage. One header for keel, aguatv, the TV receiver
and anything else on the estate. The page hands it pieces; proscenio owns the
layout, the collapse on phones, the drawer, focus and keys. A page never writes
responsive CSS for its header, and the TV gets its header by passing
`mode: 'tv'`, not by a fork.

Written from keel's bar (`keel/viewer/web/app.js`, `bar.js`,
`app.css`), built in zanni 0.15.0.

## What keel's bar does today

Read against keel master e31a846, which spain runs, and corrected by keel's
owner.

| piece | keel | wide (≥900px) | narrow (<900px) |
|---|---|---|---|
| tree toggles | `#b-tree-w` (wide), `#b-tree` (narrow) | hides the tree column, persisted in `paperd.tree` | opens the tree as a left drawer below the bar, over a scrim |
| comments toggle | `#b-pane` ¶ | hides the pane column, persisted in `paperd.pane` | opens comments as a bottom sheet, 55vh, over the scrim |
| repo name | `#b-repo`, 26px display face | a tool, inline | folds into ⋯ |
| ref | `#b-ref` select | inline, before the crumbs | folds |
| crumbs | `#b-crumbs` | ellipsised, take the free space | stay, first to shrink |
| tools | views (`#b-views`), zoom (`#b-zoom`, previews only), nav, theme | inline | fold; the views split button is hidden on phones, not folded |
| status | `#b-live`, or `#b-stale` in its place | inline | stay |
| more | `#b-more` ⋯ | absent | opens the folded tools; closes on an outside click, on choosing a link or button, on a select's change |

Wide order: tree, repo, ref, crumbs, views, zoom, nav, live or stale, theme,
¶. One breakpoint, 900px (matchMedia min-width 900, CSS max-width 899),
shared with keel's `.split` and `.mdpage` CSS.

Below 900px the bar is `position: fixed`, 44px. A capture listener on `#main`
tracks each scrolling element: at or above the bar's height the bar shows; a
downward step of more than 4px hides it unless the drawer, the comments sheet
or the menu is open; an upward step of more than 4px shows it. Hiding closes
the menu; crossing 900px clears both. While hidden, a tap in the top 48px
shows it and swallows the next click within 500ms, but only for a primary
pointer that moved less than 10px, lifted within 350ms, and left the text
selection unchanged: those guards keep drags and selections from triggering
it. `--bar-shown` lives on `body`, set only below 900px, read with a 0
fallback; `.dfile-head` and `.build-status` stick to it. The scrim closes
both drawer and sheet; choosing a file or any route change closes the drawer.

keel has no focus trap, no Escape for its drawer or sheet, and no swipe. In
this spec those are new behaviour, marked as such below. keel's look is its
own: `--panel` ground, a 1px `--line` rule, and a light/dark toggle.

## The component

Declarative, attached at load:

```html
<header data-proscenio>
  <button data-slot="drawer-toggle" aria-controls="tree">files</button>
  <a data-slot="mark" href="/">keel</a>
  <nav data-slot="identity">jack / zanni / docs</nav>
  <nav data-slot="nav"><a href="…" aria-current="page">code</a><a href="…">diffs</a></nav>
  <input data-slot="search" type="search" placeholder="search">
  <span data-slot="status"><time>22:31</time></span>
  <span data-slot="tool"><select>…</select></span>
  <button data-slot="action">cast</button>
</header>
```

or `zanni.proscenio.attach(header, opts)` with the same pieces as elements.

| slot | meaning | wide | narrow | tv |
|---|---|---|---|---|
| `drawer-toggle` | opens the page's drawer | inline | inline, first | absent |
| `mark` | the site's wordmark: a link, or a plain span where a link would leave a fenced app | Jacquard | Jacquard, smaller | Jacquard, large |
| `identity` | where you are: crumbs or "admin · TV" | takes the free space, ellipsises | second line under the mark, or ellipsised | inline |
| `nav` | sibling pages | inline tabs | in the ⋯ panel | inline, D-pad stops |
| `search` | the page's own input | inline, grows on focus | a magnifier that opens the field across the whole bar, with ✕ | not rendered |
| `status` | clock, live chip | inline, muted | in the ⋯ panel | inline, large |
| `tool` | secondary controls | inline | in the ⋯ panel | inline |
| `action` | primary controls (cast, reload, comments) | inline | stay in the bar, as icons where they carry one | inline, D-pad stops |

Order is fixed by the component, not by source order, so pages cannot drift.
A slot may hold several elements (keel's identity is the ref select and the
crumbs). Per element, `data-narrow` overrides the slot's narrow behaviour:
`fold` sends it into ⋯ (keel's repo name, as a mark), `hide` drops it on
phones (keel's split button), `keep` leaves it in the bar.

Drawer toggles go where their drawer opens: a `data-side="left"` drawer's
toggle leads the bar, a right or bottom drawer's toggle ends it (keel's ¶).
Slotted elements are moved, never cloned, so their listeners survive (aguatv's
cast action is bacchetta's wrapped button). Every slot is optional; a bar with
only a mark is valid.

## Modes

| | `default` | `tv` |
|---|---|---|
| breakpoint | 900px | never collapses |
| ⋯ panel | below 900px | never |
| search | yes | never |
| hide on scroll | below 900px | never |
| type | 1x | `--proscenio-scale` (default 1.5; a page whose root font is already viewport-sized sets 1) |
| hover and tap affordances | yes | none: no hover colours, no pressed states |
| focus | Tab order | D-pad: ← → move between stops, ↓ leaves to the page (`proscenio:leave`). Entry is explicit: the page calls `enter()` when its own focus model says so; with no stops it is a no-op |
| focus ring | after a key, never after a tap (zanni's modality rule) | always |

## Drawer

Any number of `drawer-toggle`s, each naming its drawer by `aria-controls`;
the drawer's `data-side` is `left`, `right` or `bottom` (a 55vh sheet). Only
one is open at a time. On narrow screens
proscenio turns that element into a left drawer over a scrim: width
min(85vw, 340px), focus moves in and is held there, Escape or the scrim closes
it and focus returns to the toggle, a swipe toward its side closes it (new for keel: the trap, Escape and
the swipe). The trap holds Tab only: arrows, Enter and
Space belong to the drawer's content, so a panel driven by its own keys keeps
working, on the TV too, where Escape or Back closes it. Drawers sit below the bar (`top: var(--proscenio-shown)`), not over it, and
the scrim starts there too. Opening a drawer, from a toggle or from code, leaves the bar's
hide state alone: keel opens its comments sheet when a selection starts a
comment, often under the hidden bar, and a selection must never move the bar. Choosing a link inside the open drawer, or a
`popstate`, closes it. On wide screens the toggle only fires
`proscenio:drawer {id, side, open}`, where `open` is the column's new state:
proscenio tracks it per drawer, starting from the toggle's `aria-expanded`
(absent means shown), and the page shows or hides its column and persists
the choice (keel's `paperd.tree`, `paperd.pane`). Crossing from narrow to
wide closes an open drawer and its scrim quietly, with no event, so a wide
page never reads it as a toggle. aguatv's details drawer uses the same piece from the right
(`data-side="right"`), which is the real drawer Gluck asked for.

## Keys

| key | does | mode |
|---|---|---|
| `/` | focuses search | default, if a search slot exists and `keys.search` is not false |
| Escape | closes search, then the ⋯ panel, then the drawer; returns focus. Never from a textarea or input other than the search field, so keel's comment composer keeps its own Escape (new for keel) | all |
| ← → | move between bar stops | tv, while focus is in the bar |
| ↓ | leaves the bar | tv |

Keys typed into inputs are text. proscenio binds nothing else, so a page's
own keys (keel's + - 0 zoom) stay the page's. A page that owns `/` (aguatv's gallery)
passes `keys: { search: false }`.

## Page contract

`--proscenio-height` on `<html>` is the bar's height. Below 900px, where the
bar is fixed, `--proscenio-pad` is that height (pad the page by it) and
`--proscenio-shown` is the height or 0 while hidden on scroll (sticky offsets,
`scroll-margin-top`); above 900px and in tv mode both are 0, as keel's
`--bar-shown` is unset there. Hide on scroll watches `opts.scroller`: an element, the
window, or by default any scroll in the document. Its rules run only while the
header is rendered: a page that hides its header (aguatv's watch and details
views) is never overridden, and the top-edge tap does nothing then. Events bubble from the header: `proscenio:menu {open}`,
`proscenio:drawer {open}`, `proscenio:search {open}`, `proscenio:hidden {on}`,
`proscenio:leave`. The handle: `open(what)`, `close()`, `show()`, `enter()`,
`setIdentity(nodeOrText)`, `destroy()`.

## Look

Every colour and the rule are knobs, defaulting to gesso's `--z-*` tokens,
which already follow light and dark: `--proscenio-ground`, `-ink`, `-muted`,
`-accent`, `-focus`, `-shadow`, `-rule` (default `2px solid` ink), plus
`--proscenio-bar` (44px), `--proscenio-scale`, `--proscenio-z` and the three
faces. They sit in a zero-specificity rule, so keel maps them to `--panel`,
`--line` and its theme toggle with one rule of its own. Jacquard mark, VT323
identity and status, the shared pixel icons (magnifier, ⋯, ✕). No filter on
the bar: it repaints on scroll.

## Adoption

1. Build in zanni to this spec, with a browser test for each row of the
   tables above.
2. aguatv wears it: phone gallery (cast as an action, clock as status, search
   with `keys.search: false`), and the receiver with `mode: 'tv'`. It drops
   `.masthead`.
3. keel moves onto it when its owner agrees: `#bar`, `bar.js` and the narrow
   CSS go; the tree and comments panes keep their own sheet for now.

## Open questions

- Identity: one line, ellipsised. Agreed with aguatv.

## Reviews

- aguatv (Ministro de TV IV): accepted with the changes now folded in:
  explicit `enter()`, a plain-span mark, scale 1 on the receiver, `scroller`,
  never forcing a hidden header visible, the Tab-only trap, slots moved not
  cloned.
- keel (El Taller, @2b443573): the account above is theirs. keel will move
  `#bar` and `bar.js` onto proscenio once built, on these terms: dark theme
  through keel's tokens, behaviour parity with each row as a browser test
  (tap guards and the sheet holding the bar included), vendored into
  `viewer/web/vendor` at a pinned zanni commit, Escape never taken from the
  composer, keel's zoom keys untouched, breakpoint 900, and the keel change
  theirs to land after a phone-width check. Comments sheet: `data-side="bottom"`.
