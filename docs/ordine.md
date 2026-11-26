# Ordine

Read-only command chart, ownership list and inspector. The host supplies one
authorized public projection. Ordine has no socket, credential store, routing
policy or runtime registry. It cannot create, bind, arrange or retire a role.

## Use

A marker page inlines `gesso`, `fontpack`, `rotolo`, `registro`, `strati` and
`ordine`, wears `data-theme="registro"` and `class="rotolo"` on the root, and
names a host. `examples/order-site/index.html` is that page, with no script,
style or handler of its own; `packages.order-site` builds it.

```html
<main data-ordine="hierarchy" data-ordine-drift="drift" data-ordine-title="Order"
      data-ordine-ui-owner="@flypaper-atlas" data-ordine-interval="30000"></main>
```

`ordine.auto(document)` runs when the script loads: every `[data-ordine]` host
is mounted and bound with `ordine.feed`. The attribute value is the hierarchy
URL. `data-ordine-drift`, `-root`, `-ui-owner`, `-deployment-owner`,
`-interval`, `-title` and `-heading` are optional.

A host that owns its own transport mounts by hand:

```js
const order = ordine.mount(document.getElementById('order'), { title: 'Order' });
order.update({ status: 'resyncing' });
order.update({ status: 'current', model: publicOrder, observedAt });
```

`mount` returns `update`, `select(id)`, `expand(id)`, `show('map' | 'owners')`
and `detach()`. `ordine.fromForms(snapshot, options)` derives a clean
`publicOrder` from Figaro forms, `@topology` and `arias`, folding routing
aliases and companion forms onto their primary seat and stripping `system.*`
and `handoff` keys.

`status` accepts `loading`, `resyncing`, `stale`, `unavailable`, `empty`, `denied`,
`signedout` and `current`. Only `current` renders data. Every other state clears
the chart, detail text, search and expansion immediately. `empty` means the
server confirmed no owned orders, not a failed request. An unchanged model on a
later `current` update repaints nothing but the observed time, so a poll does
not disturb focus, an open tooltip or an open lead.

On logout or principal change, destroy the old transport and projection caches,
then detach the view. An open connection alone never justifies `current`.

## Binding to the hierarchy projection

