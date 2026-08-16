# gesso

The prepared ground. A painter's gesso is the surface before the picture; this
one is figar.org's parchment: a flat paper colour with a 6px checker of a
slightly darker paper laid over it.

```html
<body class="gesso">
```

```css
background-image: repeating-conic-gradient(var(--dither) 0% 25%, transparent 0% 50%);
background-size: 6px 6px;
```

A conic gradient repeated on a 6px grid is a checkerboard — two triangles per
quadrant, alternating. It is one CSS declaration, no image, no request, and it
tiles at any size. `--gesso-cell` moves the grid; 6px is what figar.org uses
and it reads as paper texture rather than as a pattern. Above ~10px it starts
to look like a picnic blanket.

`gesso.css` also carries **the palette** — `--paper`, `--dither`, `--ink`,
`--muted`, `--gold`, `--gold-bright`, `--oxblood`, `--rule`, and the dark
register `--stage*`. The ground and the ink were chosen against each other;
shipping one without the other gives you neither. Override any of them and the
mechanism stays.

`.gesso-stage` is the same ground in the dark register, for panes that read as
a velvet stage rather than as paper.

Gold is editorial: **at most two focal elements per view.** It stops being
focus the moment it is everywhere.

## What it costs

One paint of a repeating gradient, no animation, no layer. It is the cheapest
thing in this library. It composes with `boil` freely — but note that if you
boil an element *whose background is the ground*, the ground boils with it and
the dither will swim. figar.org boils type and chrome, and lets the ground lie
still.
