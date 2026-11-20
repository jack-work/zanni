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
  with no gap and no repeat. The shell redraws from `snapshot().view` (closed and open messages) on every change; a live turn's end comes from `snapshot().ends` (a replayed end carries no reason and draws nothing).
  Scrolling up (an IntersectionObserver on `Earlier turns`, or the button)
  calls `loadOlder()` and keeps the scroll anchor.
- Send is `stream.qua`. While a turn runs the composer says a message will
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

## Speech and mic (gateway.md)

Audio is the gateway's side channel, `/audio/<aria>` (WebSocket, same origin),
opened only while the voice toggle is on. One speech session per reply:

```
ready {aria, store}
audio.start {turn, key, format:'pcm', rate:24000, bits:16, channels:1, node, cursor}
audio.chunk {turn, node, cursor, offset, bytes}   then one binary frame of PCM
audio.end   {turn, key}      key = <store>/<aria>:<turn>/out, replay at /audio/key/<key>
audio.cancel {turn, key, why}   new-turn | interrupt | client
error {turn?, code, text}
```

`figchatSpeech.gateway({url})` is the real client; `speech.open({aria, watch},
{ready, start, chunk, end, cancel, error}) -> {voice(on), cancel(), close()}` is
the interface the shell uses. There is one voce player per turn, inside the
prose node named by `audio.start`; `data-speaking` marks the node the current
chunk's `node` names. A client that attaches mid-turn hears from there on; the
whole turn is replayable by key after `audio.end` (voce fetches it with Range).
`watch` is for the mock, which speaks the folded turns; the gateway client
ignores it. Stop sends `{type:"cancel"}`.

The mic posts the recording to `stt?aria=<store>/<aria>` (relative to the page,
`data-stt`), with the recording's Content-Type, and appends the returned `text`
to the composer. Sending is an ordinary prompt.

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

Left out: tables in markdown, a preview of a recording before it is sent.
