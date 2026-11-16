# Strati

Reusable Sugiyama layered graph layout engine and Figaro forms projection
helper. Zero runtime dependencies, no DOM requirement, deterministic output.

## Use

Load `assets/strati/strati.js` (`window.strati` / `window.zanni.strati`) or
`require('./assets/strati/strati.js')` in Node. It can also be injected via
`zanni-inline --component strati` with `<!-- zanni:strati -->`.

```js
const result = strati.layout({
  nodes: [
    { id: 'root', width: 224, height: 104 },
    { id: 'eng', width: 224, height: 118 }
  ],
  edges: [
    { from: 'root', to: 'eng' }
  ]
}, {
  routing: 'orthogonal',
  width: 1160,
  maxColumns: 4,
  nodeGap: 36,
  layerGap: 68
});
```

## Phases and options

1. **Ranking and cycle policy.** By default (`allowCycles: false`), cycles are
   refused so authority graphs never invert an edge. Setting `allowCycles: true`
   identifies DFS back-edges for longest-path ranking and restores original
   direction with `reversed: true` on the routed edge. Optional `node.band`
   partitions nodes into ordered architectural bands before local ranking.
2. **Width-bounded physical tiers.** Logical ranks wrap into physical rows
   bounded by `maxColumns` (default `4` in orthogonal mode, `Infinity` in
   bundled mode) and the pixel `width` budget. Wrapped rows do not invent
   intermediate supervisors.
3. **Dummy chains and crossing reduction.** Edges spanning multiple physical
   rows split into virtual dummy chains (`dummyWidth`, default `8`). Alternating
   downward and upward barycentric sweeps (`sweeps`, default `24`) retain the
   minimum crossing count with stable tie-breaking.
4. **Coordinate assignment and routing (`routing`).**
   - `'orthogonal'` (default): centered column grid with inter-column vertical
     channels and disjoint exit/entry horizontal tracks. Returns merged shared
     `segments` and `junctions` per source owner.
   - `'bundled'`: isotonic block coordinate solver (weighted toward straight
     dummy chains), distributed side ports (`t`, `b`, `l`, `r`), dummy-chain
     `waypoints`, cubic Bezier SVG path `d` and `mid` label anchors.
5. **Secondary obstacle-avoiding routing.** `strati.routeOrthogonal(graph, edge)`
   routes peer or handoff edges orthogonally around placed node boxes using A*.

## Deriving from Figaro forms

`strati.fromForms(snapshot, options)` (also exposed as `ordine.fromForms`)
projects a public hierarchy model and Sugiyama `{ nodes, edges }` from a Figaro
forms snapshot (`{ root, forms, topology, arias }`):

- Allowlists only public role fields (`id`, `handle`, `role-name` / `name`,
  `parent`, `reports-to`, `charter`, `summary`, `owns`, `boundary`, `lifecycle`,
  `target_aria`), stripping `system.*`, `handoff` and private keys.
- Folds `routing-alias` forms and companion forms sharing a `target_aria` onto
  their primary standing seat (`foldAliases: true` by default), recording folded
  aliases on `role.aliases` and `role.owns`.
- Excludes inactive or unbound seats unless `includeInactive: true`.
- Resolves live occupant handles/mantras from `arias` and transient worker
  descendants via `@topology` (falling back to `aria.parent`), omitting
  retired/reaped and `SUCCEEDED:` predecessors by default.
- Generates declared `ui` and `deployment` handoff edges when `uiOwner` or
  `deploymentOwner` is supplied.

## Checks

```sh
node test/strati.test.js
```
