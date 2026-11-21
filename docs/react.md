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
| `ListRow`, `List`, `ActionBar`, `Fold` | roster rows with depth and current mark; hover-reveal per-row actions (always on the last row and on touch); a details with a spring-height body |
| `TurnView`, `ProseView`, `ToolView`, `ThinkingView`, `WorkGroup`, `TranscriptContext` | the nodi transcript as React; the context carries two app hooks: open the message sheet, per-turn actions |
| `useFollow`, `LatestPill`, `PlayerIsland` | follow the bottom with a Latest pill and prepend anchor; a voce player the component owns |
| `nodi`, `speech`, `voce`, work helpers | the framework-free zanni modules and the pure grouping and timing functions |
| `Composer`, `Strip` | the message box and the one-line running strip; slots for the mic and the stop buttons; writes its height to a CSS variable |
| `useLinger`, `transition`, `reducedMotion` | motion helpers that honour prefers-reduced-motion |

Rules: no atoms, no fetches, no figaro names in this entry; class names are `zr-*`; motion and size come from the `--zr-*`
and `--z-*` tokens, which an app aliases to its own (figaro web sets `--zr-mono`, `--zr-prose`, `--zr-edge-*`). Tests live
in `web/test/react` and run with the app's.

figaro web resolves the package by alias to `packages/react/src` (vite.config.ts, tsconfig paths), so one lockfile and one
nix build cover both.

## zanni-react/jotai
`AriaView`, `Roster`, `TopBar`, `BoundSheet`, `BoundComposer`, `TurnActions` and the atoms behind them (`bootAtom`,
`routeAtom`, `rosterAtom`, `composerAtom`, `draftAtom`, `audioSessionAtom`, `micAtom`, `sheetAtom` and the rest). Needs jotai
and figaro-forms 0.6 (both peer dependencies of this entry only). figaro web is `app.tsx`, `main.tsx` and `styles/`: it mounts
these under `.fw` and styles the `fw-*` hooks. `web/test/react/boundary.test.ts` fails if the root entry imports jotai or
figaro-forms values, or if shipped code carries a comment.
