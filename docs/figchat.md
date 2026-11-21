---
name: figchat
description: figaro web, the React and Jotai client for the figaro-forms aria stream, shipped as packages.figchat-shell. Read before changing its routes, atoms, the speech and mic paths, the audio session, the bundle layout, or before binding it to a door.
---

# figaro web (figchat)

The web chat for figaro. It attends one aria at a time over a door that speaks
the `figaro-forms/aria` contract (JSON-RPC over WebSocket), draws it in nodi's
DOM shape, and lets Gluck send, steer, stop, fork, dictate and listen.

The visible title is "figaro web". Identifiers (`packages.figchat-shell`,
`bin/figchat-bundle`, `test/figchat.test.*`) keep the old name.

zanni's rule "no framework and no runtime" yields for figaro web only, by
Gluck's order. The zanni components stay framework-free; figaro web wraps them.
`nodi`'s pure functions (`model`, `blocks`, `stream`, `spans`, `reveal`, `metricsLine`)
and `voce`, the player, are imported from `assets/`; React draws the DOM that
`nodi.css` and `voce.css` style, so those sheets apply unchanged.

## Source and build

`web/` holds the app: `src/lib` (pure code and tests' subjects), `src/state`
(Jotai atoms), `src/components`, `src/styles`. React 19, Jotai 3, TypeScript,
Vite, Vitest. `figaro-forms` comes as a vendored npm tarball in `web/vendor`,
pinned by `package-lock.json`; `bin/figchat-vendor-forms TAG` replaces it
(`nix build <figaro-forms on keel>?ref=refs/tags/TAG#tarball`) and writes
`vendor/SOURCE.json`. nodi, voce and `assets/figchat/speech.js` are UMD files;
a small Vite transform in `vite.config.ts` turns them into default exports.

`packages.figchat-shell` is `buildNpmPackage`: tsc, `vite build`, Vitest, then
`bin/figchat-bundle` flattens `dist` into the layout the edge serves. The build
is deterministic (`nix build --rebuild` gives the same `SHA256SUMS`).

`npm run dev` in `web/` serves the app with Vite; `/door`, `/audio` and `/stt`
proxy to `FIGCHAT_DOOR` (default `http://127.0.0.1:8099`, run
`node test/figchat-server.js <bundle>` for a mock door that prints its port).

## Deploy contract

A flat directory: `index.html` served at `/chat/`, every other file under
`/chat/assets/`. The page dials `door`, `audio` and `stt` relative to itself,
so behind the edge they reach `/chat/door`, `/chat/audio` and `/chat/stt`
(`lib/figchat-routes.nix` strips `/chat`). Same origin only, no inline script or
style: `bin/figchat-bundle` refuses an `index.html` that has one, and the edge
CSP would block it. `THIRD-PARTY.txt` carries the notices and the upstream map.

## Routes

`#/` the aria list, `#/<store>/<aria>` an aria, `#/<store>/<aria>:<turn>` an
aria scrolled to a turn (older pages are read until the turn is held, at most
60 pages). A store names a client wired in `main.tsx` from `data-store`.
Under 900 px one of list or aria shows; from 900 px both. Moving between the
two at that width runs a same-document View Transition where it exists.

## Atoms

figaro-forms (`figaro-forms/aria/jotai`): `ariaAtom`, `ariaPhaseAtom`,
`ariaConnectionAtom`, `ariaRosterAtom(client, {limit})` (read
`{rows, next, refused, loading, error}`, write `"more"` or `"refresh"`;
refetched when the connection reopens).

`packages/react/src/jotai/state`: `bootAtom` (stores, door paths), `routeAtom`/`goAtom`,
`clientAtom`, `attendedAtom`; `rosterAtom`; per aria and
memoised by client: `turnsAtom` (nodi's model, turns reused while unchanged),
`runningAtom`, `workAtom` (verb and start of the open turn), `noteAtom`;
`linkAtom` (the attended aria's phase, else the connection); `composerAtom`
and `draftAtom` per aria; `micAtom`; `voiceAtom`, `handsFreeAtom`,
`speakingAtom`; `pitViewAtom` and the pit state atoms. Players are imperative and live in `VoiceHub`,
not in atoms.

## What the app does

- List: the topology Tree (one `Tree` with the pager's formNode semantics),
  opened to the attended aria's chain; turn counts and mantras come from each
  aria's own facts (`ariaFactsAtom`), not the roster page.
- Attend: the stream reads backward from the end in byte-budget pages and
  follows live. Following lets go when the reader scrolls up and a Latest pill
  says new content landed below. Earlier turns page in above without moving
  what is on screen.
- Composer: Enter sends, Shift+Enter breaks the line, never during IME
  composition, never on a coarse pointer. While a turn runs the composer gains
  one 40px line (glyph, what is running, elapsed time, Stop, Stop all) and the
  send pill steers. The row holds the input, the record button and the send
  pill (✎, ↳ while running), both round and 36px, glyphs from figaro-forms by
  name. No pill is drawn that does nothing: attach and command come back with
  their lanes. The record glyph is `voice` (🎙︎ until the table carries it) and
  the attach glyph will be `attach` (📎︎), keyed by name, not by character.
  Every glyph in a pill, a pit row or a message button is centred by its ink,
  not its advance box (`Glyph`, `ink.tsx`): VT323 and the fallback faces sit on
  different baselines, so the glyph is drawn once on a canvas, its ink box read
  back, and the offset held as a zero-length animation of `translate`, which the CSP
  allows where a style attribute or an inserted rule is refused. The buttons under a message are 44px with a 36px glyph. The record button is glyph-only until voice
  is on, then widens. Errors and the mic's notes take that same line. A draft is kept
  per aria in localStorage, saved 400ms after typing, cleared on send.
- Fork sits in the aria header; Fork here and Play in each turn's action bar
  (on hover or focus with a fine pointer, always on the last turn and on touch).
- Adjacent thinking and tool nodes fold into one work group titled by what
  happened in it ("Explored 3 files, ran 1 command").
- Small buttons sit right under a message, no sheet and no scrim: your message
  has play (its clip, key `.../in`, played in place) and re-transcribe
  (`POST stt/key/<key>`, then a use button puts the text in the composer); a
  reply has play, the same as the turn's own. Hands-free hides them and keeps
  the large Play.

## Audio

`lib/audio-session.ts` is one state machine over the page's audio: idle,
playing, recording, recording-with-pending. It owns `navigator.audioSession`:
`play-and-record` while hands-free or the mic is on, `playback` otherwise.
voce no longer touches the session.

- Play on a turn replays its stored copy by key (`audio/key/<store>/<aria>:<turn>/out`).
  When that answers 404 or 410 the player is dropped and the page asks the
  gateway to speak the turn: `{type:"say", turn}` on `/audio/<aria>`, which opens
  the socket for the ask. The gateway answers `audio.start` with `say: true`
  (played like a live reply, with no ping and no hold), or `audio.stored` (play
  the stored copy again), or `error` with `bad-turn`, `open`, `silent`, `busy` or
  `speech`, shown on the strip for four seconds. A turn is asked once per press.
  Live audio the gateway speaks while the voice is off is ignored; audio asked
  for with Play is not.
- Voice speaks replies from the gateway's `/audio/<aria>` into the prose node
  that owns them, one voce player per turn (`lib/voice-hub.ts`). voce queues:
  a reply arriving while another speaks waits its turn.
- Hands-free implies voice. Each arriving reply is announced with a short
  ping before its audio. A reply that arrives while Gluck records is held with
  no sound; when he stops there is one ping and the held replies play in
  arrival order.
- Voice and hands-free live in memory only: not in localStorage,
  sessionStorage or a cookie. A reload starts with both off.
- Dictation streams. Arming the mic opens a WebSocket to `stt/stream` (at the
  edge `/chat/stt/stream`) with `aria=<store>/<aria>`, `lang` and the session
  id, before permission or speech. An AudioWorklet (`assets/figchat/pcm-worklet.js`)
  sends 40 ms frames of 16 kHz mono s16le (1280 bytes); up to two seconds wait
  in a queue until the socket opens. Partials and finals fill the composer
  while Gluck is still speaking; stop sends `{"type":"end"}` and the `done`
  text settles the draft. At most five minutes. A level meter under the record
  button moves from the first frame. Sending is an ordinary prompt. The frame
  contract is `2026/11/21/stt-stream-contract.md` in the captains-log.

The gateway contract (`audio.start`, `audio.chunk`, `audio.end`,
`audio.cancel`, `error`) is in figaro-forms `docs/gateway.md`.

## Motion

Tokens on `.fw`: `--fw-pop` (zanni's spring), `--fw-spring` (a damped spring,
13% overshoot, for slides), `--fw-out` (exits never bounce); durations press
90ms, pop 320ms, slide 420ms, exit 160ms. Buttons press to 0.94. The reader's
new turn rises 8px on the spring; agent nodes fade in over 160ms; streaming
text never animates. The strip and the sheet enter from below and leave
downward in 160ms. Folds animate their height where `interpolate-size` exists.
`prefers-reduced-motion` sets every duration to 1ms, stops every loop, shows a
still glyph, and skips the View Transition. No boil anywhere.

## Laws

Server text enters only through `Plain` (`components/text.tsx`), which boxes
control and bidi characters. No `dangerouslySetInnerHTML` and friends:
`test/text-sinks.test.ts` fails on any HTML-parsing sink in `src`. Inline
`style` is used only for the measured `--fw-composer-h` on the root, through
the CSSOM. The views never touch `fetch` or `WebSocket`; `lib/dictation.ts`, `lib/stt.ts`
(re-transcribe), the speech transport and the figaro-forms client do.

## Checks

`checks.figchat`: Vitest (routes, the Tree, work groups, mic machine, audio
session, voice hub, composer, drafts, the pit Sheet, the app against
`examples/aria-mock.js` in-process), the nodi and voce node tests, the mock door
and speech tests in `test/figchat.test.js`, and `test/figchat.test.py`, which
runs Chromium at 390 and 1280 (light and dark) against `test/figchat-server.js`:
the built bundle under the edge CSP and the mock over a real WebSocket. It
measures the composer (idle at most 76px, running at most 120px, the strip one
line, the last node above the composer), covers history, paging, deep links,
hostile text, send, steer, stop, fork, drafts, voice, hands-free hold, the mic,
the pits, and runs once with reduced motion to assert nothing computes a
duration over 1ms.

Left out: tables in markdown, a preview of a recording before it is sent.
