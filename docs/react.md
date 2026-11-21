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
| `Tree` | the pager's formView in a browser: one row per `formNode` (`key: value` leaves aligned per parent, `name (N)  child · labels` closed, `name (N)` open, indented by depth with a disclosure caret (`.zr-tree-disclosure`) and no guide characters, no header; rows may carry a `role`, a `mantra` and a `here` mark, each with `data-tone`), a cursor row with j/k/u/d/gg/G, `l` open, `h` close or climb, Enter toggles or calls `onActivate`, `keys` hands any other key and the cursor row to the caller; `treeRows` is the pure walk |
| `PitProvider`, `PitGrip`, `Pit`, `PitList`, `PitRow` | the drawer dragged from the composer edge (closed, half, full), its rows |
| `TurnView`, `ProseView`, `ToolView`, `ThinkingView`, `WorkGroup`, `TranscriptContext` | the nodi transcript as React; the context carries two app hooks: open the message sheet, per-turn actions. Each turn's head is a `Sticky` |
| `Sticky`, `QuestionMark`, `Rule`, `usePinned`, `tapMode`, `keyMode` | the pager's pinned question in a browser: a `position: sticky` bar inside the one existing scroller (`[data-zr-scroll]`, no second one) with `heading` and `tools`; `children` is the body. Two IntersectionObservers say pinned (the question block has wholly passed under the bar, as the pager drops its rule while any of the block is on screen, and the scope is still on screen); the block is whatever element takes the `QuestionMark` ref (`InputView` does). Pinned floats the question's first line under the bar (no layout shift) and spreads the `Rule` from single (`rule`) to double (`rule.double`) glyphs by a CSS mask on `--zr-spread`. A tap on the bar or the line focuses the bar and opens the whole question as whole lines (head.open `∧`, head.shut `∨`), a second inside `DOUBLE_TAP_MS` makes it full, any later tap shuts it; Enter, Esc, F, j and k as the pager's `p`. `tapMode` and `keyMode` are the pure transitions |
| `Fit`, `fitText`, `firstLine`, `FIT_ELLIPSIS` | a question's first line fitted to the box it is in: `Fit` measures with a hidden probe of the same font, refits on resize and font load, and ends a cut with the dimmed ` ..`; `fitText` is the pure binary search over a `fits(candidate)` predicate |
| `useFollow`, `LatestPill`, `PlayerIsland` | follow the bottom with a Latest pill and prepend anchor; a voce player the component owns |
| `nodi`, `speech`, `voce`, work helpers | the framework-free zanni modules and the pure grouping and timing functions |
| `Glyph` | a glyph centred by its ink box rather than its advance box, so VT323 and fallback faces centre alike in a pill, a pit row or a button: drawn once per font and glyph on a canvas, its ink read back, the offset held as a zero-length `translate` animation, which the edge CSP lets through where a style attribute or an inserted rule is refused |
| `Pill`, `PillPair` | a small round glyph button named by `aria-label` (optional `pressed`, `disabled`, `title`), and a joined pair of them; `Composer` takes `attach`, `command` and `sendGlyph` and lays them out |
| `Composer`, `Strip` | the message box and the one-line running strip; slots for the mic and the stop buttons; writes its height to a CSS variable. For a line that is not a message it takes `prompt` (a glyph left of the input), `hints` (drawn above the row), `onEscape`, `onTab` (a Tab with no Shift) and `enterRuns` (Enter submits on a coarse pointer too) |
| `Tray` | the composer's attachment chips: name, kind and size, uploading, ready or failed (the failure text replaces the size), a remove button that does not take focus; the `Composer`'s `tray` slot draws it above the row |
| `Hints` | completion chips (a chip that cannot run is dashed and carries its reason as its title; picking one does not take focus from the input) over a usage line, or a refusal in its place |
| `useLinger`, `transition`, `reducedMotion` | motion helpers that honour prefers-reduced-motion |

Rules: no atoms, no fetches, no figaro names in this entry; class names are `zr-*`; motion and size come from the `--zr-*`
and `--z-*` tokens, which an app aliases to its own (figaro web sets `--zr-mono`, `--zr-prose`, `--zr-edge-*`). Tests live
in `web/test/react` and run with the app's.

figaro web resolves the package by alias to `packages/react/src` (vite.config.ts, tsconfig paths), so one lockfile and one
nix build cover both.

## zanni-react/jotai
`AriaView`, `Roster`, `StatusBar`, `BoundPit`, `BoundComposer`, `TurnActions` and the atoms behind them (`bootAtom`,
`routeAtom`, `rosterAtom`, `composerAtom`, `draftAtom`, `audioSessionAtom`, `micAtom`, `pitViewAtom` and the rest). Needs jotai
and figaro-forms 0.14 (both peer dependencies of this entry only). figaro web is `app.tsx`, `main.tsx` and `styles/`: it mounts
these under `.fw` and styles the `fw-*` hooks. `web/test/react/boundary.test.ts` fails if the root entry imports jotai or
figaro-forms values, or if shipped code carries a comment.

Command mode is the pager's `:` line. `lib/command.ts` is pure: `tokenize` (quotes, backslash, `--`), `planOf` (the catalog's
`pagerCommand`, `webCommands` and `commandBounds` turn a line into a run, a refusal with its reason, or nothing), `suggest`
(verbs, arias from the tree, keys of the bound form, outfits from `angelus.outfits`, `state` subcommands, usage for the rest) and
`applyCandidate`. `state/command.ts` holds `commandAtom(key)` (on, line, why) per aria and `runCommandAtom`, which runs a plan
through the existing atoms: `forkAtom`, `mintFigaroAtom`, `interruptAtom`, `boundFormWriterOf` for set, unset and toggle,
`goAtom`. It returns the outcome the composer shows: a note, a pit view to open, or the help sheet.

Attachments: `lib/attach.ts` (limits, `uploadFile`, the size and kind words) is pure; `state/attach.ts` keeps a list per aria
(`attachmentsAtom`), uploads one file at a time (`addFilesAtom`), and gives `sendAtom` the ids (`readyIdsAtom`, which uploads
again what the gateway is about to forget). `bootAtom` carries `attachUrl` (`data-attach`, default `attach`).
