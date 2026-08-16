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

## Knobs, and why they are not CSS

**A filter cannot be tuned from a stylesheet.** `scale`, `baseFrequency` and
`stdDeviation` are XML attributes on the filter primitives, not CSS
properties, so `var()` inside them does not resolve — Chrome reads an invalid
number and the element renders *completely unfiltered*, with no error.
Verified in Chrome 145 against a literal control. That is why boil has two
knob mechanisms and neither is a custom property.

### 1. Class — pick an intensity at runtime

```html
<h1 class="boil-text">…</h1>            <!-- as figar.org ships -->
<h1 class="boil-text-squiggle">…</h1>   <!-- strokes visibly bend -->
<h1 class="boil-text-strong">…</h1>     <!-- theatrical -->
```

Also `-ui-` and `-stage-`. Each is a separate `<filter>` in the defs.

### 2. `--set` — set the house strength at build time

```sh
zanni-inline --set boil.text.scale=2.4 --set boil.text.freq=0.08 page.html
zanni-inline --set boil.driver=smil page.html
```

Knobs: `boil.driver`, and per register (`text`/`stage`/`ui`) `freq`, `scale`,
`dur`, `blur`, `seeds`, `region`. **An unknown knob is an error, not a
no-op** — a setting that quietly does nothing is the failure mode this
library exists against.

### The lever that actually matters is `freq`, not `scale`

`baseFrequency` is the *wavelength* of the noise.

- **High (0.9, the default):** neighbouring pixels get uncorrelated offsets.
  The effect reads as fuzz. Raise `scale` here and glyphs **erode** — they
  get chewed, not bent.
- **Low (0.05):** neighbouring pixels move together, so whole strokes flex.
  *That* is line boil and Squigglevision.

If the boil looks too subtle, lowering `freq` is the fix. Raising `scale`
alone at `freq: 0.9` makes it damaged rather than lively.

Below ~0.02 the wavelength exceeds the text and the whole word merely
translates — motion without squiggle.

## What it costs

Measured, not reasoned. Chrome 145, headless, 1280×900 @1x, CPU raster, 5s
windows, summed across raster threads. Absolute figures are not a claim about
any particular laptop; the **ratios** are the transferable fact.

### Animating at all is the entire cost

| variant | raster | vs shipping |
|---|---|---|
| no filter | 0 ms | — |
| boil with no animation | 0 ms | — |
| SMIL, `dur=20s` (seed steps every 3.3s) | 60.0 s | 0.99× |
| SMIL, `dur=1.2s` (every 0.2s) | 60.6 s | 1.00× |
| SMIL, `dur=0.3s` (every 0.05s) | 60.4 s | 1.00× |
| **JS driver, same seeds at the same 5Hz** | **5.7 s** | **0.09×** |

Read the first four rows carefully: **the seed rate does not matter to SMIL.**
Twenty seconds costs the same as three tenths. That is the signature of a
subtree marked dirty *every frame* rather than on change — Chrome
re-rasterises ~60×/s while the output only changes 5×/s, so 55 of every 60
rasters are pixel-identical and discarded.

Writing the seed from script only when it changes removes that waste, which
is where the ~11× comes from. On the shipped artifact end-to-end it measured
**14×**. This is why `boil.js` is not optional and why `driver: js` is the
default; `--set boil.driver=smil` remains for pages that must animate with no
script, and costs what it costs.

### Intensity is nearly free

| setting | raster | vs default |
|---|---|---|
| default (`freq 0.9`, `scale 1.2`) | 3.30 s | 1.00× |
| squiggle (`freq 0.05`, `scale 3`) | 3.00 s | 0.91× |
| strong (`freq 0.05`, `scale 6`) | 3.20 s | 0.97× |
| default, blur + alpha tail removed | — | 0.99× |

Within noise. **A more visible squiggle is not more expensive.** The blur and
alpha table are free too.

### Area is the real scaling factor, and it caps at the viewport

| filtered area | raster | vs 1× |
|---|---|---|
| 0.25× | 17.5 s | 0.30× |
| 0.5× | 33.3 s | 0.57× |
| 1× (fills the viewport) | 58.9 s | 1.00× |
| 2× (twice the document) | 58.5 s | 0.99× |

Roughly linear in filtered area, then **flat** — content scrolled off screen
is not rastered. So the worst case is bounded by the viewport, not by document
length. Cost ≈ *visible filtered area × per-pixel work × frames re-rastered*,
and the driver is what governs the last term.

### Still unmeasured

Everything above is one machine, headless, CPU raster, one browser. GPU
raster, a real compositor and a phone may weight these differently — in
particular `feTurbulence` is procedural noise generated per pixel, and a GPU
may amortise it far better or far worse. Treat the ratios as sound and the
absolutes as local.

## Why it must be inlined

`filter: url(#id)` resolves only within the same document. So boil cannot be
delivered as a linked stylesheet; `zanni-inline` injects the defs, the styles
and the script into the page at build time.

**Measured**, 2026-08-16, Google Chrome for Testing 145.0.7632.6, headless,
three lines of identical type — unfiltered, `url(sprite.svg#pixel-text)`,
`url(#pixel-text)` where the defs are inline in the document:

- the inline line boils;
- the external line renders **pixel-identical to the unfiltered one**.

Note the shape of that failure. It is not an error, not a console warning, not
an unrendered element: the filter is simply *not applied* and the page looks
fine. A packaging mistake here produces exactly the silent disappearance this
library exists to prevent, which is why `zanni-check` asserts on the built
artifact rather than trusting the recipe.

Safari is untested here — no Safari on this machine. WebKit has historically
followed Chrome on this point, but that is inference, not measurement.
