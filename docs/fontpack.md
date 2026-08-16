# fontpack

Three faces, three jobs. The voice is the assignment, not the fonts.

| face | job | notes |
|---|---|---|
| **Jacquard 24** | display, numerals, drop caps | pixel blackletter, **one weight (400)**. Ask for bold and the browser synthesises one, which smears the pixel grid. |
| **EB Garamond** | prose, act names in italic | the humane register |
| **VT323** | everything technical: commands, labels, chips, timestamps | CRT terminal face. **Never below ~13px CSS.** It is bitmap-derived and disintegrates. |

```html
<h1 class="fontpack-display">John Kelliher</h1>
<p  class="fontpack-prose">…</p>
<div class="fontpack-mono">senior software engineer</div>
```

Or take the variables and dress your own selectors: `--fontpack-display`,
`--fontpack-prose`, `--fontpack-mono`.

**The rule that makes three fonts read as one voice:** each face owns a job and
no element borrows another's. Display type is not body copy set larger; a
technical label does not get set in Garamond because it looked nicer that once.

## Delivery

`fontpack.head.html` is injected into `</head>` — a stylesheet link belongs in
the head, and the two `preconnect` hints are worthless if they arrive after the
request they were meant to warm. One request fetches all three families, with
`display=swap` so the page is readable before the webfont lands.

It talks to Google Fonts, exactly as figar.org does. To self-host instead, drop
`fontpack.head.html` from the component's `files` and serve the same three
families yourself: nothing else in fontpack refers to the CDN.

## What it costs

One cross-origin stylesheet plus three font files, and a FOUT rather than a
FOIT. The `max(13px, 1em)` floor on `.fontpack-mono` is the only defensive
declaration in the component, and it is there because that failure looks like a
rendering bug rather than a type mistake.
