# rotolo

Scrollbars in the palette: a thin bar, the track on `--z-ground-2`, the thumb
in `--z-accent`, lighter under the pointer. Italian for a scroll.

```html
<html class="rotolo">
<!-- zanni:rotolo -->   or   <link rel="stylesheet" href="rotolo.css">
```

Wear it on `<html>` and it reaches the page and every `overflow: auto`
element in it: panels, tables, drawers. Wear it on a box and it reaches that
box and what is inside.

## Knobs

| property | default | what it does |
|---|---|---|
| `--rotolo-thumb` | `var(--z-accent)` | the thumb |
| `--rotolo-thumb-hover` | `--z-accent` 65% into `--z-ink` | the thumb under the pointer (Chromium, Safari) |
| `--rotolo-track` | `var(--z-ground-2)` | the track and the corner where two bars meet |
| `--rotolo-size` | `12px` | bar thickness in Chromium and Safari; the thumb is inset 2px by a border of track colour |

The defaults read gesso's tokens. A page without gesso sets the `--z-*`
tokens it has (`--z-accent`, `--z-ground-2`, `--z-ink`) or sets the knobs.

## Two engines, kept apart

Firefox reads `scrollbar-width: thin` and `scrollbar-color`. Chromium and
Safari read `::-webkit-scrollbar*`. The two halves sit behind
`@supports selector(::-webkit-scrollbar)` and its negation, and that split is
the design, not tidiness:

1. **Chromium 121+ reads both, and the standard wins.** Once an element has a
   `scrollbar-color` or `scrollbar-width`, Chromium ignores every
   `::-webkit-scrollbar` rule on it. A page that sets both gets the standard
   bar and loses the thumb's hover, because the standard properties have no
   hover state. That is why gesso's old scrollbar block had no hover.
2. **`scrollbar-width` is not inherited.** `scrollbar-color` is, so a rule on
   `:root` colours every bar on the page, but only the root's bar turns thin.
   The selector is `.rotolo, .rotolo *` for that reason.

Firefox draws its own hover shade from the thumb colour; `--rotolo-thumb-hover`
does not reach it. With overlay scrollbars on (GNOME's default) Firefox shows
the bar only while scrolling or under the pointer, thin, in these colours.

`zanni-check` asserts both rules, and `test/rotolo.test.py` checks the pixels
in Chromium and the computed colour in Firefox, each against the page with the
class removed.

## What it costs

Nothing measurable: no layer, no animation, no script.
