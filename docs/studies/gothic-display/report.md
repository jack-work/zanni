# Gothic display face for the Scope cockpit

Recommendation: Jacquard 12, set at 21px for panel titles. Fallback: Not Jam Blackletter 13, set at 13px.

Open `specimen.html` (self-contained, fonts embedded) for the rendered comparison. `specimen-glance.png` is its first screen; `pixel-zoom-j24-j12-nj13.png` is the same title at 4x nearest-neighbour: Jacquard 24 at 19px, Jacquard 12 at 21px, Not Jam 13 at 13px.

## What is wrong with Jacquard 24 at title size

Jacquard 24 is drawn on a grid of 43 cells per em (30 units of a 1290 unit em). To land one cell on one CSS pixel it needs a 43px font-size. At the cockpit's 19px title it puts 0.44 of a pixel in each cell, at the 26px mark 0.60, so every vertical and horizontal edge falls between pixels and gets anti-aliased: 54% of the inked pixels in a 19px title are partial grey, and the e counter closes outright. The letterforms are fine; the grid is too fine for the size. A more readable face in the same style is therefore mostly a coarser grid that the size can honour.

Jacquard 12 is the same design on 21 cells per em. At 21px one cell is exactly 1px (0% soft edges), the x-height is still 8 rows (what Jacquard 24 shows at 19 to 20px), and the counters stay open.

## Shortlist

| face | designer | licence | grid (cells/em) | crisp sizes | woff2 | verdict |
|---|---|---|---|---|---|---|
| Jacquard 12 | Sarah Cadigan-Fried | OFL 1.1 | 21 | 21, 42px | 28 KB full | recommended |
| Not Jam Blackletter 13 | Not Jam | CC0 1.0 | 13 | 13, 26px | 5 KB | fallback |
| Jacquarda Bastarda 9 | Sarah Cadigan-Fried | OFL 1.1 | 13 | 13, 26px | 21 KB full | good for the mark, light for titles |
| Not Jam Blackletter 16 | Not Jam | CC0 1.0 | 16 | 16, 32px | 7 KB | flatter than NJ13, better coverage |
| Old English Gothic Pixel | ColorSwitchFan25 | OFL 1.1 (name table, FontStruct) | 20 | 20, 40px | 4 KB | no slash or colon, hobby build |
| Pixelcastle | Leonhard Katschner | OFL 1.1 with Reserved Font Name | 50 | none under 50px | 12 KB | rejected |

Jacquard 24 (current): 43 cells per em, crisp only at 43px.

Licence checks: Jacquard faces and Jacquarda Bastarda 9 are in google/fonts under `ofl/` with `license: "OFL"` in METADATA.pb and an OFL.txt (copyright "The Soft Type Project Authors", no Reserved Font Name, so subsetting is allowed). The OFL text for Jacquard 12 is identical to the `OFL-jacquard24.txt` the fontpack already carries. Not Jam Blackletter 13 and 16 ship in one zip with the CC0 1.0 legal text; the itch.io page lists "Creative Commons Zero v1.0 Universal". Pixelcastle ships `OFL.txt` with Reserved Font Name "Pixelcastle" and the zip already contains a woff2. Old English Gothic Pixel carries "Open Font License" in its name table and on its FontStruct licence page, but the font is a 2018 FontStruct build whose own description says lowercase and other characters were still being added.

Self-hosting: every file above is served from the repo as a woff2 (the three TTF/OTF sources were converted with fontTools, no glyph changes). Nothing in the specimen touches a CDN.

Considered and left out: Pixel Monastery Script (GitHub repo has no licence file, and its grid is 30 rows high, finer than Jacquard 24); PixelFraktur and Berlin Fraktur Pixel (personal use only); Gothic Pixel (Sparkletastic), GothicPixels and Pixel Gothic (aggregator pages claim free use but show no licence text, so not verifiable as permissive; not fetched); Cursed Gothika and a Sleek 16x24 blackletter on itch.io (listings not opened; the second is discounted, so paid); the Charted variants of Jacquard 12 and Jacquarda Bastarda 9 (made for knitting charts; not examined); Grenze Gotisch, Pirata One, UnifrakturCook, Texturina (OFL blackletters, but smooth outlines, not pixel faces).

## Analysis

### Grid and proportions

