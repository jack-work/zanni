---
name: nodi
description: The pure model and markdown parser behind a figaro transcript. Read before adding a node kind, changing how markdown is parsed, or feeding the model from something other than an AriaStream snapshot. The DOM is drawn by zanni-react.
---

# nodi

Turns figaro-forms/aria's native fold into a transcript model, and parses its markdown, from: `snapshot().view`
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
- `nodi.blocks(text, live)` parses markdown into p, h, hr, ul, ol, quote, code
  and table blocks (GFM: a header line with a pipe, a delimiter row of the same
  width, then rows; `:--`, `:-:`, `--:` set `align`; `\|` and code spans keep
  their pipes; a short row is padded). With `live` true the line being typed
  stays out: a half-written row or delimiter waits for its newline, and an open
  fence is a code block with `open: true`.
- `nodi.stream(state, text, live)` is the same parse for a text that only grows.
  `state` comes from `nodi.streamState()` and remembers where the last block
  started; a delta re-parses only from there, every earlier block is the same
  object as before, and text that is not an extension starts over. It equals
  `blocks(text, live)` at every prefix (`test/nodi.test.js`). zanni-react's
  `BlockView` is memoized on block content, so settled blocks keep their DOM
  nodes and do no work while a reply streams.

## Laws

nodi is pure: it touches no document and writes no text into a page
(`test/nodi.test.js` scans for it). zanni-react draws the model as React text
nodes, boxing control, bidi and zero-width characters as `U+202E` through
`nodi.reveal`, and sets a link's `href` only when it starts with `http://`,
`https://` or `mailto:`. Nothing uses innerHTML or sets a style or handler;
`test/figchat.test.py` checks the built page for hostile text.

Thinking and tool blocks are `details` with the stair caret, open by default.
Their open state is the user's.

Faces: Jacquard 24 display, Source Serif 4 text, VT323 for bylines, tools, ends and
metrics. No sans.
