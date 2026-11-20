'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const voce = require('../assets/voce/voce.js');
const figchat = require('../assets/figchat/figchat.js');
const mock = require('../examples/figchat-mock.js');

const root = path.join(__dirname, '..');

assert.deepEqual(
  figchat.reveal('a\u202eb\u200bc\u0000d').map((p) => p.mark || p.plain),
  ['a', 'U+202E', 'b', 'U+200B', 'c', 'U+0000', 'd'],
  'bidi, zero width and C0 controls are shown, not obeyed'
);
assert.deepEqual(figchat.reveal('tab\there\nnewline').map((p) => p.plain), ['tab\there\nnewline']);
assert.equal(figchat.routeFor('c0ffee/01'), '#/t/c0ffee%2F01');
assert.deepEqual(figchat.parseRoute('#/t/c0ffee%2F01'), { thread: 'c0ffee/01' });
assert.deepEqual(figchat.parseRoute('#/new'), { fresh: true });
assert.equal(figchat.parseRoute('#/t/a/b'), null);
assert.equal(figchat.parseRoute('#/t/%E0%A4%A'), null, 'a malformed escape is no route');
assert.equal(figchat.parseRoute(''), null);
assert.equal(figchat.titleFrom('  first   line\nsecond'), 'first line');
assert.equal(figchat.titleFrom('x'.repeat(200)).length, 60);
assert.deepEqual([0, 1, 2, 5, 9].map(figchat.backoff), [500, 1000, 2000, 15000, 15000]);
const t0 = Date.parse('2026-11-20T12:00:00Z');
assert.equal(figchat.ago(t0 - 5000, t0), 'now');
assert.equal(figchat.ago(new Date(t0 - 5 * 60000).toISOString(), t0), '5 min');
assert.equal(figchat.ago(t0 - 3 * 3600000, t0), '3 h');
assert.equal(figchat.ago(t0 - 2 * 86400000, t0), '2 d');
assert.equal(figchat.ago(t0 - 30 * 86400000, t0), '2026-10-21');
assert.equal(figchat.ago('garbage', t0), '');