| face | cells per em | rows: x / asc / cap / desc | asc/x | x/em | px per cell at 16 | 19 | 20 | 26 | 28 |
|---|---|---|---|---|---|---|---|---|---|
| Jacquard 24 | 43 | 17 / 25 / 25 / 6 | 1.47 | 0.40 | 0.37 | 0.44 | 0.47 | 0.60 | 0.65 |
| Jacquard 12 | 21 | 8 / 12 / 12 / 3 | 1.50 | 0.38 | 0.76 | 0.90 | 0.95 | 1.24 | 1.33 |
| Jacquarda Bastarda 9 | 13 | 6 / 9 / 10 / 3 | 1.50 | 0.46 | 1.23 | 1.46 | 1.54 | 2.00 | 2.15 |
| Not Jam Blackletter 13 | 13 | 8 / 10 / 10 / 3 | 1.25 | 0.61 | 1.23 | 1.46 | 1.54 | 2.00 | 2.15 |
| Not Jam Blackletter 16 | 16 | 7 / 9 / 9 / 4 | 1.29 | 0.44 | 1.00 | 1.19 | 1.25 | 1.62 | 1.75 |
| Old English Gothic Pixel | 20 | 10 / 15 / 15 / 5 | 1.50 | 0.50 | 0.80 | 0.95 | 1.00 | 1.30 | 1.40 |
| Pixelcastle | 50 | 26 / 40 / 40 / 10 | 1.54 | 0.52 | 0.32 | 0.38 | 0.40 | 0.52 | 0.56 |

CSS pixels per font cell at each size. 1.00 or 2.00 is a crisp grid; anything below 1 is sub-pixel and every edge is anti-aliased. On a 2x display double the figure.

Pixel snapping decides most of the difference. Five faces have a 1.00 size at or just under the 16 to 20px band: Jacquard 12 (21px), Not Jam 16 (16px), Old English Gothic Pixel (20px), Not Jam 13 and Jacquarda Bastarda 9 (both 13px). On a 2x display each CSS pixel is two device pixels, so the cell sizes double: Jacquard 24 at 19px is 0.88 device pixels per cell (40% soft edges at 38 device px), Jacquard 12 at 21px is 2.00 (crisp). Jacquard 12 at the old 19px token would be 0.90 and gains nothing, so the face change only works together with the size change.

### Rendered at the cockpit sizes (1x) and snapped

| face | 19px x / cap | soft edges | counters e a o | 26px x / cap | soft edges | counters e a o | snapped title size: x / cap, soft, counters |
|---|---|---|---|---|---|---|---|
| Jacquard 24 | 8 / 12 | 54% | -ao | 10 / 15 | 48% | -ao | 19px: 8 / 12, 54%, -ao (current) |
| Jacquard 12 | 7 / 11 | 53% | -ao | 10 / 15 | 48% | -ao | 21px: 8 / 12, 0%, eao |
| Jacquarda Bastarda 9 | 9 / 15 | 68% | --- | 12 / 20 | 0% | eao | 13px: 6 / 10, 0%, eao |
| Not Jam Blackletter 13 | 12 / 15 | 47% | -ao | 16 / 20 | 20% | eao | 13px: 8 / 10, 27%, eao |
| Not Jam Blackletter 16 | 8 / 10 | 50% | ea- | 12 / 15 | 46% | -a- | 16px: 7 / 9, 0%, eao |
| Old English Gothic Pixel | 9 / 14 | 58% | eao | 13 / 19 | 51% | -a- | 20px: 10 / 15, 0%, eao |
| Pixelcastle | 10 / 15 | 54% | e-- | 14 / 21 | 38% | -ao | none |

Headless Chromium, device pixel ratio 1. Soft edges: share of inked pixels that are neither solid nor empty. A dash in the counters column means that counter has closed (no enclosed background pixel at 50% coverage).

x-height: at the snapped size Jacquard 12 matches Jacquard 24's visual size (8 rows, caps 12), Not Jam 13 matches the x-height (8 rows) with caps 10, Not Jam 16 is smaller (7 rows, caps 9), Jacquarda Bastarda 9 at 13px is smaller again (6 rows) and only reaches 12 rows at 26px. Ascenders sit 1.5 times the x-height in the Jacquards, Bastarda and Old English, 1.25 to 1.29 in the Not Jam pair, so those lean on letter shape and spacing rather than word shape.

