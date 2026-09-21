---
name: checks
description: What zanni-check asserts and why each guard exists. Read before adding, weakening or deleting an assertion, or when a check fires on a page that looks correct.
---

# zanni-check

Asserts on the **built page as text**. That is the layer no other test covered
when the effect was lost.

## The regression that produced it

A dead-CSS sweep matched one rule per line. It ate the last line of boil's
eleven-selector list and the `body` rule after it. The effect vanished with no
error, and nobody noticed until a human said the shimmer was gone.

Two defences came out of it. The structural one is that boil is applied through
one-line classes, which a line-oriented sweep cannot half-eat. This file is the
other.

## Guard families

| family | asks |
|---|---|
| injected | the marker was replaced, the block is present |
| manifest | every class the manifest promises has a rule, and some element wears it |
| component | the recipe survived: filter regions, discrete stepping, no threshold on stage |
| driver | no SMIL on the default path, reduced motion honoured, seed written only on change |
| old bug | no selector list left dangling on a comma |

## The body witness

The original bug left `body` inside a selector list rather than deleting it, so
the witness is:

> if `body` appears in the stylesheet at all, it must appear as its own rule.

A page that never styles `body` skips the check. Asserting unconditionally was
wrong: it fired on any page whose styling comes entirely from zanni components,
including Jinja templates, which do not author a `body` rule of their own.

## Jinja and other templates

`zanni-inline` is text substitution on the marker, so `{% %}` and `{{ }}`
survive untouched, and `zanni-check` reads the template as text. Verified on a
Flask template carrying both.

One caveat: the checker sees the template, not the rendered page. A class
emitted only inside a `{% if %}` branch still satisfies "some element wears it",
because the text is present either way.

## What it cannot see

It reads text. It cannot tell you a rule lands on the right box.

`.phosphor-soft` was once written as a bare selector, which painted the host
instead of its overlay and turned a panel opaque. Every assertion passed. The
guard added afterwards asserts the **selector shape** that makes the mistake
impossible, because that is the part text can check.

Rendering is still the last check. Look at the picture.

## Worn

A component counts as used if an element carries one of its classes **or** the
stylesheet reads one of its custom properties.

The second case is not a loophole. `fontpack` and `gesso` both document
consumption through variables: take `--fontpack-mono` and dress your own
selectors. Asserting classes alone failed a page that used the component
exactly as written.

The guard still catches the case it was built for: a component injected,
defined, and referenced by nothing.

A component's own injected block is excluded from that search. `fontpack.css`
reads `var(--fontpack-display)` itself, so searching the whole document made the
guard a tautology: it passed for a component nothing else referenced. The
question is whether the **page** uses it, so only CSS outside the component's
own block counts.
