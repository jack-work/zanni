---
name: filo
description: The seeker over an audio or video element, for mouse, touch, keyboard and a TV remote. Read before changing a key, the commit delay, the focus model, or before wiring a new player to it.
---

# filo

The thread a recording runs along. One component for juglar's player on
files.kelliher.info and the aguatv receiver in the Fire TV's WebView.

```html
<!-- zanni:gesso -->
<!-- zanni:fontpack -->
<!-- zanni:filo -->
<video id="v" src="talk.mp4"></video>
<div data-filo="v" data-filo-keys="global"></div>
```

`data-filo` names the media element by id and the bar attaches at load. A page
that needs options calls `attach` itself and leaves `data-filo` empty:

```js
const h = zanni.filo.attach(barEl, video, {
  globalKeys: true,
  autohide: 4000,
  title: 'Talk',
  duration: 3600,
  chapters: [{ start: 0, title: 'Opening' }, { start: 610, title: 'Q&A' }],
});
```

The page owns the media element. Load a source by setting `video.src` or with
hls.js; filo only reads and seeks it.

| call | does |
|---|---|
| `toggle()` | play or pause |
| `skip(s)` | move by s seconds, held: repeats add up and commit once |
| `seekTo(s)` | seek to s seconds now |
| `seekFraction(f)` | seek to f of the duration now |
| `chapter(dir)` | -1 or +1. Back within 3 s of a chapter's start goes to the one before |
| `showBar(bool)` | show or hide the bar |
| `stop()` | pause, hide, fire `filo:stop` |
| `setItem({title, chapters, duration})` | replace what the bar describes |
| `focus()` | put focus on the track, so OK and Space cannot press a control left focused behind the player |
| `shown` | whether the bar is showing; read it rather than tracking `filo:bar`, which does not fire at attach |
| `detach()` | remove listeners and markup |

Events bubble from the bar: `filo:seek {from, to}` once per committed seek,
`filo:bar {shown}`, `filo:stop`. Position and duration are the media
element's own `timeupdate` and `durationchange`.

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
| ArrowUp, ArrowDown | show, hide the bar |
| m | mute |

Step sizes are options: `step`, `big`, `fine`.

Ctrl+h and Ctrl+l belong to the browser (history, address bar) in most of
them, and Alt+h opens a menu in Firefox. Both are bound; Alt is the one Gluck
accepted, and whether a browser lets a page have either is unmeasured.
Alt matches on `e.code`, because on a Mac Alt+h types a character.

Speed is not filo's. juglar binds `<` and `>`.

## Scope

`globalKeys` (the TV, a page that is only a player) takes keys at document
level. Without it, keys act only while focus is inside the bar, so a page
keeps its arrows and its Enter. Either way a key typed into an input,
textarea, select or editable element is text, and Space or Enter on a
focused button or link is that control's.

## One focus stop

The track is `role=slider` with `aria-valuetext` like
`1:23:45 of 10:02:00, Una voce poco fa`. The play button has `tabindex=-1`:
it is there for a finger or a mouse. A D-pad therefore never hops between
buttons; left and right always seek.

Hiding is opacity and a nudge, never `display` or `visibility`, because either
would drop focus off the only stop a remote has. zanni-check asserts it.

## One seek per gesture

Every seek on files.kelliher.info is a fresh Range request authorised again by
the lister. A held key repeats about thirty times a second, so `skip` paints
the target at once and commits after 400 ms without a repeat. A drag previews
and seeks once on release. Digits, `^`, `$` and chapters seek at once.

## Touch

The hit area is 44px over an 8px rail, and `touch-action: pan-y`, so a
vertical swipe across the bar still scrolls the page. The flag rides above
the finger.

## TV

Measured on Fire OS 7, Amazon WebView 138: the D-pad arrives as Arrow*, OK as
Enter, and MediaRewind and MediaFastForward as `e.key`. Play/pause arrived as
either `MediaPlayPause` or keyCode 179, so both are matched. Whether the
WebView does anything with the media keys when nothing handles them is not
measured. Back never reaches the page: the shell calls `stop()` or leaves.

The WebView will not pass 138 without a sideload, so nothing here may need a
newer Chromium.

`autohide` hides the bar that many milliseconds into playback; any key or
touch on the bar brings it back. A tap on the video is the page's to turn
into `showBar(true)`, since a hidden bar takes no pointer.

## Cost

No filter. The played width moves four times a second, and a filtered
element re-rasters on every change. Keep boil off the bar and its ancestors.
