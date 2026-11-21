'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const voce = require('../assets/voce/voce.js');

const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-9, why + ': ' + a + ' is not ' + b);

const le = new Uint8Array([0x00, 0x80, 0xff, 0x7f, 0x00, 0x00, 0x00, 0x40]);
assert.deepEqual(Array.from(voce.decodePCM(le.buffer)), [-1, 32767 / 32768, 0, 0.5], 'signed 16-bit little-endian, scaled to -1..1');
const padded = new Uint8Array([9, 9, 9, 0x00, 0x40, 0x00, 0xc0, 9]);
assert.deepEqual(Array.from(voce.decodePCM(padded.subarray(3, 7))), [0.5, -0.5], 'a view decodes its own bytes, not the buffer under it');
assert.equal(voce.decodePCM(new ArrayBuffer(0)).length, 0);
assert.throws(() => voce.decodePCM(new Uint8Array(4095).buffer), RangeError, 'an odd byte length is refused, never rounded');
assert.throws(() => voce.decodePCM(new Uint8Array(1)), RangeError);

let slot = voce.place(0, 5, 0.085, 0.12);
near(slot.at, 5.12, 'the first chunk starts one jitter buffer after it arrives');
near(slot.next, 5.205, 'and books its own length');
assert.equal(slot.late, true);
slot = voce.place(5.205, 5.01, 0.085, 0.12);
near(slot.at, 5.205, 'a chunk that arrives in time butts against the one before');
assert.equal(slot.late, false);
slot = voce.place(5.29, 5.4, 0.085, 0.12);
near(slot.at, 5.52, 'after an underrun playback buffers again instead of starting in the past');
assert.equal(slot.late, true);

function fakeContext() {
  const ctx = {
    currentTime: 0,
    started: [],
    createBuffer(channels, length, rate) {
      const data = new Float32Array(length);
      return { length, sampleRate: rate, numberOfChannels: channels, duration: length / rate, getChannelData: () => data };
    },
    createBufferSource() {
      const heard = {};
      const src = {
        buffer: null,
        connect(node) { src.to = node; },
        start(at) { src.at = at; ctx.started.push(src); },
        stop() { src.stopped = true; },
        addEventListener(name, fn) { heard[name] = fn; },
        finish() { heard.ended(); }
      };
      return src;
    }
  };
  return ctx;
}