Counter openness: at 19px Jacquard 24 and Jacquard 12 both lose the e counter and keep a and o as one pixel wide slits. On their own grids the counters are 5x4 (Jacquard 24 at 43px, not a usable size), 2x2 e and 2x5 a (Jacquard 12 at 21px), 2x1 e and 2x4 a (Bastarda at 13px), 2x3 e and 3x4 o (Not Jam 13 at 13px). Jacquard 12 is the smallest step that keeps the e open at a normal title size.

### Letter distinctness

| face | size | c/e | n/u | n/r | f/s | t/l | i/l | I/L | S/E | lowest |
|---|---|---|---|---|---|---|---|---|---|---|
| Jacquard 24 | 19 | 0.21 | 0.10 | 0.48 | 1.03 | 0.31 | 0.31 | 0.92 | 0.76 | 0.10 |
| Jacquard 12 | 21 | 0.19 | 0.20 | 0.41 | 1.10 | 0.30 | 0.28 | 0.84 | 0.84 | 0.19 |
| Jacquarda Bastarda 9 | 13 | 0.21 | 0.44 | 0.50 | 1.29 | 0.67 | 0.80 | 1.00 | 0.50 | 0.21 |
| Not Jam Blackletter 13 | 13 | 0.40 | 0.55 | 0.40 | 0.78 | 0.34 | 0.44 | 0.80 | 0.84 | 0.34 |
| Not Jam Blackletter 16 | 16 | 0.40 | 0.55 | 0.40 | 0.78 | 0.34 | 0.44 | 0.80 | 0.84 | 0.34 |
| Old English Gothic Pixel | 20 | 0.22 | 0.33 | 0.51 | 1.05 | 0.36 | 0.33 | 0.26 | 0.43 | 0.22 |
| Pixelcastle | 19 | 0.48 | 0.38 | 0.61 | 1.23 | 0.23 | 0.47 | 1.16 | 0.75 | 0.23 |
| EB Garamond | 20 | 0.35 | 0.42 | 0.49 | 1.03 | 0.69 | 0.42 | 0.20 | 0.92 | 0.20 |

Normalised pixel difference between two glyphs rendered at that size, best horizontal alignment: 0 is identical, 1 is no overlap. Higher is easier to tell apart. It barely moves with size, so it measures the design. EB Garamond row for scale.

c/e, n/u, f/s: Jacquard 24 is the weakest, with n/u almost identical (0.10), the usual textura minim problem. Jacquard 12 doubles that to 0.20 and c/e to 0.19; it is still the tightest of the shortlist after Jacquard 24. Not Jam 13 and 16 are the most distinct (c/e 0.40, n/u 0.55, lowest pair 0.34), Bastarda has the best t/l and i/l of all (0.67, 0.80) and n/u of 0.44, but c/e only 0.21. Scores barely change with size, so they describe the drawings.

### Weight against the body face

| face | ink per x-band pixel | x EB Garamond | stem / x-height at native size |
|---|---|---|---|
| Jacquard 24 | 0.42 | 1.40 | 4/17 = 0.24 |
| Jacquard 12 | 0.41 | 1.38 | 2/8 = 0.25 |
| Jacquarda Bastarda 9 | 0.30 | 1.01 | 1/6 = 0.17 |
| Not Jam Blackletter 13 | 0.41 | 1.36 | 2/8 = 0.25 |
| Not Jam Blackletter 16 | 0.42 | 1.40 | 2/7 = 0.29 |
| Old English Gothic Pixel | 0.42 | 1.41 | 2/10 = 0.20 |
| Pixelcastle | 0.40 | 1.34 | 6/26 = 0.23 |
| EB Garamond (body) | 0.30 | 1.00 | 2/12 = 0.17 (at 28px) |

Mean alpha over the x-height band of the eight titles. Display faces sit 1.3 to 1.4 times heavier than Garamond body; Jacquarda Bastarda 9 is the only one that matches it.

Jacquard 12, Jacquard 24 and the Not Jam pair are 1.3 to 1.4 times the ink of EB Garamond in the x-height band, with stems a quarter of the x-height against Garamond's 0.17. That is the right direction for a display face and unchanged by the switch to Jacquard 12. Jacquarda Bastarda 9 is the only one at body weight, which is why it reads as lighter and more script-like beside the other blackletters.

