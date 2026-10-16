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

## Light and dark

`gesso.css` also defines scheme tokens. Each is `light-dark(<paper value>,
<stage value>)`, so it resolves by the `color-scheme` of the element it is
used on:

| token | light | dark |
|---|---|---|
| `--z-ground` | `--paper` | `--stage` |
| `--z-ground-2` | `--paper-2` | `--stage-2` |
| `--z-grain` | `--dither` | `--stage-2` |
| `--z-ink` | `--ink` | `--stage-ink` |
| `--z-muted` | `#6b4a3d` | `--stage-muted` |
| `--z-rule`, `--z-line` | translucent and solid rules | the same on the stage |
| `--z-accent`, `--z-on-accent` | oxblood, paper | gold-bright, stage |
| `--z-focus` | gold | gold-bright |
| `--z-ok`, `--z-fail`, `--z-warn` | verdigris, vermilion, ochre | lighter versions of each |
| `--z-tint`, `--z-shadow` | selection and hover tint, drop shadow | the same for the stage |

`.gesso` paints with them. A page decides its scheme:

| page says | result |
|---|---|
| nothing | light, as before: `color-scheme` defaults to light |
| `:root { color-scheme: light dark; }` | follows `prefers-color-scheme`, live, with no script |
| `<html data-scheme="dark">` or `"light"` | pinned. Meant for a server that read the reader's choice from the `zanni-scheme` cookie and rendered it |

The palette names (`--paper`, `--ink`, `--stage`…) keep their meaning. Code
that names them directly stays light. Code that should follow the scheme
moves to the `--z-*` tokens.

`light-dark()` needs Chrome 123, Firefox 120 or Safari 17.5.

## What it costs

One paint of a repeating gradient, no animation, no layer. It is the cheapest
thing in this library. It composes with `boil` freely — but note that if you
boil an element *whose background is the ground*, the ground boils with it and
the dither will swim. figar.org boils type and chrome, and lets the ground lie
still.
