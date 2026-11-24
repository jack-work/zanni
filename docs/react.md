---
name: react
description: zanni-react, the React component package under packages/react. Read before adding a component, moving one out of figaro web, or consuming the package from another site.
---

# zanni-react

One package, one version (the zanni version). `zanni-react` is state-free: components take props and callbacks, peer
dependency react only. `zanni-react/jotai` binds them to figaro-forms and Jotai: the state atoms, the audio session, mic and voice hub, and the bound components. `zanni-react/styles.css` is the CSS.

| export | what |
|---|---|
| `Button`, `ButtonGroup` | the z2 control scale (`size` compact or default, `variant` outline, quiet, ghost, accent); `aria-pressed` makes a toggle |
| `Sheet` | scrim and bottom sheet: Escape, focus in and back, Tab trap, keeps its content through the exit animation |
| `BlockView` | one markdown block (paragraph, heading, list, quote, code, table), memoized on its content: a streaming reply re-renders only its trailing block, and a closed message draws the same way |
| `ActionBar`, `Fold` | hover-reveal per-row actions (always on the last row and on touch); a details with a spring-height body |
| `Tree` | the pager's formView in a browser: one row per `formNode` (`key: value` leaves aligned per parent, `name (N)  child · labels` closed, `name (N)` open, indented by depth with a disclosure caret (`.zr-tree-disclosure`) and no guide characters, no header; rows may carry a `role`, a `mantra` and a `here` mark, each with `data-tone`), a cursor row with j/k/u/d/gg/G, `l` open, `h` close or climb, Enter toggles or calls `onActivate`; with `onEdit`, `c` or a tap on a leaf calls it instead; `keys` hands any other key and the cursor row to the caller; `treeRows` is the pure walk |
| `PitProvider`, `PitGrip`, `Pit`, `PitList`, `PitRow` | the drawer dragged from the composer edge (closed, half, full), its rows |
| `TurnView`, `ProseView`, `ToolView`, `ThinkingView`, `WorkGroup`, `TranscriptContext` | the nodi transcript as React; the context carries two app hooks: open the message sheet, per-turn actions. A tool item draws from `label`, `head`, `body` and `diff` (nodi reads `head_arg` and `body_arg` out of the node's args, partial JSON included). A `TurnModel` with `deltas` wears the `Δ` head button and its table |
| `deltaRowsOf`, `cellLine`, `keyColumns`, `valueLines` | the pager's form-delta rows from a turn's or node's `formDeltas` (pure; `forked` drops the fork's birth keys) and their cells, key width and open lines |
| `useFollow`, `LatestPill`, `PlayerIsland` | follow the bottom with a Latest pill and prepend anchor; a voce player the component owns |
| `nodi`, `speech`, `voce`, work helpers | the framework-free zanni modules and the pure grouping and timing functions |
| `Glyph` | a glyph centred by its ink box rather than its advance box, so VT323 and fallback faces centre alike in a pill, a pit row or a button: drawn once per font and glyph on a canvas, its ink read back, the offset held as a zero-length `translate` animation, which the edge CSP lets through where a style attribute or an inserted rule is refused |
| `Pill`, `PillPair` | a small round glyph button named by `aria-label` (optional `pressed`, `disabled`, `title`), and a joined pair of them; `Composer` takes `attach`, `command` and `sendGlyph` and lays them out |
| `Composer`, `Strip` | the message box and the one-line running strip; slots for the mic and the stop buttons; writes its height to a CSS variable. For a line that is not a message it takes `prompt` (a glyph left of the input), `hints` (drawn above the row), `onEscape`, `onTab` (a Tab with no Shift) and `enterRuns` (Enter submits on a coarse pointer too) |
| `Tray` | the composer's attachment chips: name, kind and size, uploading, ready or failed (the failure text replaces the size), a remove button that does not take focus; the `Composer`'s `tray` slot draws it above the row |
| `Hints` | completion chips (a chip that cannot run is dashed and carries its reason as its title; picking one does not take focus from the input) over a usage line, or a refusal in its place |
| `QueueBoard` | the deploy pipeline as a board: one row per commit (short sha, repo, ref), one column per `deploy.step` (queue, review, merge, build, dev deploy, prod deploy, cut), each cell the duration and outcome (ok, fail, skip; empty when the step never ran) with site, unit, actor, cand and box in its tooltip, and per step a head of count, failure rate, p50 and p95. Controlled: `data` is figscope's `/api/deploys` body, `env` (dev, prod) and `since` (24h, 7d, 14d) are toggles that call `onEnv` and `onSince`; `sinceOf` turns a window into the RFC3339 the route wants |
| `useLinger`, `transition`, `reducedMotion` | motion helpers that honour prefers-reduced-motion |

