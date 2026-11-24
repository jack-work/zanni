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
`/chat/assets/`. The page dials `door`, `audio`, `stt` and `attach` relative to itself,
so behind the edge they reach `/chat/door`, `/chat/audio`, `/chat/stt` and
`/chat/attach` (`lib/figchat-routes.nix` strips `/chat`; `attach` needs the edge
route for the gateway's `POST /attach`, figaro-forms 0.11.1 and later). Same origin only, no inline script or
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

- State: the bound form as the same Tree; a tap or `c` on a value opens Set and
  Unset, and Set a key adds one, all through figaro-forms' `boundFormWriterOf`.
  The daemon refuses `system.*`, `runtime.*`, `name` and `role-name`, and the
  pit shows its reason.
- List: the topology Tree, the pager's `:ls` and not `figaro ls`: the node's
  row (its id, the keys of its @troupe entry, ● when it is this node), `arias`,
  then one row per aria by `active_at` descending, forks nested under their
  parent. A row reads handle, `(N)` the number of keys in that aria's form node,
  the `role` key, the mantra in quotes, and ● on the attended aria; the cursor
  row adds `Enter attend · x kill`. Indentation and the disclosure caret are DOM
  and CSS, no guide characters. Open on arrival: the node, `arias`, the attended
  aria's chain and the aria itself (it is remembered when the list is shown
  after leaving it, at 390). j k l h gg G Enter as the pager; `x` says "press x
  again to kill <handle>" and a second `x` asks the door, which the delegated
  gateway refuses, and the refusal is shown.
- Forks: after one the alternative is attended (`#/<store>/<alt>`, no turn), the
  transcript is the alternative's own history followed to its end, the status bar
  names it by handle and mantra, and there is no banner and no fork glyph there.
  The fork's first own turn alone wears `⑂ <parent handle>` in its head (the turn
  whose opening message carries `forked_from`, the wire field, not a form key);
  a tail fork has none until its first prompt. A fork at turn N keeps turns 1 to N-1.
