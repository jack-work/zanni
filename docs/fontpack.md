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

The faces are self-hosted. No page that wears fontpack talks to a font CDN,
and `zanni-check` fails a page that does.

| consumer | how | cost |
|---|---|---|
| `zanni-inline` page | `fontpack.gen.js` writes one `<style>` of `@font-face` rules at the marker, each `src` a `data:font/woff2;base64,…` URI. Works where the app serves one document and nothing else, and under a CSP whose `font-src` allows `data:` | about 160 KB of base64 for all three faces in every page load; the browser cannot cache it apart from the page |
| a site that serves files | copy `fonts/` and `fonts.css` beside the page and link `fonts.css`. It names the files relatively (`fonts/eb-garamond.woff2`) | 122 KB once, then cached |

`--set fontpack.faces=prose,mono` inlines only those faces (`display`,
`prose`, `mono`). A page with no display type saves Jacquard's 35 KB. The
class rules in `fontpack.css` still name all three families. A face that is
not declared falls back to the next font in its variable.

The files are the latin subsets Google Fonts serves, under the SIL Open Font
License (`fonts/OFL-*.txt`). `fonts.css` is generated: `node fontpack.gen.js >
fonts.css`, and a flake check fails when it is stale.

## What it costs

Inline: the page grows by the base64 above. Served: three same-origin font
files. Either way `font-display: swap`, a FOUT rather than a FOIT. The `max(13px, 1em)` floor on `.fontpack-mono` is the only defensive
declaration in the component, and it is there because that failure looks like a
rendering bug rather than a type mistake.
