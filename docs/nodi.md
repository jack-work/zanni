---
name: nodi
description: One renderer per aria node kind and the keyed list that draws turns. Read before adding a node kind, changing how a turn is drawn, or feeding the renderers from something other than an AriaStream snapshot.
---

# nodi

Draws a figaro's transcript from figaro-forms/aria's native fold: `snapshot().view`
(`{closed: Message[], open?: Message}`) and the `done` entries of `snapshot().ends`.

## Pieces

- `nodi.model(view, ends)` is pure. Messages of one turn are joined: the inquiry
  rides the from==0 message, nodes get their number from `from + i`, nodes of the
  open message are unsettled. A turn is open while `view.open` names it and no
  done entry is known. `input.parts` is one entry per inquiry segment with `role`
  (`you` when the sender is absent, `aria` when it looks like an aria id,
  `caller` for any other label) and `label`. `items` are prose, thinking,
  steering, tool or unknown, chosen by `node.type` only. `end` is kept only for
  an error or a reason other than `stop`.
- `nodi.log(doc, ol, {decorate})` keeps `ol` in step with a model.
  `update(model)` reuses elements by turn and node, only moves what is out of
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