Rules: no atoms, no fetches, no figaro names in this entry; class names are `zr-*`; motion and size come from the `--zr-*`
and `--z-*` tokens, which an app aliases to its own (figaro web sets `--zr-mono`, `--zr-prose`, `--zr-edge-*`). Tests live
in `web/test/react` and run with the app's.

figaro web resolves the package by alias to `packages/react/src` (vite.config.ts, tsconfig paths), so one lockfile and one
nix build cover both.

## Served bundle
`packages.zanni-react` (flake output) builds both entries to immutable versioned files, the version being `assets/manifest.json`'s:

```
$out/react/<version>/{index.js,index.css,index.d.ts,SHA256SUMS}
$out/react-jotai/<version>/{index.js,index.css,index.d.ts,pcm-worklet.js,SHA256SUMS}
```

Serving contract for the backend (`gateway.spain-upkeep`):

- Route `/zanni/react/<version>/` to `$out/react/<version>/` and `/zanni/react-jotai/<version>/` to `$out/react-jotai/<version>/`. Both live under the one package output, so the version directories of every release can sit side by side.
- A version directory never changes once published: `Cache-Control: private, max-age=31536000, immutable` (private because the site sits behind login), no revalidation, no other path serves the same bytes. A new version is a new directory. Serve `.js` as `text/javascript`, `.css` as `text/css`, `SHA256SUMS` as `text/plain`, `index.d.ts` as `text/plain`.
- Same origin only. The edge CSP stays `script-src 'self'`; no file contains inline script or style, a `data:` or `blob:` module, `eval` or `new Function` (`checks.zanni-react` fails the build otherwise). `pcm-worklet.js` is a file beside `index.js` because an audio worklet module is a script and `data:` is refused; the jotai bundle loads it as `new URL("pcm-worklet.js", import.meta.url)`, so it must stay in the same directory as `index.js`.
- `SHA256SUMS` is `sha256sum -c` format over the other files of its directory.
- The route serves nothing else: React, react-dom, jotai, figaro-forms and @chenglou/pretext are not in the bundles and not served here.

Externals, resolved by the page's import map (one React per page, one trace and one voice hub):

| bundle | bare imports it leaves |
|---|---|
| `react` | `react`, `react/jsx-runtime`, `figaro-forms/glyphs`, `@chenglou/pretext` (loaded on demand by Typeset) |
| `react-jotai` | `react`, `react/jsx-runtime`, `react-dom`, `jotai`, `figaro-forms/aria`, `figaro-forms/aria/jotai`, `figaro-forms/catalog`, `zanni-react` |

`react-jotai` imports the core as `zanni-react` rather than copying it, so map `zanni-react` to the core bundle's `index.js` of the same version.

Import map (see `examples/react-bundle.html`):

```
{ "imports": {
  "react": "/vendor/react/index.js",
  "react/jsx-runtime": "/vendor/react/jsx-runtime.js",
  "figaro-forms/glyphs": "/vendor/figaro-forms/glyphs.js",
  "@chenglou/pretext": "/vendor/pretext/index.js",
  "zanni-react": "/zanni/react/<version>/index.js" } }
```

