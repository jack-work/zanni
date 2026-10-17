# parla

Figaro speaks. The pixel head from figar.org, liftable with `heft`, beside a
cartoon speech bubble whose tail leaves from his mouth: thick outline, a slight
tilt, a pop when the words change, a wiggle when he is interrupted or put down.
Light and dark come from gesso's `--z-*` tokens.

## Markup

```html
<div class="parla" data-parla>
  <img class="parla-head heft" src="figaro-head.png" alt="Figaro" draggable="false">
  <p class="parla-bubble" aria-live="polite">Hover over one to learn more.</p>
</div>
```

`assets/parla/figaro-head.png` is the 26x26 head (byte for byte figar.org's
`BRAND_GLYPH` and figaro's README mark). It is not inlined by `zanni-inline`;
serve it, or put it in the page as a `data:` URI if the CSP has no `img-src
'self'`. Drop `heft` from the head's classes if it should not move.

`parla.css` needs gesso for the tokens and fontpack for the faces. `parla.js`
needs nothing; `heft.js` is only needed for the drag.

## Script

Every `[data-parla]` is constructed on load; the API is on the element:

```js
const figaro = document.querySelector('[data-parla]').parla;
```

| call | effect |
|---|---|
| `say(text)` | sets the resting line and shows it |
| `quip(text, ms = 3500)` | shows `text`, then returns to the resting line after `ms` |
| `interrupt(text)` | shows `text`. If a quip is showing, the bubble wiggles and says `*AHEM*` for 700 ms first, and the cut quip never returns. A second interrupt during the `*AHEM*` replaces what follows it, it does not restart it |
| `rest()` | cancels any quip or pending interrupt and shows the resting line |
| `wiggle()` | wiggles without changing the words |
| `quipping` | true while a quip or an `*AHEM*` is showing |
| `resting` | the resting line |

Text is set with `textContent`, never as markup. An element added later is
constructed by `window.zanniParla(el)`.

The usual pattern, hover and focus explaining a control:

```js
for (const b of buttons) {
  const explain = () => figaro.interrupt(b.dataset.explain);
  b.addEventListener('pointerenter', explain);
  b.addEventListener('focus', explain);
  b.addEventListener('pointerleave', () => figaro.rest());
  b.addEventListener('blur', () => figaro.rest());
}
```

## Knobs

| property | default | what |
|---|---|---|
| `--parla-head` | 104px, 130px from 640px wide | the head's size |
| `--parla-mouth` | 0.6 | where the tail meets the head, as a fraction of its height |
| `--parla-tilt` | -1.5deg | the bubble's resting tilt |
| `--parla-outline` | 3px | the bubble's outline |

## Motion

`prefers-reduced-motion: reduce` removes the pop and the wiggle. The words
still change, `*AHEM*` included, because they are content.

## Under a strict CSP

`parla.js` sets text and classes only: no `innerHTML`, no inline style, no
network. Inline it and admit it by hash (`script-src 'sha256-…'`) as
gluck-portero does with `heft.js`, and pin that hash in the consumer so a
zanni bump cannot change a script on a public page without a visible diff.
`examples/parla.html` opens in a browser with no build step, and
`checks.parla` drives it in Chromium.
