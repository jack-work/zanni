# boil

Animated fractal-noise displacement over type and chrome. The technique is
line boil — Squigglevision — and it is **not** a blur, though a small blur is
part of the type recipe. `feTurbulence` steps a *discrete* seed; the resulting
noise drives an `feDisplacementMap` over the source graphic; for type only, a
0.4 blur and an alpha table then re-crisp the edge that the displacement
roughened.

Source of truth for every number below:
`~/dev/spain-flake/master/stubs/figar/index.html` (figar.org, live).

## Three filters, not one

| filter | worn by | scale | seeds | dur | chain |
|---|---|---|---|---|---|
| `#pixel-text` | type, navbar | 1.2 | `3;7;13;5;11;3` | 1.2s | displace → blur 0.4 → `feFuncA table "0 0.2 1 1 1"` |
| `#pixel-stage` | diagram SVG | 1.4 | `7;3;12;5;9;7` | 1.6s | displace only |
| `#pixel-ui` | frames, rails, ornaments | 0.9 | `11;4;9;14;6;11` | 1.4s | displace only |

The three durations are deliberately coprime-ish (1.2 / 1.4 / 1.6s) so the page
never pulses in unison. **The desync is the effect.** One clock reads as a
strobe; three read as a living surface.

`baseFrequency` is 0.9 and `numOctaves` is 1 everywhere. `calcMode="discrete"`
is what makes it *step* between fixed noise patterns rather than tween through
them — tweening looks like a heat haze, stepping looks like ink.

## Things that are easy to drop and fatal to drop

**Filter regions.** `#pixel-text` is `x="-6%" y="-14%" width="112%"
height="128%"`; stage is ±2%/104%; ui is ±3%/106%. The default region is the
element's box, and displaced edges leave it. The type region is taller than it
is wide because descenders exit vertically first.

**`color-interpolation-filters` is never set.** The chain therefore runs in the
SVG default `linearRGB`. The blur and the alpha ramp were tuned there. Pin
`sRGB` and the type stops matching figar.org — retune deliberately or leave it
alone.

**No alpha threshold on `#pixel-stage`.** It would destroy low-alpha fills and
dimmed layers. The design-system reference says *never add one*; `zanni-check`
enforces it.

**Reduced motion is JavaScript.** A blanket `@media (prefers-reduced-motion:
reduce) { * { animation: none !important } }` does nothing to SMIL. `boil.js`
removes the `<animate>` elements instead, which freezes each filter on its
initial seed — still displaced, no longer moving. Ship `boil.css` without
`boil.js` and reduced-motion readers get the full boil.

## The five laws of wearing it

1. **Never boil a wrapper.** A filter is a containing block for `fixed` and
   `absolute` descendants, so boiling a section silently reparents every fixed
   child. figar.org filters leaf-ish elements only. (`.rail` is itself
   `position: fixed` *and* filtered — that is fine; the filter is on it, not
   above it.)
2. **A filter creates a stacking context.** This produced a real bug on
   figar.org: a dragged portrait could not escape the navbar's context even at
   `z-index: 9999`; the fix was raising the *ancestor's* z-index. Anything you
   lift — drag, tooltip, modal — meets this.
3. **A boiled subtree is one raster unit.** Any visual change inside
   re-rasterizes all of it. On figar.org that single fact drove the entire
   animation architecture: one 30 Hz governor with quantized, dirty-checked
   writes, which took DOM writes from 4800 to 274 and forced layouts from 1200
   to 0. **Open question:** the raster cost itself was never measured. Those
   numbers are write counts, not paint milliseconds. Treat the mitigation as
   reasoned, not observed, until somebody profiles it.
4. **Give clipped text slack.** Displacement moves glyph edges by roughly
   ±scale/2 px; a line flush against an `overflow: hidden` edge loses its
   descenders. figar.org pads such boxes ~4px; `.boil-slack` is that padding.
5. **Boil alone is shimmer and nothing more.** figar.org's texture is boil
   *plus* the `repeating-conic-gradient` dither ground, the scanlines,
   `image-rendering: pixelated`, and the Jacquard 24 / EB Garamond / VT323
   triple. `examples/card.html` shows the difference in three panels rather
   than asking anyone to imagine it.

## Tuning knobs

- displacement `scale` — calmer as it falls;
- `dur` — lazier as it rises;
- the `feFuncA` table — crispness of type;
- the type blur `stdDeviation` — how much softening the table has to undo.

Turn one at a time. The four interact.

## Why it must be inlined

`filter: url(#id)` resolves only within the same document. External
`url(sprite.svg#id)` works in Firefox and, in practice, not in Chrome or
Safari. So boil cannot be delivered as a linked stylesheet; `zanni-inline`
injects the defs, the styles and the script into the page at build time.
Note that this project's only local browser is Firefox — the one browser that
would falsely reassure you here — so the inline path is unconditional rather
than conditional on a test we cannot honestly run.
