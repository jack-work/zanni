# placet

The owner approvals page: a phone-first single page that lists requests filed
against figaro forms, shows the exact patch each would apply (current against
new, with its hash), and sends Approve or Deny. Named for the formula of
assent, "it pleases". It runs as the admin with POST power, so its rules are
about what it will not do.

## Laws

- Every server string (names, verbs, keys, values, reason, raw text, refusal,
  error, admin name) enters the page through one function that appends text
  nodes. No innerHTML, insertAdjacentHTML, outerHTML, document.write, eval, no
  inline script, inline style or handler. `test/placet.test.js` scans for the
  sinks and `test/placet.test.py` swaps that one function for an HTML sink and
  requires the hostile-text check to fire.
- Control, bidi and zero-width characters are not obeyed. They are replaced by a
  boxed `U+202E` style label, so a value cannot reorder or hide its own text.
- The patch is never paraphrased. One operation per line, in the server's order,
  with the current value struck and the new value in full ink. The "adds / removes"
  and "4 to 8" lines are extra, under the exact text.
- Approve echoes exactly the `hash`, `version` and `token` of the request it
  rendered. If the patch, reason, refusal or expiry of the open request changes,
  the page shows the new patch, raises an alert and keeps Approve disabled until
  the reader presses "I have read the new patch". A version or token bump with the
  same patch is carried silently.
- No decision while the connection is down. Stale rows are greyed and show how
  long ago they were seen.
- A refused request (`refusal`) can only be denied. A request that is already
  applied says so.

## Use

```html
<div id="app" data-api="/api/v1" data-mark="figaro-head.png"></div>
<script src="placet.js"></script>
<script>placet.mount(document.getElementById('app'))</script>
```

`placet.mount(host, opts)` takes `base` (default `data-api`, else `/api/v1`),
`poll` (ms, default 3000, backs off to 15 s when failing or hidden), `fetch`,
`now` and `mark`. It returns `{ refresh, state, detach }`. Routes are hashes:
`#/` is the list, `#/r/<filing>/<id>` a request, so the host needs no fallback
route and the Authelia round trip lands back on the same address.

API (figaro approvals serve, branch lane/approvals-api):

- `GET /api/v1/requests` returns `{ requests: [Req], admin }`.
- `POST /api/v1/requests/{filing}/{id}/approve` or `/deny`, JSON body
  `{ hash, version, token }`. 200 `{result}`, 409 `{result, error}`, 403 stale or
  forged token, 415 not JSON.
- `Req` is `{ filing, id, verb, target, reason, expires, state, refusal?, hash,
  version, token, applied, at_succession, raw?, lines: [{ op, key, current?, new? }] }`.
  Optional `filer_name` and `target_name` replace the ids in the sentence when the
  backend can resolve them.

## Shipping

`bin/placet-bundle OUT` writes a flat directory for the backend's `--spa-dir`:
`index.html`, `boot.js`, `placet.js`, `placet.css`, `z2-tokens.css`, `rotolo.css`,
`fonts.css`, `fonts/eb-garamond.woff2`, `fonts/eb-garamond-italic.woff2`,
`fonts/jacquard-24.woff2`, `figaro-head.png` and
a `SHA256SUMS` over all of them, so a reviewer reads exactly what is served. No
external URL, no source map, no build step beyond a copy. CSP that fits:
`script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:;
connect-src 'self'; form-action 'none'`.

The theme is registro (keel palette: oxblood in light, gold in dark), EB Garamond
for text and every number, Jacquard only on the mark.

## Checks

```sh
node test/placet.test.js
python3 test/placet.test.py examples/placet.html
```

The browser test drives the mock in `examples/placet-mock.js`: order, states,
exact patch, one POST with the rendered hash, version and token, a bumped
version, a changed patch, a vanished request, offline and recovery, 403, 409 and
415 answers, hostile text in every field, no sideways scroll at 320 px, contrast
in both schemes, a sabotage run, and the real bundle served with the CSP above.
