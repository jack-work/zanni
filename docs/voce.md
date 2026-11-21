---
name: voce
description: The per-message audio player. Read before changing how a spoken reply is scheduled, the jitter buffer, the player states, the replay scrubber, or before wiring a new page to live PCM.
---

# voce

One small player per chat message, with two ways to make sound.

- Live: raw PCM frames (24 kHz, 16-bit, mono, little-endian) arrive while the
  reply is still being written, and are scheduled through WebAudio as a queue
  of `AudioBufferSourceNode`s. No `MediaSource`, so it works on an iPhone.
- Replay: a plain `audio` element on the stored copy, with play, pause, a
  scrubber and elapsed / total.

Styles come from the `--z-*` tokens (gesso or v2). The scrubber is a native
range input laid over a `progress` element, so the fill needs no inline style.

## Use

```html
<link rel="stylesheet" href="voce.css">
<script src="voce.js"></script>
```

```js
const player = zanni.voce.create(document, {
  audioId: message.audio_id,              // '' when there is no stored copy yet
  src: (id) => 'audio/' + encodeURIComponent(id),
  status: (id) => fetch('audio/' + id, { headers: { Range: 'bytes=0-0' } }).then((r) => r.status),
});
bubble.appendChild(player.el);

player.start({ format: 'pcm', rate: 24000, bits: 16, channels: 1 });   // audio.start
player.push(arrayBuffer);                                              // each binary frame
player.end(audioId);                                                   // audio.end
player.fail();                                                         // speech error, no stored copy
```

`zanni.voce.unlock(window)` creates and resumes the one shared `AudioContext`.
Call it inside a tap handler (the voice toggle, send, the mic). A player's own
play button does it too. Until a gesture has unlocked the context, `start`
skips the live path and the reply is only offered as a replay.

Only one player sounds at a time: starting one pauses or stops the other.

## Live path

- The first frame starts 120 ms after it arrives (`JITTER`); each later frame
  starts where the one before ends. `place(next, now, duration, jitter)` is the
  whole rule.
- If the queue runs dry, the next frame buffers 120 ms again instead of being
  scheduled in the past. `stats().underruns` counts these.
- `end(audioId)` does not cut the sound. The queue drains, then the player
  becomes a replay player for `audioId`.
- A frame with an odd byte length is refused: the live stream stops (shifted
  samples are loud noise) and the stored copy is still offered after `end`.
- The context is asked for at 24 kHz so frames are not resampled one by one;
  a browser that refuses gets its default rate and resamples.
- voce does not touch `navigator.audioSession`. The page owns it (figaro web's
  audio session machine sets `playback`, or `play-and-record` while hands-free or
  the mic is on), so the ringer switch of an iPhone does not silence WebAudio.

## States

`data-state` on `.voce`, and `player.state()`:

| state | meaning | button |
|---|---|---|
| `none` | no audio yet | disabled |
| `live` | PCM is playing as it arrives | Stop |
| `draining` | `end` arrived, the queue is finishing | Stop |
| `muted` | a live stream is running but not played (stopped, locked or a bad frame) | disabled |
| `idle` | stored copy ready, at 0:00 | Play |
| `loading`, `playing`, `paused` | the stored copy | Pause, Pause, Play |
| `expired` | the stored copy answered 404 or 410: "audio expired" | disabled |
| `error` | the stored copy failed for another reason: "audio unavailable" | Play tries again |
| `lost` | the speech service failed mid-reply: "audio unavailable" | disabled |

`transition(state, event)` is the table, and it is pure.

## Sizes

`--voce-hit` is the tap target (44 px). `.voce-big` is the voice-ergonomics
size: 64 px button, thicker bar, larger thumb.

## Checks

`node test/voce.test.js` covers PCM decoding (odd lengths refused), the
schedule against a fake context and the state table. `test/figchat.test.py`
plays a spoken reply through the PCM path with `MediaSource` removed from the
window, listens for the signal on an analyser, and drives the scrubber.
