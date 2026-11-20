---
name: nodi
description: One renderer per aria node kind and the keyed list that draws turns. Read before adding a node kind, changing how a turn is drawn, or feeding the renderers from something other than an AriaStream snapshot.
---

# nodi

Draws a figaro's transcript. Input is what `figaro-forms/aria` already folds:
`stream.snapshot().turns` (TurnView[]), or events folded by `nodi.events()`.

## Pieces

- `nodi.model(turns)` is pure. A turn becomes `{key, turn, input, items, end, open}`.
  `input.parts` is one entry per sender segment with `role` (`you` when the
  sender is absent, `aria` when it looks like an aria id, `caller` for any other
  label) and `label` (sender name, else the sender, else "You"). `items` are
  prose, thinking, steering, tool or unknown. `end` is kept only for an error or
  a stop reason other than `stop`.
- `nodi.events()` folds AriaEvents into the same turn shape. A delta replaces a
  node's text, so a node re-sent at a cursor is not repeated. An event kind it
  does not know becomes an unknown node and counts in `skipped`.
- `nodi.log(doc, ol, {decorate})` keeps `ol` in step with a TurnView list.
  `update(turns)` reuses elements by turn and node, only moves what is out of
  place, and rebuilds only the markdown block a delta lands in. `turnEl(n)`,
  `nodeEl(n, i)`, `slot(n, i)` (the empty `.nodi-voice` inside a prose node, for
  a player) and `on(fn)` (a node element was created) are the hooks.
- `nodi.renderers` has `input`, `prose`, `thinking`, `steering`, `tool`,
  `unknown`, `end`, `error` and `metrics`. Each is `create(dom)` giving `{el,
  update(item)}`. An unknown kind is drawn as a labelled block with its text.

## Laws

One function (`put` in `nodi.dom`) writes server text, as text nodes, and
boxes control, bidi and zero-width characters as `U+202E`. Nothing here uses
innerHTML or sets a style or handler. A link's `href` is set only when it starts
with `http://`, `https://` or `mailto:`. `test/nodi.test.js` scans for the sinks;
`test/figchat.test.py` swaps `put` for an HTML sink and requires the hostile
turn to fire.

Thinking and tool blocks are `details`, collapsed, with the stair caret. Their
open state is the user's: `update` never touches it.

Faces: Jacquard 24 display, EB Garamond text, VT323 for bylines, tools, ends and
metrics. No sans.