{
  const c = figchat.conversation();
  c.load([{ id: 1, role: 'user', text: 'hi', tools: [] }, { id: 2, role: 'assistant', text: 'hello', tools: [{ id: 't', name: 'x', error: 'boom' }], audio_id: 'a0' }]);
  assert.deepEqual(c.messages.map((m) => [m.id, m.done]), [[1, true], [2, true]]);
  assert.equal(c.messages[1].tools[0].state, 'failed');
  assert.equal(c.last(), 2);

  const kinds = [];
  const feed = (f) => { const e = c.apply(f); kinds.push(e ? e.kind : null); return e; };
  feed({ type: 'message.start', id: 4, role: 'assistant' });
  c.add({ id: 3, role: 'user', text: 'what time?' });
  assert.deepEqual(c.messages.map((m) => m.id), [1, 2, 3, 4], 'the sent message sorts before a reply that raced its POST answer');
  feed({ type: 'message.delta', id: 4, text: 'It is ' });
  feed({ type: 'audio.start', message_id: 4, format: 'pcm', rate: 24000, bits: 16, channels: 1 });
  assert.equal(c.binary().id, 4, 'binary frames belong to the message of the current audio.start');
  feed({ type: 'tool.start', id: 4, tool_id: 't1', name: 'bash', args: '{}' });
  assert.equal(c.get(4).tools[0].state, 'running');
  feed({ type: 'tool.end', id: 4, tool_id: 't1', result: 'ok' });
  assert.equal(c.get(4).tools[0].state, 'done');
  feed({ type: 'message.delta', id: 4, text: 'noon.' });
  const end = feed({ type: 'message.end', id: 4 });
  assert.equal(end.refetch, false);
  assert.equal(c.get(4).text, 'It is noon.');
  assert.equal(c.binary().id, 4, 'message.end may precede audio.end: the stream stays open');
  const done = feed({ type: 'audio.end', message_id: 4, audio_id: 'a9' });
  assert.equal(done.audio_id, 'a9');
  assert.equal(c.binary(), null, 'after audio.end binary frames have no owner');
  assert.equal(feed({ type: 'message.delta', id: 4, text: 'late' }), null, 'a delta after message.end is dropped');
  assert.equal(c.get(4).text, 'It is noon.');
  assert.equal(feed({ type: 'keepalive' }), null);
  assert.equal(feed({ type: 'something.new', id: 9 }), null, 'unknown frame types are ignored');
  assert.equal(feed(null), null);
  assert.equal(feed({ type: 'ping' }), null, 'liveness is the protocol ping: a JSON ping is just an unknown frame');
  assert.deepEqual(kinds, ['message', 'delta', 'audio.start', 'tool', 'tool', 'delta', 'end', 'audio.end', null, null, null, null, null]);

  feed({ type: 'message.delta', id: 6, text: 'tail of a reply' });
  assert.equal(c.get(6).partial, true);
  assert.equal(feed({ type: 'message.end', id: 6 }).refetch, true, 'a reply joined halfway is fetched whole when it ends');
  c.load([{ id: 6, role: 'assistant', text: 'The whole tail of a reply', tools: [] }]);
  assert.equal(c.get(6).text, 'The whole tail of a reply');

  c.load([{ id: 7, role: 'assistant', text: '', tools: [] }]);
  assert.equal(c.get(7).done, false, 'an empty stored reply is a turn still running');
  feed({ type: 'message.delta', id: 7, text: 'abc' });
  feed({ type: 'message.start', id: 7, role: 'assistant' });
  assert.equal(c.get(7).text, '', 'a resent message.start restarts the text instead of doubling it');
  feed({ type: 'message.delta', id: 7, text: 'abcdef' });
  c.load([{ id: 7, role: 'assistant', text: 'stale', tools: [] }]);
  assert.equal(c.get(7).text, 'abcdef', 'history does not overwrite a message that is streaming');
  c.cut();
  c.load([{ id: 7, role: 'assistant', text: '', tools: [] }]);
  assert.deepEqual([c.get(7).text, c.get(7).done, c.get(7).partial], ['abcdef', false, true], 'after a dropped socket an unfinished stored reply keeps what was heard');
  feed({ type: 'message.delta', id: 7, text: 'xyz' });
  assert.equal(feed({ type: 'message.end', id: 7 }).refetch, true, 'and is fetched whole when it ends');
  c.load([{ id: 7, role: 'assistant', text: 'abcdef-gap-xyz', tools: [] }]);
  assert.equal(c.get(7).text, 'abcdef-gap-xyz');

  c.load([{ id: 20, role: 'assistant', text: 'has text already', tools: [], state: 'streaming' }]);
  assert.deepEqual([c.get(20).done, c.get(20).partial, c.running()], [false, true, true], 'state says a turn is running, whatever the row holds');
  feed({ type: 'message.delta', id: 20, text: ' tail' });
  assert.equal(feed({ type: 'message.end', id: 20 }).refetch, true);
  c.load([{ id: 20, role: 'assistant', text: 'whole', tools: [], state: 'done' }]);
  assert.deepEqual([c.get(20).text, c.get(20).done, c.running()], ['whole', true, false]);
  c.load([{ id: 21, role: 'assistant', text: '', tools: [], state: 'done' }]);
  assert.equal(c.get(21).done, true, 'an empty reply that is done is not a running turn');
  c.load([{ id: 22, role: 'assistant', text: '', tools: [], state: 'failed' }]);
  assert.deepEqual([c.get(22).done, c.get(22).failed, c.get(22).fault], [true, true, 'This reply failed.']);

  const added = { id: 23, thread: 't', role: 'user', text: 'from the other tab', created: '2026-11-20T12:00:00Z', audio_id: 'clip9', tools: [], state: 'done' };
  assert.equal(feed({ type: 'message.added', message: added }).kind, 'message');
  c.add({ id: 23, role: 'user', text: 'from the other tab' });
  feed({ type: 'message.added', message: added });
  assert.equal(c.messages.filter((m) => m.id === 23).length, 1, 'message.added and the POST answer are one message');
  assert.deepEqual([c.get(23).audio_id, c.get(23).created, c.get(23).done], ['clip9', '2026-11-20T12:00:00Z', true]);
  assert.equal(feed({ type: 'message.added' }), null);

  feed({ type: 'message.start', id: 24, role: 'assistant' });
  feed({ type: 'message.delta', id: 24, text: 'half' });
  feed({ type: 'error', message_id: 24, code: 'figaro', text: 'aria died' });
  feed({ type: 'message.end', id: 24 });
  assert.deepEqual([c.get(24).failed, c.get(24).fault, c.get(24).done, c.get(24).text], [true, 'Failed: aria died', true, 'half']);
  c.load([{ id: 24, role: 'assistant', text: '', tools: [], state: 'failed' }]);
  assert.equal(c.get(24).text, 'half', 'a failed reply keeps what was heard when the stored row is empty');

  feed({ type: 'message.start', id: 8, role: 'assistant' });
  feed({ type: 'audio.start', message_id: 8, format: 'pcm' });
  const err = feed({ type: 'error', message_id: 8, code: 'speech', text: 'tts down' });
  assert.equal(err.kind, 'error');
  assert.equal(c.binary(), null, 'a speech error closes the audio stream: no audio.end follows it');
  feed({ type: 'audio.start', message_id: 8, format: 'pcm' });
  assert.equal(c.cut().id, 8, 'a dropped socket hands back the message whose audio was cut');
  assert.equal(c.get(8).streaming, false);
}