`ordine.feed(view, options)` binds a mounted view to figaro-forms'
`GET /hierarchy` (branch fix/authorized-refresh, README "Hierarchy
projection"). The host serves that endpoint same-origin, behind its own login,
and the server reads the hierarchy with the caller's authority. The browser
never holds a bridge token and never selects keys.

```js
const view = ordine.mount(document.getElementById('order'));
const feed = ordine.feed(view, {
  url: 'hierarchy',
  uiOwner: '@flypaper-atlas',
  deploymentOwner: '@frosting-pushup',
  interval: 30000
});
```

Replies map onto view states: `200 current` renders the selected order through
`ordine.fromForms`; `200 empty`, or a `current` reply with no orders, shows
"No owned orders"; 401, 403 and 503 show signed out, denied and unavailable;
any other status, a malformed body or a network failure shows unavailable.
Only `current` carries nodes.

`refresh()` drops to resyncing with no nodes before it asks. Interval polls
keep the current tree until their reply arrives, and any refusal or failure
then withdraws it. A reply from an older request is ignored, so a late success
never restores a withdrawn tree. `select(root)` switches between the orders a
caller can see, `roots()` lists them, `withdraw()` clears the view on logout
and `close()` stops polling. `uiOwner` and `deploymentOwner` name the declared
handoff targets until the flake supplies communication rules; a
`communications` option passes those rules through unchanged.

## Public model

```js
const publicOrder = {
  root: 'visible-root-id',
  roles: [
    { id: 'visible-root-id', title: 'Command', manager: null },
    { id: 'lead-id', title: 'Systems', manager: 'visible-root-id',
      lanes: [{ name: 'keel', handle: 'fleet.lane.backend.keel' }] }
  ],
  workers: [{ id: 'aria-id', title: 'handle', manager: 'lead-id', summary: 'mantra', lifecycle: 'active' }],
  communications: []
};
```

Role IDs are exact stable identities supplied by the host, not display names.
`manager` is an authorized visible hierarchy link. The projection supplies one
visible root per order and omits hidden endpoints.

Optional role fields are `summary`, `charter` (plain text; `**Heading:**`
lines, `- ` lists and backticks are laid out, nothing else is interpreted),
`owns`, `boundary`, `kind`, `lifecycle`, `occupant.handle`, `occupant.mantra`
and `lanes`. A lane is a name and a captains-log handle on its lead. It is
never a role and never a card on the overview. `fromForms` reads lanes from the
role form's `lanes` key and orders siblings by title.

`workers` are live arias under a role or under another worker. A worker whose
`lifecycle` is `dormant` is counted as resting and not drawn. All text reaches
the page through `textContent`.

Each communication declaration has `from`, `to`, `kind` (`ui` or `deployment`)
and an optional `label`. Both endpoints must be visible roles. The Handoffs
tool draws the selected role's outgoing declarations, off by default. A drawn
handoff neither grants access nor claims that a message occurred.

Unknown or invalid hierarchy, workers, lanes or endpoints fail closed with an
unavailable view. This input validation is not an authorization layer.

## Layout

`ordine.layout(model, { expanded })` is pure and deterministic. It is the
composition the owner approved on 2026-11-15 (figaro bb76aea, archived in
captains-log `2026/11/15/order-ui-accepted/`), generalized:

- The root card sits top centre. Its direct reports stand on a three-column
  grid of 200 by 118 cards, 230 apart across and 196 down, in model order.
  One bus at y 178 feeds a gutter trunk left of each column; a stub leaves the
  trunk above each card and drops into its top.
- With no lead open the grid is centred under the root.
- With a lead open, that lead takes the 224-wide slot on the left inside a
  tinted region, and the others close ranks on the grid to the right, exactly
  the approved sheet. The root does not move.
- Inside the region: standing staff as two columns of 160 by 118 cards under a
  shared bus, as approved; then lanes and live forks as rows on a rail that
  turns off the lead's trunk. A fork of a fork is inset under its parent.
- Strokes of one owner are merged before drawing, so nothing is drawn twice,
  and junction dots mark only real branches.

`layout` returns `nodes` (`kind` is `root`, `lead`, `staff`, `lane` or `fork`),
`edges`, merged `segments`, `junctions`, `groups` with their caption box,
`labels` and the sheet size. Given the archived eleven-position model it
returns the archived coordinates, edges, segments and junctions.
`ordine.members(model, id)` lists a role's staff, lanes, live forks and resting
forks.

## View

Clicking a lead selects it and opens it; clicking the root, Close or Escape
returns the overview. The foot of a lead card toggles its region without
losing the selection. Leads that move slide, new rows fade in, 190 ms,
transform and opacity only, and not at all under `prefers-reduced-motion`.
The zoom is fitted to the overview and held while a lead is open; the panel
grows downward instead of shrinking the type.

The inspector shows the selected role's charter, holder, lanes with handles,
live forks, drift and declared handoffs. Who owns what is the phone default:
one tile per role, and the selected tile carries the inspector inline. Find
matches titles, charters, lane names and handles, fork handles and mantras;
Enter selects a single match.

The page wears the Scope registro: its tokens, buttons, segments, fields and
`z2.tips` tooltips (`data-tip-text`), cards on `--z-ground-2` with an accent
top edge, a gesso ground and rotolo scrollbars, light and dark. Type is
fontpack's three faces and no other: Jacquard 24 for names and titles, Source
Serif 4 for prose, VT323 for handles, states and labels. Ordine overrides
registro's text face inside its host and in the tooltips it raises.

`examples/ordine.html` is synthetic and has no backend connection.

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
node test/ordine-feed.test.js
node test/ordine-drift.test.js
nix build .#checks.x86_64-linux.strati .#checks.x86_64-linux.order-site
```

`ordine.test.js` pins the approved coordinates, then checks the six-role shape
and 160 random orders with every lead opened: no node overlap, no command
stroke through a node or drawn twice, no crossing between owners, each region
holding only its own lead and items, and closing returning the same overview.
`checks.order-site` builds the page through `zanni-inline` and `zanni-check`
and refuses an authored page with inline script, style or handlers.
