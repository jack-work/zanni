# order queues

Read-only. The page is a graph of one central command: its chartered role
forms, the arias that hold them, their queue forms and the forks drawn under
each seat, joined by the relations the forms declare. A click on a node shows
what it is, who it talks to and, for a queue form, its `queue.*` work orders
of the work-orders contract as a tree. It reads through figaro-forms'
`AriaClient` over the same gateway door figaro web uses, and holds no store of
its own: `treeAtom` gives the arias, `boundFormAtom` gives `@arias-global`,
`@topology`, each role form and each queue form, and everything else is derived
from them. It changes when the forms change.

## Which forms it reads

One function, `enumerateForms` in `enumerate.ts`, says which form ids the page
reads: the live role rows of `@arias`, then every row of kind `form` in
`@arias-global`, found by walking `arias.<id>` and each `.forks` below it. A row
is `{id, state: "form", kind: "form", name, target, active_at, recency}`; a
queue form or a vacant seat carries no `target`. The page reads each form by the
id the row names (a short id is read as the long one the tree knows, and a short
id resolves only among forms the caller may read, so rows carry full ids). When
`@arias-global` cannot be read the page says so and draws the roles `@arias`
lists. The listing is held as a stable list of ids and a three-valued state
(`pending`, `listed`, `unreadable`), because `@arias-global` carries every
aria's counters and changes constantly; the view waits for it to settle. When
`@arias` itself lists every form, `listedForms` is the one thing to remove.

## The graph

The address names the central command: `#/<central form id>`, then a node,
then an entry: `#/<central>/<node>/<entry>`, with `?view=command` after it for
the folded view. A node is any form id or aria id of the graph, short form ids
included; an entry is a work order of the queue form the node names. Without a
central command the page picks the chartered `central-command` that most roles
name as their `root`, and writes its id into the address.

A role form is chartered when it carries a `chartered` object: `seat`
(king, strategist, knight, lead, inspector, edge), `regiment`, `reports-to`
(the parent seat's form id), `root` (the central command's form id),
`central-command`, `succession-abdication`, `succession-ttl`, `studies` (the
queue forms it claims from) and, on the Inspector, `reviewer-max-children`. Role
forms without it are not shown. Seats whose `root` is another central command
are not shown. The fan-out limits are `system.fanout.min_children`,
`max_children` and `quota`. A queue form carries `name`, `queue-contract` and
`chartered` `{kind: "queue-form", root, under}`, with the `queue.*` entries on
it.

Nodes:

- a role form, `@<role name>`, one per chartered role, held or vacant;
- an aria, one per chartered seat that has a live holder, named for its first
  role and by its holder's handle;
- a queue form, under the role named by its `under`; one whose role is not
  minted stands alone;
- forks, one per seat that has live arias drawn under it that are not seats,
  with their count against the seat's fan-out maximum.

Edges, each with a switch in the toolbar:

- under: the drawn tree. An aria's parent is its fork parent from `@arias`,
  overridden by its entry in `@topology` (`{id: drawn parent}`), and a seat
  hangs from its nearest chartered ancestor. A seat that is drawn outside the
  command has no under edge and is flagged.
- form under: a role form under the role form its `reports-to` names, and a
  queue form under its role.
- target: a role form to the aria its `target-aria` names.
- study: from a queue form to the aria that holds a role whose `studies` names
  it. A study the page cannot find is named in the side panel, not drawn.
- lease: from a queue form to the claimant of its open work orders
  (`claimed_by`), counted, with the lapsed leases named.
- flow: from the poster of open work orders (`requested_by`) to the queue form,
  counted.

An actor named by an aria that is not a seat is drawn as the forks under its
nearest seat; one the tree cannot place is found through its role name. Work
orders in state `done` or `cancelled` draw no lease or flow edge. The old
mockup's handoff relation has no source in the forms and is not drawn.

`reports-to` is only a flag. Where it differs from the drawn parent, the role
form says "drawn under X, charter says Y". A seat the charter has declared but
not minted has no form, so the page cannot see it. If `@topology` cannot be read
the page says so and draws from the forks alone.

The central command view keeps the central command and the seats drawn directly
under it, folds everything deeper into the seat that holds it and sums the
relations it had.

## Layout