const chunk = new Uint8Array(4096).buffer;
const chunkSeconds = 2048 / 24000;
{
  const ctx = fakeContext();
  const out = { name: 'out' };
  let drained = 0;
  const q = voce.queue(ctx, out, { drained: () => { drained++; } });
  ctx.currentTime = 10;
  q.push(chunk);
  ctx.currentTime = 10.01;
  q.push(chunk);
  ctx.currentTime = 10.02;
  q.push(chunk);
  near(ctx.started[0].at, 10.12, 'starts on the first chunk, 120 ms out');
  near(ctx.started[1].at, 10.12 + chunkSeconds, 'second chunk is gapless');
  near(ctx.started[2].at, 10.12 + 2 * chunkSeconds, 'third chunk is gapless');
  assert.equal(ctx.started[0].buffer.sampleRate, 24000);
  assert.equal(ctx.started[0].buffer.length, 2048);
  assert.equal(ctx.started[0].to, out, 'sources feed the shared output');
  assert.equal(q.underruns, 0);
  ctx.currentTime = 11;
  q.push(chunk);
  near(ctx.started[3].at, 11.12, 'a starved queue buffers again');
  assert.equal(q.underruns, 1);
  near(q.seconds(), 4 * chunkSeconds, 'seconds received');
  ctx.currentTime = 10.2;
  near(q.elapsed(), 0.08, 'elapsed counts from the first scheduled sample');

  assert.throws(() => q.push(new Uint8Array(4095).buffer), RangeError);
  assert.equal(ctx.started.length, 4, 'a refused frame schedules nothing');

  q.end();
  assert.equal(drained, 0, 'audio.end does not cut the queue');
  assert.equal(q.push(chunk), null, 'nothing is queued after the end');
  ctx.started.slice(0, 3).forEach((s) => s.finish());
  assert.equal(drained, 0);
  ctx.started[3].finish();
  assert.equal(drained, 1, 'finishes when the last queued source ends');
  assert.equal(q.pending(), 0);
}
{
  const ctx = fakeContext();
  let drained = 0;
  const q = voce.queue(ctx, {}, { rate: 16000, jitter: 0.05, drained: () => { drained++; } });
  q.push(chunk);
  q.push(chunk);
  near(ctx.started[0].at, 0.05, 'jitter is a knob');
  assert.equal(ctx.started[0].buffer.sampleRate, 16000, 'the rate of audio.start is honoured');
  q.stop();
  assert.ok(ctx.started.every((s) => s.stopped), 'stop silences every queued source');
  ctx.started.forEach((s) => s.finish());
  q.end();
  assert.equal(drained, 0, 'a stopped queue never reports a natural finish');
  assert.equal(q.push(chunk), null);
}
{
  const ctx = fakeContext();
  const timers = [];
  const realSet = global.setTimeout, realClear = global.clearTimeout;
  global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  global.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].fn = null; };
  try {
    let starved = 0;
    const q = voce.queue(ctx, {}, { prebuffer: 0.3, jitter: 0.05, starved: () => { starved++; } });
    ctx.currentTime = 5;
    q.push(chunk);
    assert.equal(ctx.started.length, 0, 'a prebuffering queue holds the first chunk');
    q.push(chunk);
    q.push(chunk);
    assert.equal(ctx.started.length, 0, 'and keeps holding below the target');
    q.push(chunk);
    assert.equal(ctx.started.length, 4, 'then plays everything held at once once the target is met');
    near(ctx.started[0].at, 5.05, 'the held chunks start one lead out');
    near(ctx.started[3].at, 5.05 + 3 * chunkSeconds, 'gapless after the release');
    ctx.currentTime = 9;
    q.push(chunk);
    assert.equal(ctx.started.length, 5, 'a starved queue resumes at once, with no second buffering wait');
    near(ctx.started[4].at, 9.05, 'one lead after the chunk arrived');
    assert.equal(q.underruns, 1, 'one starve is one underrun');
    assert.equal(starved, 1, 'and the engine is told, so the next stream starts with a larger lead');
    q.end();
    const slow = voce.queue(ctx, {}, { prebuffer: 0.3 });
    const before = ctx.started.length;
    slow.push(chunk);
    assert.equal(ctx.started.length, before, 'a first chunk is held');
    const hold = timers.filter((t) => t.fn).pop();
    assert.ok(hold && hold.ms > 0, 'a held chunk is never stranded: a timer plays it');
    hold.fn();
    assert.equal(ctx.started.length, before + 1, 'the timer releases what is held');
    const ending = voce.queue(ctx, {}, { prebuffer: 0.3 });
    ending.push(chunk);
    ending.end();
    assert.equal(ctx.started.length, before + 2, 'audio.end plays what is held at once');
    const stopper = voce.queue(ctx, {}, { prebuffer: 0.3 });
    stopper.push(chunk);
    stopper.stop();
    stopper.end();
    assert.equal(ctx.started.length, before + 2, 'a stopped queue drops what it held');
  } finally {
    global.setTimeout = realSet;
    global.clearTimeout = realClear;
  }
}
{
  const eng = voce.engine({});
  const p = (state) => ({ busy: () => state.v, yield: () => {}, resume: () => {} });
  const media = { v: true };
  const a = p(media), b = p({ v: false });
  eng.claim(a);
  assert.equal(eng.busy(b), true, 'a stored clip that is playing makes the engine busy: a live reply waits behind it');
  media.v = false;
  assert.equal(eng.busy(b), false, 'a paused clip does not hold a live reply back');
}
{
  const q = voce.queue(fakeContext(), {}, { drained: () => { q.done = true; } });
  q.end();
  assert.equal(q.done, true, 'an empty stream finishes at once');
}

