# scriba

Markdown into the page. Named for the copyist: it transcribes, it does not
compose.

```html
<!-- zanni:scriba -->
<div data-scriba>**Bring** a coat: https://weather.gov</div>
```

```js
zanni.scriba.render(el, event.description);   // text in, rendered block out
zanni.scriba.toHTML(markdown);                // the string, if you want it
```

Anything carrying `data-scriba` is rendered from its own `textContent` at
load. That is the safe default: the text was already in the document as text,
so nothing new is trusted.

## What it renders

| markdown | out |
|---|---|
| `**bold**` `__bold__` | `<b>` |
| `*it*` `_it_` | `<i>` |
| `~~gone~~` | `<s>` |
| `` `code` `` | `<code>` |
| ```` ```lang ```` fence | `<pre><code class="language-lang">` |
| `# Head` | `<h3>` through `<h6>` |
| `- a` / `1. a` | `<ul>` / `<ol>` |
| `[text](url)` | `<a>` |
| a bare `https://…` | `<a>` |
| one newline | `<br>` |
| a blank line | a new `<p>` |
| `---` | `<hr>` |

Newlines are preserved, because the thing being rendered is usually something
a person typed into a box.

## The laws

**Stash code, escape everything, then mark up.** In that order. Code is pulled
out first so no inline rule can reach inside it, the whole document is escaped
next, and only then does markup happen. Marking up before escaping is how a
`<script>` survives, and the order is asserted by `zanni-check`.

**An href must be on the allowlist.** `http:`, `https:`, `mailto:`, or a
relative path. Everything else is dropped and the link text is kept as plain
text, because a link that does nothing when clicked is a worse lie than no
link at all.

**One `innerHTML`.** The library writes to the DOM in exactly one place.
`zanni-check` counts them: every additional one is another thing to audit.

**Links get `rel="noopener noreferrer"`.**

## Lineage, and the one place this port is stricter

This is a deliberate port of `gluck-herald`'s `internal/md`, not a second
design. That package renders the same subset to Telegram HTML, and the
ordering above is its ordering.

`test/scriba.test.js` carries herald's own Go test corpus, case for case, so
that a divergence in the shared logic is visible rather than silent. Two
implementations of one algorithm is a real risk; a shared corpus is what makes
the risk detectable.

Where the two deliberately differ:

| | herald | scriba | why |
|---|---|---|---|
| heading | `<b>` | `<h3>`…`<h6>` | Telegram has no headings |
| bullets | `• ` and a newline | `<ul><li>` | a browser has lists |
| href scheme | passed through | allowlisted | **Telegram will not execute an href. A browser will.** |
| `2 * 3 * 4` | italics, wrongly | plain text | see below |

**A defect found in the parent by porting it.** herald's italic rule is
`[*_]([^*_\n]+)[*_]`, which does not require the delimiter to hug its text, so
`2 * 3 * 4` renders as `2 <i> 3 </i> 4`. scriba requires `\S` at both ends.
herald has the same bug and it has not been fixed there.

## Knobs

| property | default | what it does |
|---|---|---|
| `--scriba-code-bg` | `rgba(43, 26, 21, 0.07)` | the tint behind code |

Type comes from `fontpack` when it is present and falls back to a system
serif when it is not. Links take `--gold`.

## What it is not

Not a parser. There is no nesting, no tables, no reference links, no inline
HTML. It is a renderer for a details pane, and the block layer is deliberately
one pass over blank-line-separated chunks.

Incremental rendering, for streaming text, is not here yet. The seam for it is
`blocks()`: it is already chunk-at-a-time, and the stash is already keyed by
index.
