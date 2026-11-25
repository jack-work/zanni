# sitenav

The estate's header: the k mark and the three places a signed-in person goes,
Account, Files and Figaro. The rule under the bar is the gold of the k
(gesso's `--gold` in light, `--gold-bright` in dark), so the bar and the mark
read as one piece in both schemes.

## Markup

`assets/sitenav/sitenav.html` is the partial; paste it or render it from a
template. Mark the current site's link with `aria-current="page"` and it gains
the gold underline. The links are absolute, so the partial is the same on every
host; it carries no script and no inline style, so it works under a policy of
`style-src 'self'` with `sitenav.css` served as a file.

## Knobs

| property | default | what |
|---|---|---|
| `--sitenav-rule` | the k's gold | the bar's bottom rule, the mark and the current link's underline |
| `--sitenav-ground` | `--z-ground-2` | the bar |
| `--sitenav-ink` | `--z-ink` | the words |
| `--sitenav-height` | 52px | the bar's least height |

Needs gesso for the tokens and fontpack for the faces. Below 420px the mark and
links tighten so all three links stay in one row at 390px.
