---
name: filo
description: The media player chrome worn over a page's own video or audio element, for mouse, touch, keyboard and a TV remote. Read before changing a key, the chrome's show and hide rules, the commit delay, the focus model, the menu, or before wiring a new player to it.
---

# filo

The thread a recording runs along. One player for juglar on
files.kelliher.info, the aguatv app, and the Fire TV's WebView. Shaped after
player.style's Sutro theme, dressed in gesso and fontpack: pixel icons, the
title in Jacquard, times in VT323, menus in Garamond.

## Wearing it

On a page that is mostly a video:

```html
<!-- zanni:gesso -->
<!-- zanni:fontpack -->
<!-- zanni:filo -->
<video data-filo data-filo-title="Talk" src="talk.mp4"></video>
```

A media element carrying `data-filo` is attached at load: filo wraps it in a
`.filo` box and draws the chrome over it. `data-filo-keys="global"`,
`data-filo-autohide`, `data-filo-thumbnails` and `data-filo-boil="off"` set
the options below.

A page that loads items itself calls `attach`:

```js
const h = zanni.filo.attach(video, {
  globalKeys: true,
  title: 'Talk',
  duration: 3600,
  chapters: [{ start: 0, title: 'Opening' }, { start: 610, title: 'Q&A' }],
  qualities: [{ value: 'auto', label: 'Auto' }, { value: '720', label: '720p' }, { value: 'original', label: 'Original' }],
  quality: 'auto',
  thumbnails: '/media/talk/thumbs.vtt',
});
```

If the media element's parent carries `data-filo`, that element is the box and
nothing is wrapped. aguatv's full-viewport `#cast` is one. Pass `fill: true`
there so the picture fills the box. `detach()` removes everything filo added
and leaves the media element where it was found.

| option | default | |
|---|---|---|
| `globalKeys` | false | take keys at document level, for the TV or a page that is only a player |
| `autohide` | 2500 video, 0 audio | ms of idle play before the chrome fades; 0 never |
| `kind` | from the tag | `'audio'` draws the card even around a `<video>` |
| `title`, `chapters`, `duration` | | `duration` stands in until the media knows its own |
| `qualities`, `quality` | none | the Quality menu; hidden with fewer than two |
| `thumbnails` | none | WebVTT of `sprite.jpg#xywh=x,y,w,h` cues, relative to the VTT |
| `rate` | 1 | starting speed |
| `rates` | 0.75 to 3 | the Speed menu and `<` `>` |
| `step`, `big`, `fine` | 10, 30, 1 | skip sizes in seconds |
| `boil` | true | boil the paused centre cluster when the page carries boil |
| `fill` | false | picture fills the box, letterboxed |
| `docked` | false | start as the bottom bar |
| `waveform` | none | 1024 integers 0..255, the loudest sample per slice of the duration; the scrubber becomes the waveform |
| `bar` | false | theater mode: the picture with the bar's controls under it, never hiding. Fullscreen from it is the ordinary overlay player |

The page owns the media element: its `src`, hls.js, the poster, saving the
position, and switching quality. filo never calls `play()` unless asked:
attaching does not start anything.

## The handle

| call | does |
|---|---|
| `toggle()` | play or pause |
| `skip(s)` | move by s seconds; repeats inside 400 ms add up and commit once |
| `seekTo(s)`, `seekFraction(f)` | seek now |
| `chapter(dir)` | -1 or +1; back within 3 s of a chapter's start goes to the one before |
| `showBar(bool)` | show or hide the chrome |
| `stop()` | pause, close menus, hide, fire `filo:stop` |
| `rate(r)` | set the speed |
| `mute()` | toggle mute |
| `fullscreen(bool?)` | the box goes fullscreen; iOS falls back to the video's own |
| `dock(bool?)` | become the bottom bar, or come back |
| `pip(bool?)` | the browser's picture in picture for the video |
| `globalKeys(bool)` | change the key scope after attach |
| `menu(bool?)`, `help(bool?)` | the settings menu, the key list |
| `setItem({title, chapters, duration, kind, thumbnails, qualities, quality, waveform})` | describe a new item |
| `setQualities(list, current)` | replace the Quality menu |
| `focus()` | focus the scrubber, so OK and Space reach the player |
| `detach()` | undo everything |
| `shown`, `open`, `docked`, `root`, `media` | chrome showing; a menu or help showing; docked; the box; the element |

Events bubble from the box: `filo:seek {from, to}` once per committed seek,
`filo:bar {shown}`, `filo:quality {value}`, `filo:rate {rate}`,
`filo:fullscreen {on}`, `filo:sleep {mode, fired}`, `filo:stop`, `filo:dock {on}`,
`filo:expand`, `filo:pip {on}`. Position and
duration are the media element's own `timeupdate` and `durationchange`.

On `filo:quality` the page switches: hls.js `currentLevel`, a rung's playlist,
or the original at the same time, then `setQualities` if the list changed.

## What shows when

| state | chrome |
|---|---|
| paused | title, centre cluster (-10, play, +10) and the bottom bar |
| playing, pointer moving, touch or a key | the bottom bar only |
| playing, idle for `autohide` | nothing; the cursor hides too |
| playing, pointer leaves the box, or focus leaves it | nothing, at once |
| menu or help open, a drag, a held key | stays |

The bottom bar is the scrubber and one row: play, -10, +10, volume, time,
chapter, the settings menu (⋮) and fullscreen. Under 520px the skips and the
chapter drop out of the row.

