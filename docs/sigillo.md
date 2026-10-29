---
name: sigillo
description: The seal sheet: prints the lines a server wants signed, verbatim, shows their digest, and runs a WebAuthn passkey step-up over the server's challenge. Read before asking anyone to approve, sign or revoke something.
---

# sigillo

The seal. A modal sheet that shows exactly what is about to be signed and
signs it with a passkey.

```js
zanni.sigillo.open({
  title: 'You are about to sign',
  lines: review.receipt_lines,
  digest: review.digest,
  note: 'These lines come from spain, not from this page.',
  seal: function () {
    return zanni.sigillo.assert(review.publicKey).then(submit);
  },
  onclose: function (state) {}
});
```

## What is displayed is what is signed

- `lines` come from the server and are printed one per row with
  `textContent`, `white-space: pre-wrap`, in the order given. The sheet adds
  nothing and drops nothing. The server derives the challenge from those same
  lines, so a page that showed something else would get an assertion over
  something else.
- The sheet opens on the receipt, scrolled to its top, with focus on the
  receipt and not on the seal button, so Enter cannot sign unread lines.

## The step-up

`zanni.sigillo.assert(publicKey)` takes the server's options with base64url
strings (`challenge`, `allowCredentials[].id`), calls
`navigator.credentials.get` with `userVerification: 'required'` by default,
and returns the assertion as base64url JSON (`id`, `rawId`, `type`,
`response.clientDataJSON`, `authenticatorData`, `signature`, `userHandle`).
Each seal is a new assertion; nothing is cached.

## States

`data-state` on the dialog: `ready`, `asking` (buttons held, Escape ignored),
`sealed` (fires `sigillo:sealed`, closes), `failed` (the error in a
`role="alert"` line, the button reads "try again"). The page decides what a
failure means: a stale challenge wants a fresh review, not a retry.

While open, `<html>` carries `sigillo-open` (overflow hidden) and the dialog
contains its own overscroll, so a phone does not scroll the page behind it.

## Knobs

`--sigillo-ground`, `-paper`, `-ink`, `-muted`, `-line`, `-accent`,
`-on-accent`, `-edge`, `-fail`, `-ok`, `-scrim`, `-width`. Defaults are gesso's
`--z-*` tokens.
