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
Knobs: `--phosphor-ink` (0.22), `--phosphor-pitch` (3px), `--phosphor-strength`
(0.5).

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
