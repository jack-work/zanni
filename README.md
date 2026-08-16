# zanni

A small UI library: the visual effects of [figar.org](https://figar.org),
extracted so other sites can wear them.

Named for the *Zanni* — the servant-archetype of commedia dell'arte that Figaro
himself descends from. The point of the name is reuse: the servant is the one
who turns up wherever he is needed.

| component | what it is | form |
|---|---|---|
| **boil** | animated fractal-noise displacement over type and chrome (line boil / Squigglevision) — the effect people call "the blurry text", which is not a blur | SVG filter defs + CSS + a little JS |
| **gesso** | the prepared ground: parchment plus a 6px conic dither, and the palette it was chosen against | CSS only |
| **phosphor** | the CRT veil: a 1px/3px scanline comb multiplied over a box, with an optional bloom | CSS only |
| **fontpack** | three faces, three jobs — Jacquard 24 display, EB Garamond prose, VT323 technical | a `<head>` fragment + CSS |
| **glyphmark** | the portrait as a pixel mark: a genuinely small source scaled up with nearest-neighbour, bordered in gold | CSS + a Nix image step (`lib.pixelate`) |
| liftcard, scena | the rest of figar.org's vocabulary | not extracted |

Together the four are the whole voice: `boil` moves, `gesso` grounds,
`phosphor` veils, `fontpack` speaks. Each is independently wearable — boil on
its own is shimmer and nothing more, which is a fact worth seeing before
choosing.

## What a component IS, in code

No build tooling, no framework, no runtime. A component is **a directory under
`assets/` plus one entry in `assets/manifest.json`**, and it may contain at
most four kinds of file:

| file | becomes | when it is used |
|---|---|---|
| `NAME.css` | a `<style>` block at the marker | always — the class layer IS the public surface |
| `NAME.defs.svg` | inline SVG at the marker | only when the effect needs SVG machinery (boil's filters) |
| `NAME.js` | a `<script>` at the marker | only when CSS provably cannot do it (boil's SMIL removal under reduced motion) |
| `NAME.head.html` | injected before `</head>` | links and hints that must be early (fontpack's font request) |

The manifest entry declares the marker, the class names and the files. That
declaration is what `zanni-check` tests against, so adding a class to the
manifest without defining it, or defining one nobody wears, both fail.

**The public surface of every component is a class you put in your markup.**
`.boil-text`, `.gesso`, `.phosphor-host`, `.fontpack-display`. The class prefix
is always the component name — that is what makes the whole thing greppable and
the checker generic. Everything tunable is a CSS custom property
(`--gesso-cell`, `--phosphor-pitch`, `--fontpack-mono`), so you override values
without forking mechanisms.

So: it is plain CSS with an injection step. The injection step exists for one
narrow, measured reason — `filter: url(#id)` only resolves inside the same
document — and it earns its keep by also running the guard.

## See it

```sh
xdg-open examples/card.html      # no build step; it is self-contained
```

Three panels of the same business card: as it ships today, with **boil only**,
and with all four components composed — the whole voice. Panel 3 is written
entirely in zanni classes, so it doubles as the worked example of composition.

## Use it

`flake.nix`:

```nix
inputs.zanni.url = "github:jack-work/zanni";     # or wherever it lands
inputs.zanni.inputs.nixpkgs.follows = "nixpkgs";
```

```nix
packages.default = zanni.lib.mkBoiledSite {
  inherit pkgs;
  pname = "my-site";
  version = "1.0.0";
  src = ./www;                    # pages = [ "index.html" ] by default
  components = [ "boil" "gesso" "phosphor" "fontpack" ];
};
```

In each page, one marker per component where its block should land —
conventionally just inside `<body>`:

```html
<!-- zanni:boil -->
<!-- zanni:gesso -->
<!-- zanni:phosphor -->
<!-- zanni:fontpack -->
```

Then wear the classes:

```html
<h1 class="boil-text">John Kelliher</h1>
<div class="frame boil-ui"></div>
```

`mkBoiledSite` inlines the component and then runs `zanni-check` on the result,
so a build in which the effect failed to arrive is a build that fails.

## The tools

```sh
zanni-inline [--component boil] IN.html -o OUT.html    # injection
zanni-check FILE.html                                  # the guard
```

`nix run .#inline` and `nix run .#check` if you would rather not install them.

`zanni.lib.pixelate { inherit pkgs; src = ./photo.jpg; size = 80; }` downsamples
an image at build time — glyphmark needs a small source, because
`image-rendering: pixelated` only governs magnification. See `docs/glyphmark.md`.

## Why this is a package and not a snippet

Three reasons, each of which a hand-copy gets wrong:

1. **It cannot be linked.** `filter: url(#id)` resolves only in the same
   document. Measured in Chrome 145: an external `url(sprite.svg#id)` renders
   pixel-identical to no filter at all — no error, no warning, just no effect.
   The defs must be injected into the page.
2. **Reduced motion is JavaScript.** `animation: none` does not stop SMIL. The
   `<animate>` elements have to be removed. Every copy of the CSS forgets this.
3. **It can die silently.** On figar.org it did: a dead-CSS sweep matched one
   rule per line, ate the last line of the boil selector list and the `body`
   rule with it, and nobody noticed until Gluck said *"the entries no longer
   get the shimmery blur"*. `zanni-check` is that regression's guard, promoted
   out of the figaro-libretto QA agent and given one more assertion it never
   had — that some element actually **wears** the class. And the application
   layer is now three one-line rules, which a line-oriented sweep cannot
   half-eat.

## Layout

```
assets/manifest.json     components, their files, their markers, their classes
assets/boil/             boil.defs.svg · boil.css · boil.js
assets/gesso/            gesso.css
assets/phosphor/         phosphor.css
assets/fontpack/         fontpack.head.html · fontpack.css
bin/zanni-inline         injection
bin/zanni-check          the guard
docs/                    one page per component: the recipe, the laws, the cost
examples/card.src.html   the specimen, with the marker
examples/card.html       the specimen, built and committed (drift-guarded by `nix flake check`)
flake.nix                lib.mkBoiledSite · packages.{default,assets,example} · checks · apps
```

## Provenance and open questions

Extracted from `~/dev/spain-flake/master/stubs/figar/index.html`, with the
component vocabulary and the QA guards taken from the `figaro-libretto` skill.

- **`boil` is ratified** (2026-08-16). `gesso`, `phosphor`, `fontpack` and
  `glyphmark` are my proposals: a painter's ground, a CRT coating, and two of
  the workshop's own words. Plainer alternatives, if you would rather:
  `dither`, `scanlines`, `faces`, `pixelmark`. A rename costs one directory
  and one class prefix.
- **The raster cost of a boiled subtree has never been measured.** figar.org's
  mitigation is reasoned, not profiled. See `docs/boil.md` law 3.
- **Where this repo is published is settled.** keel on spain is the source of
  truth, at `git@spain:jack/zanni.git`, browsable at
  `https://keel.kelliher.info/jack/zanni`. GitHub
  (`github:jack-work/zanni`) is a mirror that keel pushes on every receive —
  it strictly follows spain, so anything pushed straight to GitHub gets
  overwritten. Consumers still take the GitHub URL as their flake input,
  because a flake input must be fetchable without spain's SSH.