`graph-layout.ts` places the nodes the way the mockup does, in tiers: a seat is
a row of role forms above a row holding its forks, its aria and its queue
forms, and child seats sit in the next tier, packed as a tidy tree. The
mockup's Graphviz routing is `graph-route.ts`: each arrow goes by a visibility
graph over the boxes padded by 12 pixels, with its corners rounded, spread
along a side when several share it, and labelled where no box is in the way. A
vacant seat or a seat drawn outside the command hangs under the seat its
`reports-to` names.

## Rows

A queue form's `queue` object holds one entry per ULID key. A row shows title,
kind, state with the age of `state_at`, owner, `claimed_by` (the holder's
handle) and its lease (live with time left, or lapsed and how long ago),
priority, `attention: owner`, the number of links and children. Children nest
under `parent`; an entry that names no parent but is listed in another entry's
`children` nests there; the lead's `children` order is kept, the rest sort by
priority (higher first) then `state_at` then id. A missing parent shows the
entry at the top, and a loop in the plan shows each entry once.

A click opens the entry in a `Sheet`: every contract field, the keys the
contract does not name, the amendments, and the `body` blob as a link only (the
page never fetches it). Links and the body are anchors only when they are http
or https; anything else is text. All values reach the page as text. An entry
that has left the live queue says so.

## Source and build

`web/src/order/`: `queue.ts`, `roles.ts`, `charter.ts` (the chartered roles,
the drawn tree, the mismatch flag), `enumerate.ts`, `derive.ts` (the reads and
the view as functions of plain values), `graph.ts` (nodes, edges, the command
view), `graph-layout.ts` and `graph-route.ts` (tiers and arrows) are pure;
`state.ts` holds the atoms; `graph-page.tsx`, `graph-view.tsx`, `graph-side.tsx`,
`queue-detail.tsx`, `rows.tsx`, `entry-sheet.tsx` and `app.tsx` are the page;
`order.css` is the skin (registro tokens and fontpack faces for the page, the
mockup's palette scoped to the graph panel).
`web/order/index.html` is the entry; `web/vite.order.config.ts` builds it.

```sh
cd web
npm run build:order    # web/dist-order: index.html and assets/
ORDER_DOOR=http://127.0.0.1:8099 npx vite -c vite.order.config.ts   # dev server, /rpc proxied
```

The output is `index.html` plus hashed files under `assets/`, with no inline
script or style and no `data:` fonts, so the kdev CSP holds. Serve the directory
as the host's root. The page dials `rpc` relative to itself (`wss://<host>/rpc`
for a page at `/`), so the host needs that route to the gateway, with the edge
adding `X-Figaro-Edge` and refusing service principals, as for figaro web's
`/chat/rpc`.

## Tests

`test/order-queue.test.ts`, `test/order-roles.test.ts`,
`test/order-charter.test.ts`, `test/order-enumerate.test.ts` and
`test/order-graph.test.ts` pin the pure code. `test/order-layout.test.ts` is
`order-graph-check.py` made a test: no sample of an edge lies inside a box it
does not join, on the fixture's full and command views and on sixty random
graphs, with no two boxes overlapping and every edge starting and ending on its
boxes, and the checks shown to fail on a sabotaged layout. `test/order-app.test.tsx`
pins the page and `test/order-door.test.ts` the fake door's role forms and
`@topology`.
`parity/order-graph.spec.ts` drives the built page in a real browser against
the fake door (`examples/aria-mock.js` with `roles`, `topology`, `global` and
`listed`) at 390 and 1280, under the kdev CSP, fails on a console error or a CSP
violation, and measures the rendered paths against the rendered boxes. The
fixtures, `test/fixtures/order-queues.json` and `test/fixtures/arias-global.json`,
are invented data in the shape of the contract and of the listing: one central
command, one `@topology` override, one seat whose `reports-to` differs from where
it is drawn, a seat drawn outside the command, vacant seats, queue forms under a
role, a vacant role and an unminted role, a study that cannot be found, an
unchartered role and a second central command.

A check against the live forms needs no fixture: `web/test/live/snapshot.sh`
writes `@arias-global`, `@topology` and every listed form through the local
figaro CLI to `/var/tmp/order-live/snapshot.json` (mode 600, never in the
repository), and `ORDER_LIVE_SNAPSHOT=/var/tmp/order-live/snapshot.json npx
vitest run test/order-live.test.ts` runs the page's derivation over it and
asserts that every chartered seat and queue form of the central command is a
node. Without the variable the test is skipped.
