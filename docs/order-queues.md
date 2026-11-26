---
name: order-queues
description: The order site's live page, the drawn tree of one central command's chartered roles with the queue forms and their queue.* work orders, a React and Jotai page over the figaro-forms door. Read before changing the tree, its rows, its route, its build, or before binding it to an edge.
---

# order queues

Read-only. The page draws one central command: the chartered roles that hang
from it, placed where the arias that hold them are actually drawn, with the
queue forms drawn under their roles and each form's `queue.*` entries of the
work-orders contract as a tree. It reads through figaro-forms' `AriaClient` over
the same gateway door figaro web uses, and holds no store of its own: `treeAtom`
gives the arias and the role rows, `boundFormAtom` gives `@topology`, each role
form and each queue form, and everything else is derived from them. It changes
when the forms change.

## The tree

The address names the central command: `#/<central form id>`. Without one the
page picks the chartered `central-command` that most roles name as their
`root`, and writes its id into the address. A short form id (`@96447061`) is
read as the long id the daemon lists.

A role form is chartered when it carries a `chartered` object: `seat`
(king, strategist, knight, lead, inspector, edge), `regiment`, `reports-to`
(the parent seat's form id), `root` (the central command's form id),
`central-command`, `succession-abdication`, `succession-ttl`, `studies` (the
queue forms it claims from) and, on the Inspector, `reviewer-max-children`. Role
forms without it are not shown. Seats whose `root` is another central command
are not shown. The fan-out limits are `system.fanout.min_children`,
`max_children` and `quota`.

Work orders do not live on role forms. A queue form carries `name`,
`queue-contract` and `chartered` `{kind: "queue-form", root, under}`, with the
`queue.*` entries on it. The page draws it under the role named by `under`, shows
its kinds and whether it is a priority map, and shows each role's `studies` as
links to the queue forms it claims from (a study it cannot find is named and
marked not visible). A queue form whose `under` role is vacant sits with that
role; one whose `under` role is not minted is listed on its own. A queue form
whose `root` is another central command is not shown.

The tree is the drawn tree, not the declared one:

1. Each aria's parent is its fork parent from `@arias`, overridden by the
   entry for it in `@topology` (`{id: drawn parent}`, `""` for the top).
2. A seat is a chartered role matched to the aria that holds it by the role's
   `target-aria`. Unchartered arias between two seats drop out; the seat hangs
   from its nearest chartered ancestor and says how many it skipped.
3. A seat shows its drawn child count against its fan-out limits: over `max`
   is flagged, under `min` is flagged short.
4. `reports-to` is only a flag. Where it differs from the drawn parent, the
   seat says "drawn under X, charter says Y".

A chartered seat of this command that is drawn outside it is listed under its
own heading, and a chartered role with no live holder is listed as vacant. A
seat the charter has declared but not minted has no form, so the page cannot
see it: `roles.json` lists those, and the browser does not read it. If
`@topology` cannot be read the page says so and draws from the forks alone.

## Rows

A role's name is its form's `role-name`, its holder the aria its `target-aria`
names (the holder's handle in the tree, else "holder not visible", else
"vacant"). The `@arias` role rows only list the form ids the page reads: nothing
else enumerates role and queue forms. A queue form's `queue` object holds one entry per ULID key. A row shows title, kind,
state with the age of `state_at`, owner, `claimed_by` (the holder's handle) and
its lease (live with time left, or lapsed and how long ago), priority,
`attention: owner`, the number of links and children. Children nest under
`parent`; an entry that names no parent but is listed in another entry's
`children` nests there; the lead's `children` order is kept, the rest sort by
priority (higher first) then id. A missing parent shows the entry at the top,
and a loop in the plan shows each entry once.

A click opens the entry in a `Sheet`: every contract field, the keys the
contract does not name, the amendments, and the `body` blob as a link only (the
page never fetches it). Links and the body are anchors only when they are http
or https; anything else is text. All values reach the page as text. The route is
`#/<role form id>/<entry id>`; an entry that has left the live queue says so.

## Source and build

`web/src/order/`: `queue.ts`, `roles.ts` and `charter.ts` (the chartered roles,
the drawn tree, the mismatch flag) are pure, `state.ts` the atoms, `rows.tsx`,
`role-section.tsx`, `queue-section.tsx`, `seats.tsx`, `entry-sheet.tsx` and
`app.tsx` the page,
`order.css` the skin (registro tokens, fontpack faces, system light or dark).
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

`test/order-queue.test.ts`, `test/order-roles.test.ts` and
`test/order-charter.test.ts` pin the pure code, `test/order-app.test.tsx` the
page, `test/order-door.test.ts` the fake door's role forms and `@topology`.
`parity/order-queues.spec.ts` drives the built page in a real browser against
the fake door (`examples/aria-mock.js` with `roles` and `topology`) at 390 and
1280, under the kdev CSP, and fails on a console error or a CSP violation. The
fixture, `test/fixtures/order-queues.json`, is invented data in the shape of
the contract: one central command, one `@topology` override, one seat whose
`reports-to` differs from where it is drawn, a seat drawn outside the command,
vacant seats, queue forms under a role, a vacant role and an unminted role, a
study that cannot be found, an unchartered role and a second central command.
