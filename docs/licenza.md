---
name: licenza
description: The "can I do this?" card: one requested permission with its actions, resource and path, the requester's reason as quoted speech, one row of answers (no, or a length), narrowing by action and widening by suggestion. Read before building any approval or consent UI.
---

# licenza

The licence, as in leave to do a thing. One card per requested permission.

```js
var card = zanni.licenza.create({
  item: { id, summary, type, resource, path, actions, why, max_duration_s },
  says: 'box0 says',
  widen: [{ id, summary, actions, path }],
  suggested: false
});
list.appendChild(card.el);
card.state();   // { item_id, added, answered, verdict, duration_s, actions, widen }
```

Every change fires `licenza:change` (bubbling) with the same state.

## The answer row

One `radiogroup`: **no**, then the lengths (`15m 1h 1d 1w` by default, or
`opts.lengths`), cut at the item's `max_duration_s`. A length is the yes; there
is no separate yes button to forget to pair with a length. Nothing is chosen at
first, and `answered` stays false until something is, so a page can hold its
submit shut. Arrow keys move the choice, Tab leaves the group.

## Narrow, never widen

- With more than one action, each is a toggle (`aria-pressed`); a struck-out
  action is left out of the yes. The last one cannot be removed.
- Widening is not free-form. It is a list of suggestions the server made
  (`widen`), each a checkbox that appears only under a yes. The page sends
  their ids; the server builds the grant from its own copy.
- `suggested: true` makes a card for a suggestion that stands alone: dashed,
  with an "add to this answer" button, and no answer row until added.

## Text is text

Every string, the requester's reason included, goes in with `textContent`.
The reason is labelled by `says` ("box0 says"), set in the mono face, so the
requester's words never read as the page's.

## Knobs

`--licenza-ground`, `-ink`, `-muted`, `-line`, `-yes`, `-no`, `-loud` (actions
in `opts.loud`, default admin, delete, send and write), `-focus`,
`-on-verdict`, `-prose`, `-mono`. Defaults are gesso's `--z-*` tokens.