An inline import map is a script to the CSP: `script-src 'self'` refuses it unless the policy also carries its hash (`'sha256-...'` over the exact text between the tags), and external import maps are not supported by browsers. A page that cannot carry the hash bundles `zanni-react` through its own bundler from the same files.

Styles: link `index.css` of the core beside the page's z2 token and control CSS; `react-jotai/<version>/index.css` is empty and exists so both directories have the same shape. Types: `index.d.ts` is a script file of ambient module declarations (`zanni-react`, and `zanni-react/jotai`, which refers to the core's declarations, so load both); add them to a TypeScript project with `/// <reference path>` or `include`. The manifest's `react` entry lists every export of each bundle under `bundle.exports`, and `checks.zanni-react` fails when it differs from the built files.

## zanni-react/jotai
`AriaView`, `Roster`, `StatusBar`, `BoundPit`, `BoundComposer`, `TurnActions` and the atoms behind them (`bootAtom`,
`routeAtom`, `rosterAtom`, `composerAtom`, `draftAtom`, `audioSessionAtom`, `micAtom`, `pitViewAtom` and the rest). Needs jotai
and figaro-forms 0.14 (both peer dependencies of this entry only). figaro web is `app.tsx`, `main.tsx` and `styles/`: it mounts
these under `.fw` and styles the `fw-*` hooks. `web/test/react/boundary.test.ts` fails if the root entry imports jotai or
figaro-forms values, or if shipped code carries a comment.

Command mode is the pager's `:` line. `lib/command.ts` is pure: `tokenize` (quotes, backslash, `--`), `planOf` (the catalog's
`pagerCommand`, `webCommands` and `commandBounds` turn a line into a run, a refusal with its reason, or nothing), `suggest`
(verbs, arias from the tree, keys of the bound form, outfits from `angelus.outfits`, `state` subcommands, usage for the rest) and
`applyCandidate`. `state/command.ts` holds `commandAtom(key)` (on, line, why, shut) per aria and `runCommandAtom`, which runs a plan
through the existing atoms: `forkAtom`, `mintFigaroAtom`, `interruptAtom`, `boundFormWriterOf` for set, unset and toggle,
`goAtom`. It returns the outcome the composer shows: a note, a pit view to open, or the help sheet.
The grammar is the pager's: `:fork 12` reads 12 as an aria id prefix and `:fork :12` is turn 12. Enter on an empty line leaves command mode.
Escape closes the completion chips first when a line is typed and chips show (`shut`, cleared by typing or Tab), and leaves on the next.

Attachments: `lib/attach.ts` (limits, `uploadFile`, the size and kind words) is pure; `state/attach.ts` keeps a list per aria
(`attachmentsAtom`), uploads one file at a time (`addFilesAtom`), and gives `sendAtom` the ids (`readyIdsAtom`, which uploads
again what the gateway is about to forget). `bootAtom` carries `attachUrl` (`data-attach`, default `attach`).

Browser spans: `trace.ts` makes one root span per user action (`beginAction` or `traced`: send, speak, dictate, fork, attach), service
`figaro-web`, attributes `figchat.session`, `figchat.action` and `figaro.aria`, never text, params or URLs. `traceDial` wraps the
door's dial and stamps the latest action's W3C `traceparent` into `figaro.qua` params; `traceHeaders` does the same for the stt, audio
key and attach fetches, next to `X-Figchat-Session`. Failures become an error span and a log record carrying only `error.type` and the
status. `configureTraces(base)` (`data-otel`, default `otel`, resolved against the page, so `/chat/otel/v1/traces` and `/v1/logs`)
batches every 10 s, on `pagehide` and when the page hides (sendBeacon, else keepalive fetch), keeps at most 512 of each, and gives up
for the page after a 401, 403, 404 or 405. Set `data-otel=""` to turn it off.
