---
name: order-queues
description: The order site's live page of role forms and their queue.* work orders, a React and Jotai page over the figaro-forms door. Read before changing its rows, its route, its build, or before binding it to an edge.
---

# order queues

Read-only. One page lists every live role form from the `@arias` tree (name and
holder) and, under each, the `queue.*` entries of the work-orders contract as a
tree. It reads through figaro-forms' `AriaClient` over the same gateway door
figaro web uses, and holds no store of its own: `treeAtom` gives the roles,
`boundFormAtom` gives each role form, and everything else is derived from them.
It changes when the forms change.

## Rows

A role is a `kind: form` row in `@arias`; `roleName` is its name, `target` its
holder (the holder's handle in the tree, else its short id, else "vacant").
Its form's `queue` object holds one entry per ULID key. A row shows title, kind,
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

`web/src/order/`: `queue.ts` and `roles.ts` are pure, `state.ts` the atoms,
`rows.tsx`, `role-section.tsx`, `entry-sheet.tsx` and `app.tsx` the page,
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

`test/order-queue.test.ts` and `test/order-roles.test.ts` pin the pure code,
`test/order-app.test.tsx` the page, `test/order-door.test.ts` the fake door's
role forms. `parity/order-queues.spec.ts` drives the built page in a real
browser against the fake door (`examples/aria-mock.js` with `roles`) at 390 and
1280, under the kdev CSP, and fails on a console error or a CSP violation. The
fixture, `test/fixtures/order-queues.json`, is invented data in the shape of
the contract.
