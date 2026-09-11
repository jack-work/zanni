# stilo

The writing surface. The stylus to `scriba`'s copyist: one writes, the other
transcribes.

```html
<!-- zanni:scriba -->
<!-- zanni:stilo -->
<textarea data-stilo name="description" rows="6"></textarea>
```

Any `textarea[data-stilo]` is wrapped at load and gains a **Write / Preview**
pair and a technical face. It stays the same textarea underneath, in the same
form, with the same `name`, so nothing about submitting it changes.

```js
zanni.stilo.attach(textarea);   // returns { root, input, preview, show }
handle.show('preview');         // drive the tabs yourself
```

## Why a tab and not a live pane

Preview renders **when the tab is shown**, never on keystroke. A side-by-side
pane that re-renders as you type is the expensive shape, and on a filtered
page it is the expensive shape inside a raster unit. `zanni-check` asserts
there is no `input` listener.

## It previews through scriba

Declared in the manifest as `requires`, and checked: a page that inlines the
surface without the renderer fails the build rather than quietly showing plain
text in a tab labelled Preview.

Without scriba at runtime the tab degrades to plain text. That is honest, not
a fallback anyone should want.

## Committing

`Ctrl+Enter` or `Cmd+Enter` fires `stilo:commit`, which bubbles from the
wrapper. A long description is easier to write than to submit, because the
save button is usually scrolled away by then.

```js
form.addEventListener('stilo:commit', save);
```

## Knobs

| property | default | what it does |
|---|---|---|
| `--stilo-face` | `--fontpack-mono` | the face being typed into |
| `--stilo-field` | `rgba(43, 26, 21, 0.05)` | the panel tint |
| `--stilo-min` | `7rem` | minimum height of both tabs |

The floor is `max(14px, 1rem)`, one step above the rest of the library's
`13px`: VT323 is bitmap-derived, and this is the one surface where someone
reads their own words back character by character.

## Two details that are load-bearing

The textarea's own border is removed so the panel reads as one object, which
means the focus ring has to be put back on the wrapper with `:focus-within`.
Take that rule out and focus becomes invisible.

Both tabs carry `--stilo-min`, so switching between them does not resize the
dialog under the pointer.
