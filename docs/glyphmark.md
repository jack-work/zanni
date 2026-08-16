# glyphmark

The portrait as a pixel mark.

## What figar.org actually does

I checked, because the question was asked: is the figaro brand glyph pixelated
by a filter, a canvas, or a build step somewhere off this machine?

None of the three. In `stubs/figar/index.html`:

```js
var BRAND_GLYPH = 'data:image/png;base64,…';   /* a 26×26 PNG, small palette */
```

```css
.nav-glyph   { width: 38px; height: 38px; image-rendering: pixelated;
               border: 3px solid var(--gold); background: var(--paper); }
.brand-glyph { width: 1.04em; height: 1.04em; image-rendering: pixelated;
               border: 4px solid var(--gold); … }
```

So the pixelation is **two facts and no effect**: the source image is genuinely
tiny (26×26, indexed palette), and CSS scales it *up* with nearest-neighbour.
There was never an image-processing step in the page.

## Why that matters for reuse

`image-rendering: pixelated` on a 1024px photograph shown at 120px does
**nothing you can see**. Downscaling does not go through the nearest-neighbour
path; the property governs magnification. Wearing the class is not enough —
the source has to be small first.

That is what `zanni.lib.pixelate` is for:

```nix
files."profile-pixel.png" = zanni.lib.pixelate {
  inherit pkgs;
  src = ./www/profile.jpg;
  size = 48;              # displayed at 120px → 2.5× magnification
  colors = 24;
  saturation = 42;        # drain the original hues…
  tint = "#a2762a";       # …and pull what is left toward gold
  tintAmount = 22;
};
```

### Bringing it into the palette

`saturation` drains the photograph's own colours; `tint` then pulls what
remains toward one of them, by `tintAmount` percent.

This is deliberately **not** a gradient map. Mapping luminance straight onto an
ink→oxblood→gold→paper ramp is the obvious idea and it looks wrong on a
portrait: a bright background becomes gold while the face — mid-luminance —
drops to dark oxblood, so the subject reads as a hole. Tried, rendered,
rejected. Draining and tinting keeps a face a face while making it belong to
the page.

`levels` adds a little contrast back, because quantising to twenty-odd colours
flattens exactly the midtones a face is made of.

```html
<img class="glyphmark glyphmark-round" src="profile-pixel.png" alt="…">
```

Reproducible, in the build, out of git. `zanni-check` warns if an element
wearing `.glyphmark` points at something that does not look small — it can only
see the filename or a data URI's length, so it says only what it can see.

## Choosing the ratio

figar.org's glyph is 26px shown at 38px — **1.46× magnification**, which is
where the grid reads clearly without turning a face into a puzzle. Pick the
source size from the displayed size and the ratio you want:

| source | displayed | ratio | reads as |
|---|---|---|---|
| 26px | 38px | 1.46× | the figaro glyph: unmistakably a bitmap |
| 80px | 120px | 1.5× | a pixel portrait; features still legible |
| 96px | 120px | 1.25× | a photograph with a visible grain |

Higher resolution than the figaro glyph was the request, and 80/120 is the
setting used on jack.kelliher.info. `--glyphmark-size` and `--glyphmark-border`
tune the CSS side; `size` and `colors` tune the file.

## What it costs

Less than the photo it replaces — an 80px indexed PNG is about 3KB against
70KB of JPEG. The only cost is a build-time imagemagick, and the only trap is
the one above: pixelated without a small source is a no-op that looks like a
CSS bug.
