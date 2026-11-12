---
name: dashboards
description: The dashboard component set, figscope first and keel second. Read before building a dashboard component, moving figscope or keel onto zanni, or deciding where a chart, table or scrollbar belongs.
---

# Dashboards

Gluck, 11-11: zannify the dashboards. Every dashboard component moves into
zanni, figscope (scope.kelliher.info) wears them first, and keel follows.

## One layer, not a third

zanni already has two layers: v1 (gesso, fontpack, boil and the rest, frozen
for figar.org and the personal sites) and v2 (`assets/v2`, `z2-*`: one token
source, a contrast law in `bin/z2-build --check`, and panel, KPI tiles, data
table and sparkline). The dashboard set is v2. It extends `z2.css` and `z2.js`
and adds nothing beside them, except where a piece serves v1 sites too
(scrollbars).

figscope wears `data-theme="band"` and follows the reader's scheme, as keel
does. The boil stays off: a dashboard repaints on every tick.

## What figscope has today, and where each piece goes

| figscope today | zanni piece | status |
|---|---|---|
| browser-default scrollbars | **rotolo**: thin themed bars on the page and every scroll box, Firefox and Chromium | new, slice 1 (scrollbars lane) |
| sticky header: brand, range buttons, five filter selects, live, status | **proscenio** for the bar. New in z2: **`z2-seg`** (segmented range picker, one `aria-pressed`), **`z2-field`** (a labelled select or input at 16px), **`z2-live`** (a toggle with a pulse dot), status in proscenio's `status` slot | proscenio exists; seg, field and live are new |
| KPI strip | **`z2-kpis`** | exists |
| panels in an auto-fill grid, some `wide` | **`z2-panel`**, plus **`z2-grid`** (auto-fill at a minimum track, `.wide` spans every column) and a caption under the heading | panel exists; grid and caption are new |
| uPlot time series: lines, bars, a drag-select band | **`z2.uplot`**: an adapter that returns uPlot options (axes, grid, series colours from `--z-series-*`, fonts, the select band) read from the tokens at draw time and again on a scheme change; **`.z2-chart`** sizes the host and styles uPlot's legend | new. uPlot stays: it is 45KB, fast at 10k points, and self-hosted. The Vega theme serves Vega consumers; figscope does not need Vega |
| legend swatches | **`z2-legend`**: swatch, label, optional value; clicking toggles a series | new |
| distribution and RPC tables, turns and logs in scroll boxes, clickable rows | **`z2-table`** plus `.z2-scroll` with a max height, **`.z2-click`** rows that open on Enter as well as click, and `.ok` / `.warn` / `.bad` cells from the tokens | table exists; the rest is new |
| the TTFT-by-layer canvas: one stacked bar per turn | **`z2.stack`**: a canvas of stacked columns drawn from tokens, hit testing for click and hover, a flag with the column's breakdown; redraws on resize and on scheme change | new |
| the turn waterfall in the drawer: label, track, segments, ticks, value | **`z2.waterfall`**: rows built with DOM (no canvas, so it is selectable and searchable), segments placed by percent, ticks for marks, the value at the end of each row; collapses the label column under a narrow container | new |
| the right drawer with a close button | **proscenio's right drawer** (`data-side="right"`): focus, Escape, scrim and focus return already exist there | exists |
| a command with a copy button | **`z2-copy`**: a code chip and a button that copies its text and says so | new |

## Rules every piece keeps

- Colours only from `--z-*`, sizes only from `--z-fs-*` and `--z-space-*`;
  `bin/z2-build --check` stays green in both schemes and both themes.
- Components answer their container, never the viewport.
- No `innerHTML`, no inline style or script: figscope's CSP is `style-src
  'self'` with no `unsafe-inline`. Consumers serve zanni's files from their own
  origin and link them. Nothing is inlined into a dashboard.
- Every input and select at 16px or larger; 44px targets on touch.
- Each piece gets an example in `examples/v2.html` and a browser test with a
  negative control (break the piece, see the test fail).

## Slices, in order

1. **rotolo** (scrollbars lane, 81983fcd). It replaces gesso's scrollbar block,
   so there is one implementation. figscope links it.
2. **figscope onto v2 tokens**: `z2-tokens.css` and `z2.css` linked, the page
   on `z2-shell`, panels, `z2-grid` and KPI tiles. No layout changes beyond
   the look.
3. **The header**: proscenio with `z2-seg`, `z2-field` and `z2-live`.
4. **Charts**: `z2.uplot` and `z2-legend` across the twelve chart panels.
5. **Tables and the drawer**: `.z2-click`, scroll boxes, state cells, proscenio's
   right drawer, `z2-copy`.
6. **The waterfalls**: `z2.stack` for the overview and `z2.waterfall` in the
   drawer.
7. **keel**: through El Taller, after figscope has run a week. keel wears
   gesso today; it moves to v2 tokens and picks up the same table, panel and
   scrollbar pieces.

Each slice is a zanni tag plus a figscope commit, deployed through El Aduanero.
A slice that changes nothing Gluck can see is not finished.

## Questions for Gluck

1. figscope in **band** (the readable, data-dense theme) or **figaro** (the
   parchment and gold look of v1)? The note assumes band.
2. Dark only, or follow the reader's scheme? The note assumes it follows,
   like keel.
3. Should the dashboard header keep the five filters inline on a wide
   screen, or fold them into a filter drawer at every width?
