---
name: motion
description: What moving a boiled element actually costs, and the claim this file exists to correct. Read before animating transform, scale, rotate or translate on or above a filtered element, or before assuming motion is expensive.
---

# Motion over a filter

**Moving a filtered element does not re-rasterise it.** The compositor carries
the cached raster. Cost comes from the filter's own seed animation, and is the
same whether the element is still or flying.

## The correction

An earlier version of `heft.css` and a report to Gluck said that moving a
filtered subtree re-rasterises it every frame, ~60/s against the seed's 5/s,
and that this was the worst case in the library. **That was wrong.** It was
reasoned from the SMIL measurement, never measured, and stated as fact.

`.heft.held { filter: none }` is still worth keeping, but for a different
reason: it removes the filter's ongoing raster cost during the drag, which is
the seed stepping. It does not avoid a motion penalty, because there is none.

## Measured

Chrome 145, headless, 1280x900 @1x, CPU raster, 5s windows.

Filter on children, animation on the parent:

| variant | raster | vs still |
|---|---|---|
| boiled leaves, parent still | 669 ms | 1.00x |
| parent animating `rotate` + `scale` | 594 ms | 0.90x |
| parent sweeping `scale` 0.2 to 1.0 | 608 ms | 0.91x |
| parent sweeping `translate` +-160px | 546 ms | 0.82x |
| same, filters removed | 0 ms | 0.00x |
| animation with no filters anywhere | 0 ms | 0.00x |

Filter on the moving element itself:

| variant | raster | tiles |
|---|---|---|
| filtered, still | 480 ms | 630 |
| filtered, translating | 393 ms | 105 |
| unfiltered, translating | 0 ms | 0 |

Motion is free in both shapes. Promotion to its own layer *reduces* the tiles
rastered, which is why the moving cases measure slightly cheaper.

## What this means

| question | answer |
|---|---|
| animate a parent of boiled leaves? | yes, no raster penalty |
| entrance sweeping scale from near zero? | yes |
| drag a boiled element? | yes |
| is the filter free? | no. It costs whether or not anything moves |

The lever remains the filter itself: how much **area** is filtered, and whether
it animates at all. See `boil.md`.

## Scale and the filter's strength

Displacement is in the element's local coordinate space, so a filtered element
at `scale: 0.2` shows displacement scaled down with it: boil looks about five
times weaker and resolves as the element grows. An entrance that scales up
therefore has boil strengthen into place. That is a real effect, not a bug, and
it cannot be tuned away from inside the filter.

The same applies to `phosphor`: its comb pitch scales with the element, so a
3px pitch at `scale: 0.2` lands near 0.6px on screen and will alias. Transient
during an entrance; `.phosphor-soft` ramps instead of stepping and shows it
less.
