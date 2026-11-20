---
name: figchat
description: The figchat web shell on the figaro-forms aria stream. Read before changing its routes, the speech side channel, how the aria list pages, the bundle layout, or before binding it to a door.
---

# figchat

The web chat for figaro. It attends one aria at a time over a door that speaks
the `figaro-forms/aria` contract (JSON-RPC over WebSocket), draws it with
`nodi`, and lets Gluck send, interrupt and fork.

## Routes

`#/` the aria list, `#/<store>/<aria>` an aria, `#/<store>/<aria>:<turn>` an aria
scrolled to a turn (older pages are read until the turn is held, at most 60
pages). A store names a client in `mount(host, {stores, store})`; one store,
`local`, is wired by `boot.js`. Under 900 px one of list or aria shows; from
900 px both.

## What the shell does

- List: `figaro.list` in the daemon's order, eight at a time, `More arias` pages
  with `next_before`. Depth is the parent chain among loaded rows (capped at six).
  The list reloads when a turn ends and when the tab becomes visible.
- Attend: `client.attach(id)`. The stream reads backward from the end in
  byte-budget pages, follows live, and resumes from its own cursor after a drop
  with no gap and no repeat. The shell redraws from `snapshot()` on every change.
  Scrolling up (an IntersectionObserver on `Earlier turns`, or the button)
  calls `loadOlder()` and keeps the scroll anchor.
- Send is `stream.prompt`. While a turn runs the composer says a message will
  steer it. `Stop` interrupts and keeps the queue, `Stop, clear queue` clears it.
  `Fork` forks at the end and opens the alternative; `Fork here` on a turn forks
  at that turn.
- Phases show in the top bar: Connecting, Catching up, Live, Offline, Not allowed,
  Not found, Closed.

## Door

`boot.js` dials `data-door` (default `door`, relative to the page, so
`/chat/door` behind the edge) with `edgeSession()`. The local bridge refuses
read, qua, interrupt, fork and list, so the shell needs a daemon door or a
gateway that passes them.

`assets/aria/aria.js` is figaro-forms/aria cut by `bin/figchat-vendor-aria` from
a checkout; `SOURCE.json` names the head. It sets `window.figaroAria`.

## Speech side channel (client side, piece B not built)

```
speech.open({aria, events(fn) -> off}, {chunk, end, error}) -> {voice(on), close()}
chunk {aria, turn, node, seq, format:{format:'pcm',rate:24000,bits:16,channels:1}, pcm:ArrayBuffer}
end   {aria, turn, node, audio_id?}
error {aria, turn, node?, text}
```

`turn` and `node` are the ids on the aria events, so a chunk lands in the voce
player inside that prose node (`nodi` slot). `seq` 0 starts the player, `end`
finishes it, a stored copy is offered when `audio_id` is set. `voice(on)` is the
toggle; a real client tells the gateway. `events` is for the mock, which speaks
`prose.settled`; a real gateway tees the stream itself and ignores it.
`figchatSpeech.mock()` synthesizes PCM; `figchatSpeech.none()` is the default.

## Laws

Server text enters only through `nodi`'s text function. No innerHTML and friends,
no inline script, style or handler. The views never touch `fetch` or
`WebSocket`; the client does.

## Checks

`test/nodi.test.js` and `test/figchat.test.js` run in node against the real
vendored client and `examples/aria-mock.js`, a door that speaks the contract's
frames (rounds, versions, UTF-8 byte patches, steering restarts, a drop in the
middle of a turn). `test/figchat.test.py` runs Chromium at 390 and 1280 against
`test/figchat-server.js`, which serves the built bundle under the edge CSP and
the mock over a real WebSocket. `examples/figchat.html` is the same mock
in-page.

Left out since the herald shell: the mic and clips, which belong to the gateway's
inbound path, and tables in markdown.