{
  const kinds = (t) => figchat.blocks(t).map((b) => b.kind);
  assert.deepEqual(figchat.blocks('one\ntwo\n\nthree'), [{ kind: 'p', text: 'one\ntwo' }, { kind: 'p', text: 'three' }]);
  assert.deepEqual(figchat.blocks('a\n```js\nx = "<b>"\n\n**not bold**'), [{ kind: 'p', text: 'a' }, { kind: 'code', lang: 'js', text: 'x = "<b>"\n\n**not bold**', open: true }], 'a fence still streaming holds everything after it as code');
  assert.deepEqual(figchat.blocks('```\nx\n```\nafter'), [{ kind: 'code', lang: '', text: 'x', open: false }, { kind: 'p', text: 'after' }]);
  assert.deepEqual(figchat.blocks('# T\n- a\n- b\n  more\n1. x\n2) y\n\n---\n> q\n> r'), [
    { kind: 'h', level: 1, text: 'T' }, { kind: 'ul', start: 1, items: ['a', 'b\nmore'] }, { kind: 'ol', start: 1, items: ['x', 'y'] }, { kind: 'hr' }, { kind: 'quote', text: 'q\nr' }
  ]);
  assert.deepEqual(kinds(''), []);
  assert.deepEqual(kinds('#hashtag and 2 * 3 * 4'), ['p']);
  const sp = (t) => figchat.spans(t).map((x) => x.kind === 'text' ? x.text : [x.kind, x.text || x.spans.map((y) => y.text).join('|'), x.href].filter(Boolean));
  assert.deepEqual(sp('a **b `c`** *d* `e*f*` 2 * 3 * 4'), ['a ', ['b', 'b |c'], ' ', ['i', 'd'], ' ', ['code', 'e*f*'], ' 2 * 3 * 4']);
  assert.deepEqual(sp('[ok](https://a.example/x) [bad](javascript:alert(1)) [data](data:text/html,x) see https://b.example/y.'), [
    ['a', 'ok', 'https://a.example/x'], ' [bad](javascript:alert(1)) [data](data:text/html,x) see ', ['a', 'https://b.example/y', 'https://b.example/y'], '.'
  ], 'only http, https and mailto become links; the rest stays as typed');
  assert.deepEqual(sp('<img src=x onerror="a*b*c">'), ['<img src=x onerror="a', ['i', 'b'], 'c">'], 'markup is only ever span text');
  let longest = 0;
  const big = ('word '.repeat(40) + '\n\n').repeat(400);
  const t0 = Date.now();
  for (let i = 0; i < big.length; i += 4000) longest = Math.max(longest, figchat.blocks(big.slice(0, i)).length);
  assert.ok(longest >= 300 && Date.now() - t0 < 2000, 'parsing an 80 KiB reply at every 4 KiB step stays cheap');

  const R = (ok) => ({ isTypeSupported: (t) => ok.includes(t) });
  assert.equal(figchat.micType(R(['audio/webm;codecs=opus', 'audio/mp4'])), 'audio/webm;codecs=opus');
  assert.equal(figchat.micType(R(['audio/mp4'])), 'audio/mp4', 'Safari records mp4');
  assert.equal(figchat.micType(R([])), '');
  assert.equal(figchat.micType(null), '');
  assert.ok(/blocked/.test(figchat.micFault({ name: 'NotAllowedError' })) && /No microphone/.test(figchat.micFault({ name: 'NotFoundError' })));
}

