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

## Type

Two faces. Jacquard 24, the pixel gothic, sets the mark, panel titles and the
usage band's one headline figure. Alegreya sets everything else, with lining
tabular figures on numbers so columns hold. Mono stays for ids, model names
and log rows.

## Chrome

One accent rule, under the header. Panels carry a single hairline. A
`.z2-kpis` strip is divided by hairlines with no tile fill or edge: label,
value, then the note on its own line so it never truncates; `.warn` and `.bad`
colour the value only, and sparklines are muted ink. A pressed segment keeps
its fill under the pointer.

## Usage band (z2-usage.css, z2-usage.js)

`z2.usageBand(host, opts)` draws provider > plan > access path from figscope's
`GET /api/plans` and returns `update(data, recent)`, `fail(err)`, `detail(ref)`,
`fold(open, providers)` and `repaint()`.

Three depths, each folded until asked. On load the band is one row: the title,
one plan, its percent left on its binding window in the gothic, a meter and
when it resets, then "and N more...". That unfolds to one row per provider,
each with the same figure for its own leading plan. A provider row unfolds to
its plans and access paths. A pay as you go provider is a name and a request
count until opened.

Which plan leads (`opts.lead`): `current`, the default, is the plan the fleet
sent the most requests to in the last hour (from `recent`), falling back to the
busiest in the range; `range` ignores the last hour; `least` is the fresh plan
with the least left. A lozenge beside the figure says some other plan is
running low, and its tip names it.

Rows carry values, tips carry sentences: the reset's wall time, why a plan
leads, what a path last saw, windows that have a status and no percent. Every
figure in the band is percent left, and meters drain. Tone is the provider's
status (`allowed`, `allowed_warning`, `rejected`), never a threshold of ours,
plus hot at 10% left. A stale reading is a muted value and a dotted ring; the
age and the last status are in the ring's tip. Plan rows share one set of
columns, access lines another, and `update` reuses rows by key, so a refresh
moves nothing. The headline, provider headers and rows are focusable; Enter or
Space folds or calls `opts.onOpen(ref)`, arrows move between rows, and
`detail(ref)` returns the drill-down node for a drawer.

Seats: plans of one provider that share a name and an account are numbered in
the account chip ("kic · seat 2"), by the number their upstream ends in, or by
name order when it has none. Primary: `recent` is a second `/api/plans` answer
over the last hour; in each provider the plan whose access lines carried the
most requests gets the one filled `primary` chip. No requests in the hour, or
`recent` null, marks nothing; leaving `recent` out keeps the last answer.
`z2.usageSeats` and `z2.usagePrimary` are the two rules as pure functions.

`opts`: `title`, `planLabel(provider, plan)`, `onOpen(ref, node)`, `now()`,
`timeZone`, `emptyText`, `lead`, `open`.

Example: examples/usage.html (the 11-19 spain answer plus a second KIC seat,
a last-hour answer, and synthetic stale, unidentified and quiet rows). Browser
test: test/usage.test.py, with negative controls for tone, staleness, seats,
the primary marker, alignment, in-place refresh and the keyboard; checks.usage
runs it in Chromium. test/v2-usage.test.js covers the two rules in node.
