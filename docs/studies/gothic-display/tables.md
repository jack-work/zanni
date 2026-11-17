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