{
  let clock = 0;
  const timers = [];
  const core = mock.create({
    seed: 'demo',
    now: () => Date.parse('2026-11-20T12:00:00Z'),
    setTimeout: (fn, ms) => { timers.push({ at: clock + ms, fn }); return timers.length; },
    clearTimeout: () => {}
  });
  const flush = () => { while (timers.length) { timers.sort((a, b) => a.at - b.at); const t = timers.shift(); clock = t.at; t.fn(); } };
  const tap = () => {
    const seen = [];
    const conn = core.attach('c0ffee01', null, { text: (s) => seen.push(JSON.parse(s)), binary: (b) => seen.push(b), close: () => {} });
    return { seen, conn };
  };
  const loud = tap(), quiet = tap();
  loud.conn.receive(JSON.stringify({ type: 'voice', on: true }));

  const threads = core.handle('GET', '/chat/api/threads', '').json.threads;
  assert.deepEqual(Object.keys(threads[0]).sort(), ['id', 'title', 'updated']);
  const page = core.handle('GET', '/chat/api/threads/c0ffee02/messages?limit=50', '').json;
  assert.equal(page.messages.length, 50);
  assert.equal(page.next_before, 71, 'next_before is the oldest id on the page');
  assert.equal(core.handle('GET', '/chat/api/threads/c0ffee02/messages?limit=200&before=71', '').json.next_before, undefined);
  assert.deepEqual(Object.keys(page.messages[0]).sort(), ['created', 'id', 'role', 'state', 'text', 'thread', 'tools']);
  assert.equal(core.handle('GET', '/chat/api/threads/nope/messages', '').status, 404);
  assert.equal(core.handle('POST', '/chat/api/threads/c0ffee01/messages', '{"text":"  "}').status, 400);

  const sent = core.handle('POST', '/chat/api/threads/c0ffee01/messages', JSON.stringify({ text: 'ciao' }));
  assert.deepEqual(sent.json, { id: 5, state: 'accepted' });
  assert.equal(core.handle('GET', '/chat/api/threads/c0ffee01/messages', '').json.messages[5].state, 'streaming', 'a reply is streaming, with empty text, while its turn runs');
  flush();
  assert.equal(core.handle('GET', '/chat/api/threads/c0ffee01/messages', '').json.messages[5].state, 'done');

  const tag = (f) => (f instanceof ArrayBuffer ? 'pcm' : f.type);
  const order = loud.seen.map(tag);
  const first = (name) => order.indexOf(name), last = (name) => order.lastIndexOf(name);
  assert.deepEqual(order.slice(0, 2), ['message.added', 'message.start'], 'the user message reaches every socket before the reply starts');
  assert.deepEqual([loud.seen[0].message.id, loud.seen[0].message.role, loud.seen[0].message.state, loud.seen[0].message.thread], [5, 'user', 'done', 'c0ffee01']);
  assert.ok(first('message.delta') > first('message.start') && last('message.delta') < first('message.end'), 'deltas sit between message.start and message.end');
  assert.ok(first('audio.start') > first('message.delta'), 'audio.start follows the first sentence');
  assert.ok(first('pcm') > first('audio.start') && last('pcm') < first('audio.end'), 'PCM sits between audio.start and audio.end');
  assert.ok(first('tool.start') < first('tool.end') && last('tool.end') < first('message.end'));
  assert.ok(first('message.end') < first('audio.end'), 'message.end may precede audio.end');
  assert.equal(order.filter((x) => x === 'audio.start').length, 1, 'one audio stream at a time');
  const start = loud.seen[first('audio.start')];
  assert.deepEqual([start.format, start.rate, start.bits, start.channels, start.audio_id], ['pcm', 24000, 16, 1, undefined], 'audio.start carries no audio_id');
  const pcm = loud.seen.filter((f) => f instanceof ArrayBuffer);
  assert.ok(pcm.every((b) => b.byteLength % 2 === 0 && b.byteLength <= 4096), 'every PCM frame is whole samples, about 4 KiB');
  const total = pcm.reduce((n, b) => n + b.byteLength, 0);
  const endFrame = loud.seen[first('audio.end')];
  assert.equal(core.audio(endFrame.audio_id).bytes.length, 44 + total, 'the stored copy holds exactly the streamed samples');
  assert.equal(core.audio('seed-expired').status, 404);

  const calm = quiet.seen.map(tag);
  assert.ok(!calm.includes('pcm') && !calm.includes('audio.start'), 'a socket that did not ask for voice gets no PCM');
  assert.equal(quiet.seen[calm.indexOf('audio.end')].audio_id, endFrame.audio_id, 'but it learns the audio_id, so it can replay');
  assert.deepEqual(calm, order.filter((x) => !/^audio\.start|^pcm/.test(x)), 'and the same text frames in the same order');
  assert.equal(core.clip('audio/webm;codecs=opus', 9).json.text, 'A mock transcript.');
  assert.equal(core.clip('audio/wav', 9).status, 415);

  const c = figchat.conversation();
  let bytes = 0;
  loud.seen.forEach((f) => { if (f instanceof ArrayBuffer) { assert.equal(c.binary().id, 6); bytes += voce.decodePCM(f).length; } else c.apply(f); });
  assert.equal(bytes * 2, total);
  assert.equal(c.get(6).text, core.thread('c0ffee01').messages[5].text, 'folded deltas equal the stored text');
  assert.equal(c.get(6).audio_id, endFrame.audio_id);
  assert.equal(c.get(6).done, true);
}

