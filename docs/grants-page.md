---
name: grants-page
description: The approval page for grants.kelliher.info, built from licenza, clessidra and sigillo: the API it calls, the CSP it runs under, the package the grants service serves, and the fixture backend it is tested against. Read before changing the page or the service's HTTP surface.
---

# The grants page

Source: `examples/grants/`. Package: `nix build .#grants-page`. Test:
`checks.grants` (`test/grants.test.py` against `test/grants_fixture.py`, with
Chrome's virtual authenticator).

## Routes the service serves

| path | serves |
|---|---|
| `/r/<request id>` | `index.html`: the request, then its principal's live grants and pending requests |
| `/p/<principal id>` | `index.html`: the principal's page alone |
| `/grants.js`, `/grants.css`, `/assets/...` | the package's files as they are |

The herald link is `/r/<request id>`. No query string carries anything.

## The API the page calls

All JSON, same origin, credentials from the Authelia session. Errors are
`{ "error": "<text a person can read>" }`; the page prints `error` as text.

`GET /api/requests/<rid>`

```json
{ "id": "r-7f3a19", "state": "pending",
  "principal": { "id": "sandbox:box0@grants", "kind": "sandbox", "edge_name": "box0" },
  "note": "requester's words, plain text, at most 280 characters",
  "items": [{ "id": "i-1", "type": "keel", "resource": "keel:repo/juglar", "path": "refs/heads/box0/*",
              "actions": ["push"], "summary": "Push branches to juglar", "why": "requester's words",
              "max_duration_s": 604800 }],
  "suggested": [{ "id": "s-1", "widens": "i-1", "type": "...", "resource": "...", "path": "...",
                  "actions": ["create", "delete"], "summary": "...", "why": "the model's reason",
                  "max_duration_s": 604800 }] }
```

`state` is `pending`, `decided` or `expired`. A suggestion with `widens` shows
as a checkbox under that item's yes; one without shows in "suggested".

`GET /api/principals/<pid>`

```json
{ "principal": { "id": "...", "kind": "...", "edge_name": "..." },
  "live": [{ "id": "g-1", "type": "...", "resource": "...", "path": "...", "actions": ["read"],
             "summary": "...", "remaining_s": 1620, "total_s": 3600 }],
  "pending": [{ "id": "r-80c2", "items": 1, "age_s": 240 }],
  "limit": { "open_max": 3 } }
```

`remaining_s` is counted on spain's clock; the dial runs it down locally.

`POST /api/requests/<rid>/review`

```json
{ "items": [{ "item_id": "i-1", "verdict": "yes", "duration_s": 3600, "actions": ["push"] },
            { "item_id": "i-3", "verdict": "no", "duration_s": null, "actions": ["send", "draft"] }],
  "extra": [{ "suggestion_id": "s-1", "verdict": "yes", "duration_s": 3600 }] }
```

Every requested item exactly once. `actions` may only narrow the stored
actions; `duration_s` is one of 900, 3600, 86400, 604800 and at most the
item's cap; `extra` names only stored suggestions. Anything else is a 400.
The answer:

```json
{ "review_id": "v-...", "receipt_lines": ["request    r-7f3a19", "..."],
  "digest": "1f62 8827 dde9 0c51", "expires_in_s": 60,
  "publicKey": { "challenge": "<base64url>", "rpId": "grants.kelliher.info", "timeout": 60000,
                 "userVerification": "required", "allowCredentials": [{ "type": "public-key", "id": "<base64url>" }] } }
```

`receipt_lines` must carry every payload field: request id, principal, and
per item its id, verdict, type, resource, path, actions and `expires_at`, then
`issued_at` and the nonce. The challenge is the SHA-256 of those lines joined
by `\n`, so the lines on the sheet are the bytes the passkey signs over.
`digest` is the first 16 hex digits of that hash, in fours.

`POST /api/grants/<gid>/revoke` returns the same shape, over a revoke payload
(grant id, principal, type, resource, path, actions, `ends_at`, `issued_at`,
nonce).

`POST /api/reviews/<review_id>/seal` takes the assertion as
`zanni.sigillo.assert` returns it and answers `{ "sealed_at", "review_id" }`.
`410` means the review is spent or older than 60 s; the page says so and asks
for a fresh review. `409` means the request was decided meanwhile.

## CSP

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self';
connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'
```

`font-src 'self'` is needed for fontpack's self-hosted faces; without it
`default-src 'none'` blocks them. The page has no inline script, no inline
style and no style attribute; the dial sets custom properties through the
CSSOM, which CSP allows. The package build fails on `innerHTML`,
`outerHTML`, `insertAdjacentHTML` or `document.write` in any script, and on
inline script or style in `index.html`.

## The fixture backend

`python3 test/grants_fixture.py 8765`, then `http://localhost:8765/r/r-7f3a19`.
It follows the contract above from memory, refuses widening, unanswered
items, foreign suggestions, stale reviews and assertions over another
challenge or origin. It does not verify signatures: that is the service's job
and El Inspector's review. A real browser needs a passkey for RP ID
`localhost`; Chrome's DevTools WebAuthn panel gives one.
