# phosphor

The CRT veil. Named for the coating a cathode-ray tube glows through — the
scanline is an artefact of that screen, not a decoration added to it.

```html
<div class="panel gesso phosphor-host"> … </div>   <!-- the veil is its ::after -->
<div class="phosphor"></div>                       <!-- or an explicit sibling -->
```

```css
background: repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 1px, transparent 1px 3px);
mix-blend-mode: multiply;
opacity: 0.5;
```

1px of near-black every 3px, multiplied into what is beneath at half strength.

## Turning it down

Four knobs, no forking required:

| property | default | what it does |
|---|---|---|
| `--phosphor-ink` | `0.22` | how dark the line is |
| `--phosphor-pitch` | `3px` | gap between lines — larger is calmer |
| `--phosphor-line` | `1px` | thickness of the line (hard comb only) |
| `--phosphor-strength` | `0.5` | opacity of the whole veil |

And `.phosphor-soft`, which is the bigger lever: it **ramps instead of steps**.
The default comb is a square wave — full ink for a pixel, nothing for two —
which is faithful to a CRT up close and reads as aggressive on a dense display,
where a 1px bar on a fractional device-pixel grid also aliases into moiré as
the page scrolls. The soft variant is a triangular wave: ink at the line, clear
by the middle of the pitch, ink again at the next. That is what a defocused
scanline actually looks like.

Note there is **no blur filter** involved, deliberately. A `filter: blur()`
here would cost a raster pass and would blur the *content* beneath, not the
veil — the veil is a background of the overlay, so a filter on the overlay
hits everything it covers. The gradient does the softening for free.

Settings that have been looked at on real type:

| ink / pitch / strength | reads as |
|---|---|
| `0.22 / 3px / 0.5` hard | figar.org as built; unmistakably a screen |
| `0.14 / 4px / 0.34` soft | a shadow rather than a fence — jack.kelliher.info |
| `0.10 / 5px / 0.26` soft | barely there; texture you notice only if you look |

## Three ways to get it wrong

1. **Over the whole page.** A veil on `<body>` covers `position: fixed` chrome
   too, and multiply against a transparent backdrop is how you get a grey
   rectangle. Wear it on a box, not on the document.
2. **Eating clicks.** It is an overlay across the whole box;
   `pointer-events: none` is not optional, and `zanni-check` asserts it.
3. **Unpositioned host.** `.phosphor-host` sets `position: relative` for you.
   An explicit `.phosphor` sibling needs a positioned ancestor of its own, or
   it will veil the nearest one it can find — usually the viewport.

`.phosphor-bloom` is the optional warm glow from the centre. Unlike boil, it
*is* a CSS animation, so `prefers-reduced-motion` can and does stop it.

## What it costs

A second painted layer with a blend mode, which means the box beneath it
cannot be promoted to a simple composited layer. Static, cheap. Over an
animated subtree, it re-composites with it — pair it with a still ground, the
way figar.org does.