{
  const calls = [];
  const sockets = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.heard = {}; this.out = []; sockets.push(this); }
    addEventListener(name, fn) { this.heard[name] = fn; }
    send(data) { this.out.push(data); }
    close(code) { this.closed = code; }
  }
  const answers = { 'chat/api/threads': { status: 200, body: '{"threads":[]}' } };
  const fetch = (url, init) => {
    calls.push([init.method, url, init.body, init.headers]);
    const a = answers[url] || { status: 404, body: '{"error":"no such thread","code":"not_found"}' };
    return Promise.resolve({ status: a.status, text: () => Promise.resolve(a.body) });
  };
  const tr = figchat.httpTransport({ api: 'chat/api/', ws: 'chat/ws', audio: 'chat/audio', base: 'https://fig.example/app/', fetch, WebSocket: FakeSocket });
  assert.equal(tr.audioURL('a b/c'), 'chat/audio/a%20b%2Fc', 'audio ids are one escaped path segment');
  const seen = [];
  const sock = tr.connect('t 1', 41, { open: () => seen.push('open'), frame: (f) => seen.push(f.type), binary: (b) => seen.push(b.byteLength), close: (c) => seen.push('close ' + c.code) });
  assert.equal(sockets[0].url, 'wss://fig.example/app/chat/ws?thread=t%201&after=41', 'the socket is same-origin, relative to the page, wss under https');
  assert.equal(sockets[0].binaryType, 'arraybuffer');
  assert.equal(sock.send({ type: 'voice', on: true }), false, 'nothing is sent before the socket opens');
  sockets[0].readyState = 1;
  sockets[0].heard.open();
  sockets[0].heard.message({ data: '{"type":"message.start","id":1,"role":"assistant"}' });
  sockets[0].heard.message({ data: '{"type":"audio.start","message_id":1,"format":"pcm"}' });
  sockets[0].heard.message({ data: new ArrayBuffer(4096) });
  sockets[0].heard.message({ data: 'not json' });
  sockets[0].heard.message({ data: new ArrayBuffer(512) });
  sockets[0].heard.message({ data: '{"type":"audio.end","message_id":1,"audio_id":"a"}' });
  sockets[0].heard.close({ code: 1006 });
  assert.deepEqual(seen, ['open', 'message.start', 'audio.start', 4096, 512, 'audio.end', 'close 1006'], 'text and binary frames reach the view in arrival order');
  assert.equal(sock.send({ type: 'voice', on: true }), true);
  assert.deepEqual(sockets[0].out, ['{"type":"voice","on":true}']);
  tr.connect('t', null, {});
  assert.equal(sockets[1].url, 'wss://fig.example/app/chat/ws?thread=t');

  (async () => {
    assert.deepEqual(await tr.threads(), { threads: [] });
    await assert.rejects(tr.messages('gone', { before: 9, limit: 20 }), (e) => e.status === 404 && e.code === 'not_found' && e.message === 'no such thread');
    await tr.send('t/1', { text: 'hi' }).catch(() => null);
    await tr.createThread('').catch(() => null);
    assert.equal(await tr.audioStatus('zz'), 404);
    const blob = { type: 'audio/mp4', size: 3 };
    await assert.rejects(tr.clip(blob), (e) => e.status === 404);
    answers['chat/api/clips'] = { status: 415, body: '{"error":"record as audio/webm, audio/ogg or audio/mp4","code":"unsupported_type"}' };
    await assert.rejects(tr.clip(blob), (e) => e.status === 415 && e.code === 'unsupported_type' && /audio\/webm/.test(e.message), 'the server refusal text reaches the page');
    assert.deepEqual([calls[5][0], calls[5][1], calls[5][2], calls[5][3]['Content-Type']], ['POST', 'chat/api/clips', blob, 'audio/mp4'], 'a clip goes up as recorded, typed as recorded');
    calls.length = 5;
    assert.deepEqual(calls.map((c) => c[0] + ' ' + c[1]), [
      'GET chat/api/threads',
      'GET chat/api/threads/gone/messages?before=9&limit=20',
      'POST chat/api/threads/t%2F1/messages',
      'POST chat/api/threads',
      'GET chat/audio/zz'
    ]);
    assert.equal(calls[2][2], '{"text":"hi"}');
    assert.equal(calls[2][3]['Content-Type'], 'application/json');
    assert.equal(calls[3][2], '{}');
    assert.equal(calls[4][3].Range, 'bytes=0-0');
    rest();
  })().catch((e) => { console.error(e); process.exit(1); });
}

