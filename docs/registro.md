# registro

The shared dashboard skin: band's data layout, figaro's gold and pixel mark in
chrome. Wear `data-theme="registro"` on html and `z2-shell` on body. Link, in
order, fontpack/fonts.css, v2/z2-tokens.css, v2/z2.css, proscenio/proscenio.css,
rotolo/rotolo.css and v2/z2-registro.css. All files are same-origin.

The scheme follows the reader's system unless the site supplies color-scheme
or data-scheme. No new cookie or per-page theme toggle is introduced.

## Scope navigation

Both apps render the same header. It is ordinary document navigation, not
ARIA tabs or an embedded app. Add further dashboards as links. Only the active
app sets aria-current="page". The edge owns authentication on every path.

```html
<header class="z2-scope" data-proscenio>
  <a data-slot="mark" href="/figscope/"><img class="z2-scope-mark" src="assets/zanni/parla/figaro-head.png" alt="">Scope</a>
  <nav data-slot="nav" aria-label="Dashboards">
    <a href="/figscope/" aria-current="page">figscope</a>
    <a href="/rou2/">rou2</a>
  </nav>
  <span data-slot="status">Daemon telemetry</span>
</header>
```

Load proscenio.js and attach it in the app's external script:
`zanni.proscenio.attach(document.querySelector('[data-proscenio]'))`.
Proscenio owns the narrow menu, Escape and focus return. Navigation remains
available through that menu below 900px; app filters are a separate concern.
A static header needs no new service. Each app vendors the same pinned files
under its own prefix; relative assets stay beneath that app. The canonical
links are /figscope/ and /rou2/ and the root redirects to /figscope/.

## Capacity evidence

A z2-panel can also wear z2-capacity. Inside z2-capacity-grid use three sections,
headed Provider reported, Observed headers and Local usage. Never fold these
into one remaining-balance number. z2-capacity-state takes data-state fresh,
stale, error or unavailable, with a visible label. z2-capacity-value takes
 data-available="false" for unknown values. Unknown is text, not zero. Every
remote value shows its source, fetch time, last success and reset time if known.
Local counts say whether their record is complete and never claim to be the
provider's balance. z2-capacity-account is monospace; numbers never use Jacquard.

Example: examples/registro.html. Browser test: test/registro.test.py, including
keyboard opening and closing of narrow navigation and a removed-stylesheet
negative control. checks.registro runs it in Chromium.

## Scope helpers (v2/z2-scope.js)

Link `v2/z2-scope.js` after `v2/z2.js` for thin-client Scope views:
- `z2.tokens(el)` and `z2.onSchemeChange(fn)`: read resolved `--z-*` tokens at
  paint time and re-render canvas or uPlot surfaces when scheme changes.
- `z2.uplotSync(cache, id, host, series, data, opts)`: updates uPlot via
  `setData` when series and width match rather than rebuilding DOM on each poll.
- `z2.waterfallSVG(rows, opts)` and `z2.meterSVG(percent, state, opts)`: pure
  SVG bars without inline style attributes so `style-src 'self'` stays strict.
- `z2.logList(host, opts)`: structured log stream with severity pills, wrapped
  messages, expandable `<dl>` attributes, delta `prepend` and cursor `append`.
- `z2.relTime(isoOrMs, nowMs)` and `z2.copyChip(command)`: relative horizon
  text and clipboard command chip.

## Usage band (z2-usage.css, z2-usage.js)

`z2.usageBand(host, opts)` draws provider > plan > access path from figscope's
`GET /api/plans` and returns `update(data, recent)`, `fail(err)`, `detail(ref)`
and `repaint()`. A provider with a plan window or a named plan is a block; pay
as you go providers are one quiet line each. A plan row leads with its binding
window; its other metered windows stack under it on the same columns, each
with its own reset, so every meter and percent in the band shares one edge.
Windows with a status and no percent sit as a quiet note at the row's end.
Tone is the provider's status (`allowed`, `allowed_warning`, `rejected`), never
a threshold of ours. A stale window is muted, shows its age and fades in three
steps (under an hour, under a day, older). Access lines share fixed number
columns, so they align and a refresh does not move them. `update` reuses rows
by key. Rows and blocks are focusable; Enter or Space calls
`opts.onOpen(ref)`, arrows move between rows, and `detail(ref)` returns the
drill-down node for a drawer.

Seats: plans of one provider that share a name and an account are numbered in
the account chip ("kic · seat 2"), by the number their upstream ends in, or by
name order when it has none. Primary: `recent` is a second `/api/plans` answer
over the last hour; in each provider the plan whose access lines carried the
most requests gets the one filled `primary` chip. No requests in the hour, or
`recent` null, marks nothing; leaving `recent` out keeps the last answer.
`z2.usageSeats` and `z2.usagePrimary` are the two rules as pure functions.

`opts`: `title`, `planLabel(provider, plan)`, `onOpen(ref, node)`, `now()`,
`timeZone`, `emptyText`.

Example: examples/usage.html (the 11-19 spain answer plus a second KIC seat,
a last-hour answer, and synthetic stale, unidentified and quiet rows). Browser
test: test/usage.test.py, with negative controls for tone, staleness, seats,
the primary marker, alignment, in-place refresh and the keyboard; checks.usage
runs it in Chromium. test/v2-usage.test.js covers the two rules in node.
