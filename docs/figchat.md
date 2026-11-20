---
name: figchat
description: The figchat web shell. Read before changing its routes, the transport interface, how frames become messages, the bundle layout, or before binding it to herald's /chat/api and /chat/ws.
---

# figchat

The web chat for figaro, a herald plugin's front end: a thread list, a thread
of Telegram-like bubbles, a composer with a mic, a voice toggle, and a voce
player on every message that has audio. Replies render as markdown while they
stream. Collapsible tool blocks and the voice-ergonomics mode come later.

## Laws

- Every server string (titles, text, deltas, tool names, errors) enters the
  page through one function that appends text nodes. No innerHTML,
  insertAdjacentHTML, outerHTML, document.write, eval, inline script, inline
  style or handler. `test/figchat.test.js` scans for the sinks and
  `test/figchat.test.py` swaps that function for an HTML sink and requires
  the hostile-text check to fire.
- Control, bidi and zero-width characters are shown as a boxed `U+202E` label.
- Markdown is parsed to a list of blocks and spans (`figchat.blocks`,
  `figchat.spans`, pure) and built with createElement plus that same text
  function. scriba is not used here: it writes HTML. The one attribute that
  carries server text is a link's `href`, and only when it starts with
  `http://`, `https://` or `mailto:`; any other link stays as typed.
- The views never touch `fetch` or `WebSocket`. They talk to a transport.

## Routes

`#/` the thread list, `#/t/<id>` a thread, `#/new` a thread that is created
when its first message is sent (titled from that message's first line).
Under 900 px one of list or thread shows; from 900 px both do.

## Transport

`figchat.mount(host, { transport })`. Without one, `figchat.httpTransport`
is built from `data-api`, `data-ws` and `data-audio` on the host, all relative
to the page (defaults `api`, `ws`, `audio`).

```
threads()                       -> Promise {threads:[{id,title,updated}]}
createThread(title)             -> Promise {id}
messages(thread, {before,limit})-> Promise {messages:[Message], next_before?}
send(thread, {text, clip_id?})  -> Promise {id, state}
clip(blob)                      -> Promise {clip_id, text, duration_ms, audio_id}
audioURL(audio_id)              -> string, the src of an audio element
audioStatus(audio_id)           -> Promise status of a one byte Range GET
connect(thread, after, {open, frame, binary, close}) -> {send(frame), close()}
```

A rejected call carries `status`, `code` and the server's `error` as its
message. `frame` receives parsed JSON frames, `binary` an `ArrayBuffer`. The
wire is herald's figchat spec v1; `examples/figchat-mock.js` implements the
same REST shapes and frames in the page, and `test/figchat-server.js` serves
it over real HTTP and a real WebSocket.

How frames become messages is `figchat.conversation()`, pure and tested:
messages sort by id, a delta after `message.end` is dropped, binary frames
belong to the message of the current `audio.start`, a speech error closes the
audio stream, a reply joined halfway is fetched whole when it ends.

`Message.state` decides what a stored row is: `streaming` is a turn still
running (shown with the cursor, and the composer says a message will steer
it), `failed` is shown as failed, `done` is done even when empty. A row
without a state falls back to "an empty assistant row is running".
`message.added` is how a user message appears, on every tab; the POST answer
for the same id adds nothing. Liveness is the protocol ping; the shell sends
no JSON pong. `after` is still sent on the socket URL and herald ignores it.

## Composer

Enter sends and Shift+Enter is a newline; on a coarse pointer Enter is a
newline and the Send button sends. Send is refused while the socket is
offline. While a reply runs the composer shows "Stop reply", which sends
`{type:"cancel"}`.

The mic button records with MediaRecorder (`audio/webm;codecs=opus`, else
`audio/mp4`, else `audio/ogg;codecs=opus`, else the browser's default), tap
to start, tap to stop, five minutes at most. The clip goes to `clip(blob)`
with the recorder's type as Content-Type, the transcript is appended to the
composer for editing, and the next send carries `clip_id`. A refused clip
shows the server's error text. No `mediaDevices` or no `MediaRecorder`:
the button is disabled and the composer says so. A denied permission says
how to allow it. `mount` takes `media: {devices, Recorder}` for tests.

The shell reconnects with backoff (0.5 s doubling to 15 s), fetches history
again and sends the voice wish again. A message waits for the socket to be
open before its POST, so the reply's first frames are not missed. If a turn
is running when the socket opens, history is fetched once more, so a turn
that ended between the first fetch and the socket is not left spinning.

## Shipping

`bin/figchat-bundle OUT` writes a flat directory: `index.html`, `boot.js`,
`figchat.js`, `voce.js`, `figchat.css`, `voce.css`, `z2-tokens.css`,
`rotolo.css`, `fonts.css`, four woff2 under `fonts/`, `figaro-head.png` and
`SHA256SUMS`. `nix build .#figchat-shell` is the same directory.

`index.html` refers to its files as `assets/<name>`, because the edge
(kelliher-web `lib.figchatRoutes`) serves `index.html` at `/chat/` and the
directory at `/chat/assets/`. The CSP it is tested under is that route's:
`script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:;
connect-src 'self'; media-src 'self' blob:`.

## Checks

```sh
node test/voce.test.js
node test/figchat.test.js
python3 test/figchat.test.py examples/figchat.html
```