{
  const eng = voce.engine({});
  const heard = [];
  const player = (name) => { const p = { name, live: false, busy: () => p.live, yield: () => heard.push('yield ' + name), resume: () => { heard.push('resume ' + name); eng.claim(p); p.live = true; } }; return p; };
  const a = player('a'), b = player('b'), c = player('c');
  eng.claim(a); a.live = true;
  assert.equal(eng.busy(b), true, 'a speaking reply makes the engine busy for others');
  eng.wait(b); eng.wait(c); eng.wait(b);
  assert.deepEqual(heard, [], 'an arriving reply waits; nothing is cut off');
  a.live = false; eng.release(a);
  assert.deepEqual(heard, ['resume b'], 'the next waiting reply starts when the speaker finishes');
  b.live = false; eng.release(b);
  assert.deepEqual(heard, ['resume b', 'resume c'], 'replies play in arrival order');
  eng.wait(a); eng.drop(a);
  c.live = false; eng.release(c);
  assert.equal(eng.current, null, 'a dropped waiter never plays');
}

const walk = (from, events) => events.reduce((s, e) => voce.transition(s, e), from);
assert.equal(walk('none', ['start', 'end', 'drained']), 'idle', 'live reply: start, end, drain, then replay is ready');
assert.equal(walk('none', ['start', 'end']), 'draining', 'audio.end alone does not finish playback');
assert.equal(walk('none', ['locked', 'end']), 'idle', 'no unlocked context: skip live, keep the replay');
assert.equal(walk('none', ['start', 'bad']), 'muted', 'a bad frame silences the live stream');
assert.equal(walk('none', ['start', 'bad', 'end']), 'idle');
assert.equal(walk('none', ['start', 'stop', 'end']), 'idle');
assert.equal(walk('none', ['start', 'fail']), 'lost', 'a speech error leaves no replay');
assert.equal(walk('idle', ['play', 'playing', 'pause', 'play', 'playing', 'ended']), 'idle');
assert.equal(walk('idle', ['play', 'expired']), 'expired');
assert.equal(walk('expired', ['play', 'start', 'end', 'ready']), 'expired', 'expired audio stays expired');
assert.equal(walk('idle', ['play', 'error', 'play']), 'loading', 'a failed load can be tried again');
assert.equal(voce.transition('idle', 'drained'), 'idle', 'an event that does not apply changes nothing');
assert.equal(voce.transition('nonsense', 'play'), 'nonsense');

assert.equal(voce.clock(0), '0:00');
assert.equal(voce.clock(65.9), '1:05');
assert.equal(voce.clock(600), '10:00');
assert.equal(voce.clock(NaN), '--:--');
assert.equal(voce.clock(Infinity), '--:--');
assert.equal(voce.supported({ format: 'pcm', rate: 24000, bits: 16, channels: 1 }), true);
assert.equal(voce.supported({ format: 'mp3' }), false);
assert.equal(voce.supported({ format: 'pcm', bits: 8 }), false);
assert.equal(voce.supported({ format: 'pcm', channels: 2 }), false);

const forbidden = [/innerHTML/, /insertAdjacentHTML/, /outerHTML/, /document\.write/, /\beval\s*\(/, /new\s+Function/, /\.style\b/, /srcdoc/, /\.cssText/, /createContextualFragment/, /DOMParser/, /\bon[a-z]+\s*=/, /setTimeout\(\s*['"]/, /import\(/, /MediaSource/, /SourceBuffer/];
const text = fs.readFileSync(path.join(__dirname, '../assets/voce/voce.js'), 'utf8');
assert.ok(!/setAttribute\(\s*['"](style|on)/.test(text), 'voce sets a style or handler attribute');
const bare = text.replace(/'[^'\n]*'|"[^"\n]*"/g, "''");
for (const re of forbidden) assert.ok(!re.test(bare), 'voce.js uses ' + re);
assert.ok(!/^\s*(\/\/|\/\*)/m.test(text), 'voce.js ships comments');
console.log('voce: PCM decode, schedule against a fake context, player states and forbidden sinks pass');