### Coverage

| face | A-Z a-z | 0-9 | ASCII punct (of 32) | accented Latin (of 60) | typographic (of 16) | cockpit title chars missing | codepoints | woff2 as shipped |
|---|---|---|---|---|---|---|---|---|
| Jacquard 24 | 52/52 | 10/10 | 32/32 | 60/60 | 11/16 | none | 331 | 34 KB |
| Jacquard 12 | 52/52 | 10/10 | 32/32 | 60/60 | 11/16 | none | 331 | 28 KB |
| Jacquarda Bastarda 9 | 52/52 | 10/10 | 32/32 | 60/60 | 11/16 | none | 331 | 21 KB |
| Not Jam Blackletter 13 | 52/52 | 10/10 | 32/32 | 1/60 | 3/16 | none | 122 | 4 KB |
| Not Jam Blackletter 16 | 52/52 | 10/10 | 32/32 | 60/60 | 4/16 | none | 308 | 6 KB |
| Old English Gothic Pixel | 52/52 | 10/10 | 17/32 | 0/60 | 4/16 | /:· | 84 | 3 KB |
| Pixelcastle | 52/52 | 0/10 | 2/32 | 6/60 | 0/16 | #$%()+-./0123456789:· | 65 | 11 KB |

Cockpit set: the eight titles plus digits and . % $ : , - ( ) # + / and the arrow. Jacquard 24 as shipped in the fontpack is a subset (218 glyphs); the full font is 331 codepoints.

Jacquard 12 and Bastarda have the same 331 codepoints as Jacquard 24 (the fontpack ships a 218 glyph subset of Jacquard 24; subset Jacquard 12 the same way). Not Jam 13 is ASCII plus the sharp s, so any accented name falls back to Garamond. Not Jam 16 covers Latin-1 and Latin Extended-A. Old English Gothic Pixel lacks `/` and `:` (the "Tokens / s" title) and draws the hyphen as a long dash. Pixelcastle has no digits and no hyphen.

Not Jam 13 has one rendering quirk: its 13px grid sits in a 1024 unit em, so advances are rounded and a long run drifts about 0.008px per glyph. In the specimen that shows as 27% soft edges against 0% for the other snapped faces, mostly late in the longer titles.

## Recommendation

Jacquard 12 at 21px. It is the same hand Gluck asked to keep, on a grid the title size can honour, so the gain is crispness and an open e rather than a new personality. It keeps full coverage, the same OFL text, and is 28 KB unsubsetted.

To adopt it in the cockpit (not done here, the fontpack is untouched):

- add `jacquard-12.woff2`, subset like `jacquard-24.woff2`, and an `@font-face` for "Jacquard 12";
- panel titles move from `--z-fs-lg` (19px) to 21px for the display face; the z2 panel default of 22px would want 21px too, or 42px if a title ever needs to be large;
- the 26px mark has no crisp Jacquard 12 size between 21 and 42: either use 21px (x-height 8 rows against 10 now) or accept a soft 26 to 28px, which is still 0.9 to 1.3 px per cell against 0.6 today.

Fallback: Not Jam Blackletter 13 at 13px, if Jacquard 12 is not enough of a step. Its x-height equals Jacquard 24's, every lowercase pair is clearly distinct, it is CC0 and 5 KB. The price is a heavier, chunkier hand with wide spacing, no accented glyphs, and the drift quirk above. If the mark wants a lighter, more ornate cut, Jacquarda Bastarda 9 at 26px is the one to look at in the specimen.

## Method and limits

Metrics come from headless Chromium at device pixel ratio 1, drawing glyphs and the eight titles to a canvas and counting pixels; Chromium's text rasteriser on other platforms and DPRs will differ in detail, which is why the doubled-cell figures are given separately. The pair distances and counter checks are proxies, not reader tests. Pixel grids and coverage come from the font files with fontTools. EB Garamond in the comparisons is the fontpack's file.

Rerun: `python3 static_facts.py` (fontTools), `node measure.mjs`, `python3 build.py` (writes `specimen.html` and `tables.md`), `node shot.mjs file://$PWD/specimen.html out.png 1400 [selector] [dpr]`.
