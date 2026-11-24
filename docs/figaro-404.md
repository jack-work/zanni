# figaro-404

`pages/figaro-404.html` is the page the edge serves, with status 404, to a
signed-in visitor who reaches a page they may not see. Figaro says one of the
eighteen remarks in `assets/parla/not-here.json`, picked at random on load; a tap
on the bubble moves to the next. The bubble floats as every parla bubble does.

## The contract with the edge

The same bytes answer every denied path on every gated host, so the page names
no path, site, user, account or owner, and asks for nothing: CSS, the three
fonts and the Figaro head are inline, the fonts cut to the characters the page
can show. It carries exactly one `<style>` and one `<script>`, no `style=`
attribute, no `on*=` handler, and nothing but `data:` URIs, so the edge can
build its policy from the two blocks' hashes; `img-src` and `font-src` must
allow `data:`. Go back hides itself when the tab has no history to return to. Serve it with `Cache-Control:
no-store` and no cookies.

## Building

`bin/zanni-404` writes it from `gesso.css`, `parla.css`, the fontpack faces,
`figaro-head.png` and `not-here.json`; it needs Python with fontTools and
brotli. The output is deterministic and committed. `checks.figaro-404` rebuilds
it and fails on any difference, on a second style or script block, a style or
handler attribute, a reference that is not `data:`, a host or a name, a request
in Chromium, or a tap that does not move to the next remark.
