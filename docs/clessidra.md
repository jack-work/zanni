---
name: clessidra
description: The live dial for anything that expires: a notched ring that empties and turns from green through ochre to red, counting down in place. Read before showing a grant, a token, a lease or any deadline.
---

# clessidra

The hourglass. A ring of 24 notches, filled by the time that remains, and the
time itself in the middle in the mono face.

```html
<span data-clessidra data-remaining-s="1620" data-total-s="3600"></span>
```

or `zanni.clessidra.attach(el, { remaining_s, total_s })`, which returns
`{ set(remaining_s, total_s), left(), stop() }`.

## Rules

- **The server's clock, not the reader's.** The dial takes seconds remaining
  as the server counted them and runs them down with `performance.now()`. A
  phone whose clock is wrong still shows the right time left. An absolute
  `expires_at` is the server's to print, not the dial's to compute.
- **One timer for every dial.** A single 1s interval walks the attached dials
  and drops the ones no longer in the document; it stops when none are left.
- **Colour is a second channel, never the only one.** The fill goes from
  `--clessidra-ok` through `--clessidra-warn` at half to `--clessidra-fail`,
  mixed in oklab, and the text says the same thing: `3d`, `23h`, `59m`, `38s`.
  `aria-label` reads "27 minutes left", and `role="timer"` keeps it quiet.
- At zero the dial gains `clessidra-spent` and fires `clessidra:spent` once,
  bubbling, so the page can grey its row.

The ring is a `conic-gradient` masked twice (a hole and the notches), so it
needs no ground colour behind it and sits on paper, on the stage, or on a card.

## Knobs

`--clessidra-size` (54px), `--clessidra-ring` (6px), `--clessidra-notches`
(24), `--clessidra-ok`, `--clessidra-warn`, `--clessidra-fail`,
`--clessidra-empty`. The defaults are gesso's `--z-*` tokens, so light and dark
follow the page.
