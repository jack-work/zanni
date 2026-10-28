---
name: proscenio
description: Draft spec for zanni's shared page header, taken from keel's viewer bar. Read before building the component, wiring a page to it, or changing keel's or aguatv's header. Status: spec, not built.
---

# proscenio

The arch that frames the stage. One header for keel, aguatv, the TV receiver
and anything else on the estate. The page hands it pieces; proscenio owns the
layout, the collapse on phones, the drawer, focus and keys. A page never writes
responsive CSS for its header, and the TV gets its header by passing
`mode: 'tv'`, not by a fork.

Status: spec. Written from keel's bar (`keel/viewer/web/app.js`, `bar.js`,
`app.css` at 50f1a4d). Nothing here is built yet.

## What keel's bar does today

| piece | keel | wide (≥900px) | narrow (<900px) |
|---|---|---|---|
| drawer toggle | `#b-tree` ☰ | toggles the tree column | opens the tree as a left drawer over a scrim |
| identity | `#b-crumbs` | path crumbs, ellipsised, take the free space | same, first to shrink |
| tools | `#b-tools`: repo, ref select, views, nav, live chip, theme | inline, in a fixed order | folded behind ⋯ into a dropdown panel |
| actions | `#b-stale`, `#b-pane` ¶ | inline | stay in the bar |
| more | `#b-more` ⋯ | absent | opens the tools panel; closes on an outside click, on choosing a link or button, on a select's change |

One breakpoint, 900px ("one threshold, as keel learned the hard way"). Below
it the bar is `position: fixed`, 44px. It hides when the content scrolls down
by more than 4px and returns when it scrolls up or reaches the top. While
hidden, a tap in the top 48px brings it back and swallows that click. A drawer
or the menu keeps it shown. `--bar-shown` (44px or 0) lets sticky headers and
`scroll-margin-top` follow it.

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

`drawer-toggle` names the drawer by `aria-controls`. On narrow screens
proscenio turns that element into a left drawer over a scrim: width
min(85vw, 340px), focus moves in and is held there, Escape or the scrim closes
it and focus returns to the toggle, a swipe left closes it. The trap holds Tab only: arrows, Enter and
Space belong to the drawer's content, so a panel driven by its own keys keeps
working, on the TV too, where Escape or Back closes it. On wide screens the
toggle only fires `proscenio:drawer {open}`, and the page decides whether its
column shows. aguatv's details drawer uses the same piece from the right
(`data-side="right"`), which is the real drawer Gluck asked for.

## Keys

| key | does | mode |
|---|---|---|
| `/` | focuses search | default, if a search slot exists and `keys.search` is not false |
| Escape | closes search, then the ⋯ panel, then the drawer; returns focus | all |
| ← → | move between bar stops | tv, while focus is in the bar |
| ↓ | leaves the bar | tv |

Keys typed into inputs are text. A page that owns `/` (aguatv's gallery)
passes `keys: { search: false }`.

## Page contract

`--proscenio-height` on `<html>` is the bar's height. `--proscenio-shown` is
the same, or 0 while hidden on scroll; use it for sticky offsets and
`scroll-margin-top`. Hide on scroll watches `opts.scroller`: an element, the
window, or by default any scroll in the document. Its rules run only while the
header is rendered: a page that hides its header (aguatv's watch and details
views) is never overridden, and the top-edge tap does nothing then. Events bubble from the header: `proscenio:menu {open}`,
`proscenio:drawer {open}`, `proscenio:search {open}`, `proscenio:hidden {on}`,
`proscenio:leave`. The handle: `open(what)`, `close()`, `show()`, `enter()`,
`setIdentity(nodeOrText)`, `destroy()`.

## Look

gesso ground, a 2px ink rule along the bottom, Jacquard mark, VT323 for
identity and status, the shared pixel icons (☰ drawer, magnifier, ⋯, ✕). No
filter on the bar: it repaints on scroll.

## Adoption

1. Build in zanni to this spec, with a browser test for each row of the
   tables above.
2. aguatv wears it: phone gallery (cast as an action, clock as status, search
   with `keys.search: false`), and the receiver with `mode: 'tv'`. It drops
   `.masthead`.
3. keel moves onto it when its owner agrees: `#bar`, `bar.js` and the narrow
   CSS go; the tree and comments panes keep their own sheet for now.

## Open questions

- keel's comments pane is a bottom sheet on phones. Is that a second drawer
  side (`data-side="bottom"`), or does it stay keel's?
- Identity: one line, ellipsised. Agreed with aguatv.

## Reviews

- aguatv (Ministro de TV IV): accepted with the changes now folded in:
  explicit `enter()`, a plain-span mark, scale 1 on the receiver, `scroller`,
  never forcing a hidden header visible, the Tab-only trap, slots moved not
  cloned.
- keel (El Taller VI): asked, not yet answered.
