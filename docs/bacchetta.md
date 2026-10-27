---
name: bacchetta
description: The phone remote for casting: a cast button with a dropdown of screens, and a remote that opens on cast. Read before wiring a page to it, changing a control's action, or touching its layout at phone or wide widths.
---

# bacchetta

The conductor's baton: it directs a performance happening somewhere else.
filo plays a video on this screen; bacchetta drives one on another screen. It
never touches media itself. Every control becomes an event the page sends to
the screen.

```html
<!-- zanni:gesso -->
<!-- zanni:fontpack -->
<!-- zanni:bacchetta -->
<button id="cast">cast</button>
```

```js
const c = zanni.bacchetta.caster(document.getElementById('cast'), { screens });
const r = zanni.bacchetta.remote({ boil: saved });
document.addEventListener('bacchetta:cast', e => { post(e.detail.screen); r.show(e.detail.screen); });
r.root.addEventListener('bacchetta:control', e => control(e.detail.screen, e.detail.action, e.detail.value));
```

## The cast button

`caster(button, { screens })` wraps the page's button, gives it the pixel cast
glyph, and opens a dropdown of screens: name, kind, and a dot for online. A
pick fires `bacchetta:cast {screen}` from the button. Screens are
`{id, name, kind, online}`; `setScreens(list)` replaces them. Arrows move
through the menu, Escape closes it and focus returns to the button.

## The remote

`remote(opts)` builds one hidden `section`, reused across casts.

| call | does |
|---|---|
| `show(screen)` | open, expanded, naming the screen |
| `hide()` | close |
| `minimise(bool?)` | the 60px bar, or back |
| `setNow({title, chapter, position, duration, playing})` | what the screen is doing; any subset |
| `boil(bool?)` | boil the whole remote, when the page carries boil |
| `destroy()` | remove it |
| `shown`, `minimised`, `boiled`, `screen`, `root` | state |

`setNow` needs only occasional positions: while playing, the clock and the
fill run on from the last one.

Events bubble from `root`. `bacchetta:control {action, value, screen}`, with
action one of `toggle`, `skip` (±seconds), `seekTo` (seconds), `chapter`
(±1), `bar`, `stop`, or `key` (`ArrowUp`, `ArrowDown`, `ArrowLeft`,
`ArrowRight`, `Enter`, from the D-pad). These are filo's handle names, so a
browser screen maps them straight across. `bacchetta:path {path, screen}`
from the folded field. `bacchetta:boil {on}` for the page to persist.
`bacchetta:show`, `bacchetta:hide`, `bacchetta:minimise {on}`.

Close (×) sends `stop`, then hides. A drag on the scrubber previews and sends
one `seekTo` on release, for the same reason filo does.

## Layout

| width | expanded | minimised |
|---|---|---|
| under 900px | a sheet along the bottom | a 60px bar along the bottom |
| 900px and up | a 380px card anchored bottom-right | the same bar |

Keys are pixel buttons with a 2px ink border and a hard shadow, packed with
3px between D-pad keys. The screen's name is in Jacquard, numbers in VT323.

`--bacchetta-height` is set on `<html>` whenever the remote covers the
bottom edge (the sheet on a phone, or the bar), and removed when it does not.
Pad scroll containers with it. The remote sits on top of `--filo-dock-height`
when filo is docked, so the two stack instead of overlapping. `--bacchetta-z`
(default 60) sets its stacking.

## Boil

A setting, off by default. On, the sheet and the bar wear `boil-ui`, which
re-rasters the whole remote at boil's step rate: cheap on a phone screen of
buttons, but it is the one cost here. Without boil on the page it does
nothing.
