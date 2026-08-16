# zanni

A small UI library: the visual effects of [figar.org](https://figar.org),
extracted so other sites can wear them.

Named for the *Zanni* — the servant-archetype of commedia dell'arte that Figaro
himself descends from. The point of the name is reuse: the servant is the one
who turns up wherever he is needed.

**One component so far.**

| component | what it is | status |
|---|---|---|
| **boil** | animated fractal-noise displacement over type and chrome (line boil / Squigglevision) — the effect people call "the blurry text", which is not a blur | shipped |
| dither, glyphmark, liftcard, fontpack, scena | the rest of figar.org's vocabulary | not extracted |

Why one: a small correct package that a site actually consumes beats a complete
one that nothing imports.

## See it

```sh
xdg-open examples/card.html      # no build step; it is self-contained
```

Three panels of the same business card: as it ships today, with boil only, and
with boil plus the ground it was designed against (dither, scanlines, the font
triple). The middle panel is the honest answer to "is this what you meant".

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
};
```

In each page, one marker where the defs should land — conventionally just
inside `<body>`:

```html
<!-- zanni:boil -->
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

## Why this is a package and not a snippet

Three reasons, each of which a hand-copy gets wrong:

1. **It cannot be linked.** `filter: url(#id)` resolves only in the same
   document; external `url(sprite.svg#id)` is Firefox-only in practice. The
   defs must be injected into the page.
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
assets/manifest.json     components, their files, their markers
assets/boil/             boil.defs.svg · boil.css · boil.js
bin/zanni-inline         injection
bin/zanni-check          the guard
docs/boil.md             the recipe, the five laws, the tuning knobs
examples/card.src.html   the specimen, with the marker
examples/card.html       the specimen, built and committed (drift-guarded by `nix flake check`)
flake.nix                lib.mkBoiledSite · packages.{default,assets,example} · checks · apps
```

## Provenance and open questions

Extracted from `~/dev/spain-flake/master/stubs/figar/index.html`, with the
component vocabulary and the QA guards taken from the `figaro-libretto` skill.

- **The name `boil` is not ratified.** It was proposed in one writeup and never
  answered. Renaming costs one class prefix and one directory.
- **The raster cost of a boiled subtree has never been measured.** figar.org's
  mitigation is reasoned, not profiled. See `docs/boil.md` law 3.
- **Where this repo is published is undecided** — GitHub alongside the other
  `jack-work` flakes, or spain's own keel host.