function rest() {
  const forbidden = [/innerHTML/, /insertAdjacentHTML/, /outerHTML/, /document\.write/, /\beval\s*\(/, /new\s+Function/, /setAttribute\(\s*['"]style/, /\.style\b/, /srcdoc/, /\.cssText/, /createContextualFragment/, /DOMParser/, /\bon[a-z]+\s*=/, /setTimeout\(\s*['"]/, /import\(/, /MediaSource/, /SourceBuffer/];
  for (const rel of ['assets/figchat/figchat.js', 'assets/figchat/boot.js']) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.ok(!/setAttribute\(\s*['"](style|on)/.test(text), rel + ' sets a style or handler attribute');
    const bare = text.replace(/'[^'\n]*'|"[^"\n]*"/g, "''");
    for (const re of forbidden) assert.ok(!re.test(bare), rel + ' uses ' + re);
    assert.ok(!/^\s*(\/\/|\/\*)/m.test(text), rel + ' ships comments');
  }
  const page = fs.readFileSync(path.join(root, 'assets/figchat/index.html'), 'utf8');
  assert.ok(!/<script(?![^>]*\ssrc=)/i.test(page), 'no inline script');
  assert.ok(!/<style/i.test(page) && !/\sstyle=/i.test(page), 'no inline style');
  assert.ok(!/\son[a-z]+=/i.test(page), 'no inline handler');
  assert.ok(!/https?:\/\//.test(page), 'no external URL');
  const refs = Array.from(page.matchAll(/\s(?:src|href)="([^"]+)"/g)).map((m) => m[1]);
  assert.ok(refs.length >= 9 && refs.every((r) => /^assets\/[a-z0-9.-]+$/.test(r)), 'every reference is relative and under assets/: ' + refs);
  for (const attr of ['data-api="api"', 'data-ws="ws"', 'data-audio="audio"']) assert.ok(page.includes(attr), 'the page names ' + attr);

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'figchat-'));
  execFileSync(process.execPath, [path.join(root, 'bin/figchat-bundle'), out], { stdio: 'pipe' });
  const listed = fs.readFileSync(path.join(out, 'SHA256SUMS'), 'utf8').trim().split('\n').map((l) => l.split('  '));
  assert.deepEqual(listed.map((l) => l[1]).sort(), [
    'boot.js', 'figaro-head.png', 'figchat.css', 'figchat.js', 'fonts.css', 'fonts/eb-garamond-italic.woff2', 'fonts/eb-garamond.woff2',
    'fonts/jacquard-24.woff2', 'fonts/vt323.woff2', 'index.html', 'rotolo.css', 'voce.css', 'voce.js', 'z2-tokens.css'
  ]);
  for (const [sum, file] of listed) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(out, file))).digest('hex'), sum, file);
  for (const ref of refs) assert.ok(fs.existsSync(path.join(out, ref.replace(/^assets\//, ''))), 'the bundle holds ' + ref);
  for (const file of ['figchat.css', 'voce.css', 'fonts.css', 'rotolo.css', 'z2-tokens.css']) {
    const css = fs.readFileSync(path.join(out, file), 'utf8');
    assert.ok(!/url\(\s*['"]?(https?:|\/\/|data:)/.test(css) && !/@import/.test(css), file + ' fetches nothing off-origin and inlines nothing');
  }
  for (const name of fs.readdirSync(out)) assert.ok(!/\.map$/.test(name));
  for (const [name, from] of [['figchat.js', 'assets/figchat/figchat.js'], ['voce.js', 'assets/voce/voce.js']]) {
    assert.equal(fs.readFileSync(path.join(out, name), 'utf8'), fs.readFileSync(path.join(root, from), 'utf8'), name + ' ships as reviewed');
  }
  fs.rmSync(out, { recursive: true, force: true });
  console.log('figchat: frame ordering, the mock wire, transport, forbidden sinks, page hygiene and the bundle pass');
}