- Tool rows: the header wears the node's `label` (else the tool's name) and the
  value of its `head_arg` (else the daemon's summary). A `body_arg` names the
  argument drawn in place of the output (and is left out of Arguments), and
  `diff` colours added, removed, hunk and file lines of whatever is drawn. All
  four are stamped by the daemon (figaro 0.82.0), so the web keeps no table of
  tools for them. The vendored figaro-forms is 1c7a9a4 (lane/ir-gaps).
- Form deltas: a turn whose form changed wears `Δ` in its head, after the fork
  mark, as the pager's gutter does. It opens a table of one row per key, the
  bound form first and unprefixed, other forms dotted onto their id, keys
  sorted: `key  old -> new`, `∅` for a side that is absent, `""` for the empty
  string, `⊘ <form>` for a deleted form. A value is one line (its first, then
  `…`), control characters stripped; the key column is the widest key up to
  28 characters, each value keeps at least 6 and ends in `…` when squeezed, and
  the whole row is its title. A row opens to its old and new value whole (JSON
  indented). A fork's own first turn does not list `forked_from` or `aria_id`.
  A node's deltas follow the turn's in the same table. The spec is in the
  captains-log (figchat-deltas-spec.md).
- Attend: the stream reads backward from the end in byte-budget pages and
  follows live. Following lets go when the reader scrolls up and a Latest pill
  says new content landed below. Earlier turns page in above without moving
  what is on screen.
- Composer: Enter sends, Shift+Enter breaks the line, never during IME
  composition, never on a coarse pointer. While a turn runs the composer gains
  one 40px line (glyph, what is running, elapsed time, Stop, Stop all) and the
  send pill steers. The row holds the input, the record button and the send
  pill (✎, ↳ while running), both round and 36px, glyphs from figaro-forms by
  name. Every pill acts: attach opens the file picker, command toggles command mode, send sends. The record glyph is `voice` (🎙︎ until the table carries it) and
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

## Typesetting

`Typeset` (zanni-react) re-typesets a text as its box changes width. It draws the
plain text clamped by CSS at once, loads Pretext in its own chunk
(`typeset-pretext`, about 38 KB gzip, MIT), and then breaks the text into lines
with `prepareWithSegments` once per text and font and `layoutWithLines` per
width: arithmetic over cached widths, no DOM measurement. The width comes from a
ResizeObserver entry, the font from the computed style. Each line is a block
that fades and rises into place when its text changes (opacity and translate
only); a line that did not change keeps its node. `lines` caps the count and
`tail` ends a cut. `Fit`, the sticky bar's first line of the question, is a
one-line `Typeset` with the dimmed " .." tail. Pretext reaches the page only
through `import("./typeset-pretext")`: `bin/figchat-bundle` fails a build whose
first-load chunks carry it, and the bench caps the lazy chunk's size apart from
the first load's.

## Icons

The compose bar's two icons, the microphone (U+F130, `glyphs.voice`) and the
paperclip (U+F0C6, `glyphs.attach`) from figaro-forms 0.18.3, and the play
button's speaker (U+F028, `glyphs['audio.play']`), come from a three-glyph
subset of Symbols Nerd Font (`assets/fontpack/fonts/symbols-nerd-subset.woff2`,
952 bytes) declared as the family "Nerd Icons" and listed right
after VT323 in the mono stacks, so no other text falls through to it. The
subset is SIL OFL 1.1 (`OFL-symbols-nerd.txt`); the icons are Font Awesome 4 by
Dave Gandy, CC BY 4.0, credited in `THIRD-PARTY.txt`.

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

## Benchmarks

Three pieces let a harness measure figaro web offline.

Build stats. Every asset name Vite emits already carries a content hash, so
the files are immutable by name; `bin/figchat-bundle` now refuses an asset
whose name has none. It writes `STATS.json` beside `index.html` (served at
`/chat/assets/STATS.json`): `{version, total: {raw, gzip}, files: {name: {raw,
gzip, hashed}}}`, gzip at level 9, `hashed` false only for `index.html` and
`THIRD-PARTY.txt`.

Stable hooks. `data-testid` on `composer-input` (the textarea), `send`,
`transcript-scroller` (the `[data-zr-scroll]` element), `pit-grip`, and on
tree rows: `topology-row` and `form-row` (the trees carry `topology` and
`form`). Opening an aria runs `performance.mark("figchat:attach")` when the
view mounts and clears `window.__figchat`; the first painted frame after the
aria is live and scrolled to its place (two animation frames later) runs
`performance.mark("figchat:first-frame")` and sets
`window.__figchat.firstFrame = performance.now()`. No other globals.

Bench mode. `examples/aria-mock.js` `create` takes `history: N` (N turns on
the main aria, default 26, the old fixture) and `stream: {fps, bytes, chunk}`
(every prompt then gets one prose reply of `bytes` bytes, `chunk` bytes per
frame, one frame every `1000/fps` ms against a fixed deadline, defaults 30,
8000, 64; `[error]` still fails). `node test/figchat-server.js <bundle> [step]
[--history N] [--page BYTES] [--fps F] [--bytes B] [--chunk C]` passes them
through; `--page` is the server's page cap (default 3000), raise it so a
10000-turn history pages in a few reads. `figchat_kit.Door(bundle, step,
**flags)` forwards the same flags. Without them nothing changes.

## Checks

`checks.figchat`: Vitest (routes, the Tree, work groups, mic machine, audio
session, voice hub, composer, drafts, the pit Sheet, the app against
`examples/aria-mock.js` in-process), the nodi and voce node tests, the mock door
and speech tests in `test/figchat.test.js`, and `test/figchat.test.py`, which
runs Chromium at 390 and 1280 (light and dark) against `test/figchat-server.js`:
the built bundle under the edge CSP and the mock over a real WebSocket. It
measures the composer (idle at most 76px, running at most 120px, the strip one
line, the last node above the composer), covers history, paging, deep links,
attach (photo and PDF in WebKit at iPhone size reach a turn and the reply names them, a refused file shows the gateway's words),
command mode (the colon, the verbs, a refused verb's reason, `:fork :12`, `:ls`, Enter on an empty line, the two-step Esc),
hostile text, send, steer, stop, fork, form deltas (the Δ table at 390 without sideways scroll), drafts, voice, hands-free hold, the mic,
the pits, and runs once with reduced motion to assert nothing computes a
duration over 1ms.

Left out: tables in markdown, a preview of a recording before it is sent.