Hiding is opacity with `pointer-events: none`, never `display` or
`visibility`, so focus survives it and a hidden bar takes no tap.

Audio has no picture to cover, so it is a card that never hides: title,
chapter, scrubber, elapsed and remaining, and a row of volume, -10, play, +10
and the menu.

## Waveform

With `waveform`, the scrubber is the sound: 3px pixel bars with 1px gaps,
each the loudest of its share of the bins, scaled by the square root so quiet
speech still shows. Played bars in the accent, the rest dimmed, the head a
3px ink line; the flag, the drag and one seek per gesture are as before. 40px
tall over video, 48px in the audio card. In the bar skin (theater and docked)
it is a band along the top of the bar, above the title and the controls: 28px
in a 36px band under theater, 20px in a 32px band when docked. The bar grows by
the band, and `--filo-dock-height` counts it.

It is drawn on two canvases only when the size or the data changes; per tick
only the lit canvas's clip moves. juglar computes the values at ingest and
serves them inline as `waveform` on `/api/item`.

## Docked

Spotify's pattern: Gluck picked it over YouTube's corner window. `dock(true)`
turns the box into a bar along the bottom of the viewport, 64px on a phone and
72px elsewhere, plus the waveform's band when there is one: the same `<video>` as a 16:9 tile (never re-created, so
nothing rebuffers), title and chapter, -10, play, +10, the time, volume, ⋮,
picture in picture, expand and close. The scrubber is a thin line along the
bar's top edge with the usual 44px hit area, and its flag opens above the bar.
Audio docks without a tile. Phones drop the skips, the time, volume, PiP and
the menu.

The box stays the page's element. Docking sets `position`, the insets, `height`,
`z-index` and `display` on it through the CSSOM and puts back whatever inline
values were there on undock, so a page's stylesheet must not use `!important`
on its box. `--filo-dock-height` is set on `<html>` in the same task, before
the bar paints, so a page pads its scroll containers by it without a jump.
`--filo-dock-z` (default 50) sets the bar's stacking.

Docked, filo takes no global keys: a gallery around it keeps its arrows,
Enter, Space and Escape. Keys still work with focus inside the bar. filo binds
no key to dock; the page decides when.

Expand, or a tap on the tile, fires `filo:expand` and nothing else: the page
routes to its watch view and calls `dock(false)`. Close is `stop()`.
`setItem` and a new `src` leave the dock alone, so a cast into a docked player
loads in place. The bar never hides itself.

## The scrubber

A drag or a held key moves the fill with it and shows a flag with the time,
the chapter and, given `thumbnails`, the frame. The seek happens once, on
release or 400 ms after the last repeat, because on files.kelliher.info every
seek is a Range request the lister authorises again. Hover shows the flag
without moving the fill.

The fill, the head and the flag move by transform, and the time text changes
inside `contain: strict` boxes sized once per duration, so a `timeupdate`
lays out nothing outside them.

## Menu

Speed, Quality, Sleep (15 to 60 minutes, or end of chapter), Chapters, and
Keyboard shortcuts. Arrows move through it, Right opens a submenu, Left or
Escape goes back, a click outside closes it without also playing.

## Keys

| key | does |
|---|---|
| Space, Enter, MediaPlayPause, keyCode 179 | play / pause |
| h l, ArrowLeft ArrowRight | -10 / +10 s |
| H L, Shift+Arrow, MediaRewind MediaFastForward | -30 / +30 s |
| Alt+h Alt+l, Ctrl+h Ctrl+l | -1 / +1 s |
| 0 to 9 | jump to 0 to 90 percent |
| ^ Home, $ End | start, end |
| [ PageUp, ] PageDown | previous, next chapter |
| < > | slower, faster |
| m | mute |
| f | fullscreen |
| ? | the key list |
| ArrowUp, ArrowDown | show, hide the chrome |
| Escape | close help, step out of a submenu, close the menu; otherwise the page's |

`?` lists these from the same table the help dialog renders.

Ctrl+h and Ctrl+l belong to most browsers (history, address bar) and Alt+h
opens Firefox's Help menu. Both are bound; Alt is the one Gluck accepted, and
whether a browser lets a page have either is unmeasured. Alt matches on
`e.code`, because on a Mac Alt+h types a character.

Without `globalKeys` keys act only while focus is inside the box. Either way a
key typed into an input, textarea, select or editable element is text, and
Space or Enter on a focused button or link is that control's.

## Focus

The scrubber is `role=slider` with `aria-valuetext` like
`1:23:45 of 10:02:00, Una voce poco fa`, and the first stop in the box. Arrows
on it seek and never move focus, so a D-pad has one stop in practice. The row's
buttons are Tab stops for a keyboard. The centre cluster is for pointers and
takes no focus.

## TV

Measured on Fire OS 7, Amazon WebView 138: the D-pad arrives as Arrow*, OK as
Enter, MediaRewind and MediaFastForward as `e.key`. Play/pause arrived as
`MediaPlayPause` or keyCode 179, so both are matched. Back never reaches the
page: the shell calls `stop()`. The WebView will not pass 138 without a
sideload, so nothing here needs a newer Chromium.

## CSP

No inline script, no `innerHTML`, no `eval`, no style attributes in markup.
Icons are SVG elements built with `createElementNS`; positions are set
through the CSSOM. zanni-check asserts it.

## Cost

The only filter is boil on the paused centre cluster, a sibling of the bar,
and only when the page carries boil and `boil` is not false. Nothing in the
bar or its ancestors is filtered: the fill moves four times a second.
