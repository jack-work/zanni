# zanni

The visual effects of [figar.org](https://figar.org), extracted so other sites
can wear them. Named for the commedia dell'arte servant that Figaro descends
from: the one who turns up wherever he is needed.

A component is a directory under `assets/` plus an entry in
`assets/manifest.json`. No framework, no runtime. You wear a class and tune
with CSS custom properties. The one build step, `zanni-inline`, exists because
`filter: url(#id)` only resolves inside the same document, and it earns its
keep by running `zanni-check` on the built page so an effect cannot vanish
silently.

| component | effect | how | form | knobs |
|---|---|---|---|---|
| **boil** | type and edges shimmer as if redrawn each frame | `feTurbulence` steps a discrete seed into `feDisplacementMap`; type also gets a 0.4 blur and an alpha table that re-crisps the edge | SVG defs, CSS, JS | class variants `-squiggle` `-fine` `-strong` `-erode`; `--set boil.text.scale` etc. Lower `freq` bends strokes, higher `freq` erodes them. Match the variant to the type size |
| **gesso** | warm parchment ground, the palette, and light/dark | one `repeating-conic-gradient` on a 6px grid is a checkerboard; no image, no request. `--z-*` tokens resolve with `light-dark()`, so `color-scheme` or `data-scheme` turns the paper into the velvet stage | CSS | `--gesso-cell`, every palette colour, `--z-*` |
| **phosphor** | faint CRT scanline veil | a `repeating-linear-gradient` comb multiplied over a positioned box | CSS | `--phosphor-ink` `-pitch` `-line` `-strength`; `.phosphor-soft` ramps instead of stepping |
| **fontpack** | three faces, one job each | Jacquard 24 display, EB Garamond prose, VT323 technical. No element borrows another's face. Self-hosted: inlined as `data:` woff2, or served from `fonts/` | generated CSS, woff2 | `--fontpack-display` `-prose` `-mono`; `--set fontpack.faces=` |
| **glyphmark** | a photo as visible pixels | a genuinely small source magnified with `image-rendering: pixelated`. `lib.pixelate` shrinks and tints it in the build | CSS, Nix | `--glyphmark-size` `-border` `-ring`; `size` `colors` `saturation` `tint` |
| **scriba** | markdown into the page | escape first, mark up second, and an href must be on a scheme allowlist. A port of gluck-herald's `internal/md`, carrying its test corpus so drift is visible | CSS, JS | `--scriba-code-bg` |
| **stilo** | a textarea that gains Write/Preview and a technical face | previews through `scriba`, renders on tab rather than on keystroke, and stays the same textarea so a form still submits it | CSS, JS | `--stilo-face` `--stilo-field` `--stilo-min` |
| **heft** | pick a thing up, throw it, watch it settle back | composes via the CSS `translate` property so it never fights an animation, and raises the ancestor because a child cannot escape its parent stacking context | CSS, JS | `--heft-settle` `--heft-ease` |
| **parla** | Figaro speaks: the pixel head and a cartoon bubble from his mouth | a tilted, outlined bubble whose tail sits at `--parla-mouth` of the head; `say`, `quip`, `interrupt` (with an *AHEM* when it cuts a quip) and `rest` on `el.parla` | CSS, JS | `--parla-head` `-mouth` `-tilt` `-outline` |
| **filo** | the media player: chrome over a page's own video or audio, Sutro's shape in zanni's dress | pixel SVG icons, a scrubber whose fill follows a drag and commits one seek, a centre cluster on pause, a settings menu (speed, quality, sleep, chapters), key help, fullscreen, thumbnail previews from WebVTT; one keymap for keyboards, D-pads and remotes | CSS, JS | `--filo-icon` `-big` `-track` `-hit`; `autohide` `globalKeys` `qualities` `thumbnails` `boil` `fill` |

## Use

```nix
inputs.zanni.url = "github:jack-work/zanni";

packages.default = zanni.lib.mkBoiledSite {
  inherit pkgs;
  pname = "my-site";
  src = ./www;
  components = [ "boil" "gesso" ];
};
```

Put `<!-- zanni:boil -->` in the page, wear `class="boil-text"`, done.
`examples/card.html` opens in a browser with no build step.

## Cost

Measured in Chrome 145, headless, CPU raster. Ratios transfer, absolutes do
not. Intensity is free: the loud variants are within noise of the default.
Area is roughly linear and then flat, because offscreen content is not
rastered. What costs is animating at all, and a SMIL `<animate>` costs about
11x the JS driver because it re-rasters every frame instead of on change,
which is why the driver is JS and why `heft` drops the filter while held.

Full numbers and the laws for each component are in `docs/`.

## Provenance

Source of truth is keel at `git@spain:jack/zanni.git`, browsable at
`keel.kelliher.info/jack/zanni`; GitHub is a mirror pushed on every receive,
and is what consumers name because a flake input must be fetchable without
spain's SSH. `gesso`, `phosphor`, `fontpack` and `glyphmark` are names I chose
and Gluck has not ratified; a rename costs one directory and one class prefix.
