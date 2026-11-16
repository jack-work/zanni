# Ordine

Read-only command graph and ownership cards. The host supplies one authorized
public projection. Ordine has no socket, credential store, routing policy or
runtime registry. It cannot create, bind, arrange or retire a role.

## Use

Load `assets/ordine/ordine.css` and `assets/ordine/ordine.js`, together with
`gesso` and `fontpack`. They can also be injected with `zanni-inline` using the
manifest marker. Call `ordine.mount(element)` once, then call `update` when the
host's authorized projection changes. `detach()` removes the view and listeners.

```js
const order = ordine.mount(document.getElementById('order'));
order.update({ status: 'resyncing' });
order.update({ status: 'current', model: publicOrder });
```

`status` accepts `loading`, `resyncing`, `stale`, `unavailable`, `empty`, `denied`,
`signedout` and `current`. Only `current` renders data. Every other state clears
the graph, detail text, search and transient expansion immediately. `empty`
means the server confirmed no owned orders, not a failed request. The host
retains its login/challenge and denied/not-found behavior.

On logout or principal change, destroy the old transport and projection caches,
then detach the view. An open connection alone never justifies `current`.
Wait for the current generation's authorized seed and freshness contract.

## Public model

```js
const publicOrder = {
  root: 'visible-root-id',
  expandedTeam: 'visible-team-id',
  roles: [
    { id: 'visible-root-id', title: 'Command', manager: null },
    { id: 'visible-team-id', title: 'Systems', manager: 'visible-root-id' }
  ],
  workers: [],
  communications: []
};
```

Role IDs are exact stable identities supplied by the host, not display names.
`manager` is an authorized visible hierarchy link. The projection supplies one
visible root per order. It must omit hidden endpoints rather than making the
browser reconstruct hidden ancestry. Multiple authorized orders are selected
by the host, not joined through an invented supervisor.

Optional role fields are `summary`, `owns` (string array), `boundary`, `charter`
(string), declared `kind`, declared `lifecycle`, and independently visible
`occupant.handle` / `occupant.mantra`. Text is rendered with `textContent`.
The component renders no arbitrary HTML or links. Project links and metrics are
not part of this slice. An optional `observedAt` on the update state is displayed
as source text, not calculated into a freshness or authorization claim.

`workers` uses the same card fields. Its `manager` links identify actual visible
transient descendants, including nested workers. Managed roles remain the compact
overview. Selecting an owner offers a separate transient-tree expansion below
the overview only if visible live descendants exist. Prospective task lists do
not become worker nodes or counts. Lifecycle filtering is the server's job.

Each communication declaration has `from`, `to`, `kind` (`ui` or `deployment`)
and an optional text `label`. Both endpoints must be visible standing roles.
Selecting a role shows its outgoing declarations, with arrowheads at the target.
UI edges are dotted; deployment edges use a long/short dash. Detail text states
the exact direction. Ordine does not choose a UI or deployment owner. The flake
rules must explicitly route those handoffs to the intended roles. Drawing an
edge neither grants access nor claims that a message occurred.

Unknown or invalid hierarchy/endpoints fail closed with an unavailable view.
This input validation is not an authorization layer. Selecting public keys in
browser JavaScript is not an authorized projection.

## Layout and visual treatment

The accepted eleven-position composition is retained for its original shape:
a root, one two-person standing team on the left and direct officers on a
three-column grid to the right. IDs, names and operational assignments are not
baked into the component. More direct officers extend the grid downwards.
When the authorized managed hierarchy has a different shape or deeper tiers,
the component uses a measured tree rather than discarding or reparenting nodes.
Transient expansion uses that same tree separately, so opening actual forks
does not turn the accepted overview into a registry dump.

Hierarchy segments merge only within the same supervisor's branch. Handoffs
route orthogonally around node boxes and preserve their target direction.
Their crossings do not create hierarchy junctions.

Gesso supplies the ground and semantic colors. Jacquard is reserved for the
visible root and inspector heading, EB Garamond for readable card text, VT323
for technical labels at a 14px floor before canvas zoom. Compact graph cards
retain the accepted dimensions; selecting one exposes its complete text in
the inspector. The ownership view is unscaled and is the mobile default.
There is no second header, theme toggle, player or site navigation in Ordine.

`examples/ordine.html` is explicitly synthetic. Its role labels are not Spain's
formation and it has no backend connection. The archived accepted review stays
in captains-log as historical provenance; it is not a live fallback registry.

## Order capability boundary

The order site belongs in the flake. It must combine the caller-filtered
`@topology` presentation overrides with authorized role/node listings and
visible declared fields. `@topology` is not a complete organization tree.
Desired Nix declarations do not override current role forms in the browser.
Communication rules come separately from the flake, not from hierarchy or
observed traffic.

The server must enforce the authenticated caller/root policy and emit an
explicit allowlist before data reaches the browser. Exclude `system.*`, handoff,
comments, studies, prompts, private notes, environment, account data and raw
role snapshots. Suppress hidden endpoint IDs, labels and counts. A scoped raw
forms client is not by itself a public projection endpoint.

The generic figaro-forms refresh candidate is `d6056cd41c54c988a1277665f6e8149c23b736a5`
on `fix/authorized-refresh`. Its source contract is recorded in the Engineer's
`order-forms-projection.md` handoff. This component does not claim that candidate,
a public projection backend or order.kelliher.info has been deployed. Hostname,
authentication and deployment retain their separate Spain authorization.

## Checks

```sh
node test/ordine.test.js
python3 test/ordine.browser.py examples/ordine.html
```

The pure check retains the approved overview coordinates and checks directional
handoff routing around nodes. The browser check covers selection, nested forks
and clearing retained data during resync/denial, including a mobile ownership
view. Neither is authenticated production acceptance.
