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
assert.equal(figchat.routeFor(null), '#/');
assert.equal(figchat.routeFor('spain'), '#/spain');
assert.equal(figchat.routeFor('spain', 'wick-sushi'), '#/spain/wick-sushi');
assert.equal(figchat.routeFor('spain', 'wick-sushi', 41), '#/spain/wick-sushi:41');
assert.equal(figchat.routeFor('a/b', 'c:d', 'e f'), '#/a%2Fb/c%3Ad:e%20f', 'a colon inside an id is escaped, so the first literal colon is the turn');
assert.deepEqual(figchat.parseRoute('#/spain'), { store: 'spain' });
assert.deepEqual(figchat.parseRoute('#/spain/wick-sushi'), { store: 'spain', aria: 'wick-sushi' });
assert.deepEqual(figchat.parseRoute('#/spain/wick-sushi:41'), { store: 'spain', aria: 'wick-sushi', turn: '41' });
assert.deepEqual(figchat.parseRoute('#/a%2Fb/c%3Ad:e%20f'), { store: 'a/b', aria: 'c:d', turn: 'e f' });
assert.equal(figchat.parseRoute('#/spain/a/b'), null);
assert.equal(figchat.parseRoute('#/spain/a:1:2'), null);
assert.equal(figchat.parseRoute('#/%E0%A4%A'), null, 'a malformed escape is no route');
assert.equal(figchat.parseRoute('#/'), null, 'the bare hash is the store picker');
assert.equal(figchat.parseRoute(''), null);
assert.deepEqual([0, 1, 2, 5, 9].map(figchat.backoff), [500, 1000, 2000, 15000, 15000]);
const t0 = Date.parse('2026-11-20T12:00:00Z');
assert.equal(figchat.ago(t0 - 5000, t0), 'now');
assert.equal(figchat.ago(new Date(t0 - 5 * 60000).toISOString(), t0), '5 min');
assert.equal(figchat.ago(t0 - 3 * 3600000, t0), '3 h');
assert.equal(figchat.ago(t0 - 2 * 86400000, t0), '2 d');
assert.equal(figchat.ago(t0 - 30 * 86400000, t0), '2026-10-21');
assert.equal(figchat.ago('garbage', t0), '');

{
  const rows = [0, 1, 2, 2, 1, 2, 0, 1].map((depth, i) => ({ id: 'r' + i, depth }));
  assert.deepEqual(figchat.tree(rows).map((t) => figchat.treeText(t)), [
    '', '\u251c\u2500', '\u2502 \u251c\u2500', '\u2502 \u2514\u2500', '\u2514\u2500', '  \u2514\u2500', '', '\u2514\u2500'
  ], 'connectors follow depth, as the pager draws them');
  assert.deepEqual(figchat.tree([{ depth: 1 }, { depth: 1 }]).map((t) => t.last), [false, true], 'a page that starts below the root still closes its last sibling');
  assert.equal(figchat.cursorText({ turn: 3, text: 17, started: 3, ended: 2 }), '3.17.3.2');
  assert.equal(figchat.cursorText('3.17.3.2'), '3.17.3.2');
  assert.equal(figchat.cursorText(null), '');
}

{
  const c = figchat.conversation();
  const T = (id, extra) => Object.assign({ id, at: '2026-11-20T12:00:00Z', prompt: 'q' + id, reply: 'a' + id, tools: [], done: true, cursor: { turn: id, text: 2, started: id, ended: id } }, extra);
  c.load([T(11), T(12, { tools: [{ id: 't', name: 'x', error: 'boom' }], audio_id: 'a0', prompt_audio_id: 'p0', from: 'lane x' })]);
  assert.deepEqual(c.turns.map((t) => [t.id, t.done]), [[11, true], [12, true]]);
  assert.deepEqual([c.get(12).tools[0].state, c.get(12).audio_id, c.get(12).prompt_audio_id, c.get(12).from], ['failed', 'a0', 'p0', 'lane x']);
  assert.equal(c.cursor(), '12.2.12.12', 'the cursor to resume from is the newest stored turn');
  c.load([T(9), T(10)], true);
  assert.deepEqual(c.turns.map((t) => t.id), [9, 10, 11, 12], 'older turns go in front, oldest first');
  c.load([T(10), T(11)], true);
  assert.equal(c.turns.length, 4, 'a turn is never listed twice');

  const kinds = [];
  const feed = (f) => { const e = c.apply(f); kinds.push(e ? e.kind : null); return e; };
  const cur = (turn, text, started, ended) => ({ turn, text, started, ended });
  feed({ type: 'turn.start', turn: 13, prompt: 'what time?', from: 'Gluck (figchat)', cursor: cur(13, 0, 13, 12) });
  assert.deepEqual([c.get(13).prompt, c.get(13).from, c.running(), c.cursor()], ['what time?', 'Gluck (figchat)', true, '13.0.13.12']);
  feed({ type: 'message.delta', turn: 13, text: 'It is ', cursor: cur(13, 6, 13, 12) });
  feed({ type: 'audio.start', turn: 13, format: 'pcm', rate: 24000, bits: 16, channels: 1, cursor: cur(13, 6, 13, 12) });
  assert.equal(c.binary().id, 13, 'binary frames belong to the turn of the current audio.start');
  feed({ type: 'tool.start', turn: 13, tool_id: 't1', name: 'bash', args: '{}' });
  assert.equal(c.get(13).tools[0].state, 'running');
  feed({ type: 'tool.end', turn: 13, tool_id: 't1', result: 'ok' });
  assert.equal(c.get(13).tools[0].state, 'done');
  feed({ type: 'message.delta', turn: 13, text: 'noon.', cursor: cur(13, 11, 13, 12) });
  const end = feed({ type: 'turn.end', turn: 13, text: 'It is noon.', cursor: cur(13, 11, 13, 13) });
  assert.deepEqual([end.turn.reply, c.running(), c.cursor()], ['It is noon.', false, '13.11.13.13']);
  assert.equal(c.binary().id, 13, 'turn.end may precede audio.end: the stream stays open');
  assert.equal(feed({ type: 'audio.end', turn: 13, audio_id: 'a9' }).audio_id, 'a9');
  assert.equal(c.binary(), null, 'after audio.end binary frames have no owner');
  assert.equal(feed({ type: 'message.delta', turn: 13, text: 'late' }), null, 'a delta after turn.end is dropped');
  assert.equal(c.get(13).reply, 'It is noon.');
  assert.equal(feed({ type: 'turn.start', turn: 13, prompt: 'again' }), null, 'a turn.start for a known turn changes nothing');
  assert.equal(c.get(13).prompt, 'what time?');
  assert.equal(feed({ type: 'keepalive', cursor: cur(13, 11, 13, 13) }), null);
  assert.equal(feed({ type: 'something.new', turn: 9 }), null, 'unknown frame types are ignored');
  assert.equal(feed(null), null);
  assert.deepEqual(kinds, ['turn', 'delta', 'audio.start', 'tool', 'tool', 'delta', 'end', 'audio.end', null, null, null, null, null]);
  assert.equal(feed({ type: 'offline' }).kind, 'offline');

  feed({ type: 'message.delta', turn: 14, text: 'tail of a reply' });
  assert.deepEqual([c.get(14).prompt, c.get(14).done, c.running()], ['', false, true], 'a frame for an unseen turn makes the turn, so a resumed follow shows it');
  feed({ type: 'turn.end', turn: 14, text: 'The whole tail of a reply' });
  assert.equal(c.get(14).reply, 'The whole tail of a reply', 'turn.end carries the reply as shown');

  c.load([T(15, { reply: 'half', done: false })]);
  assert.deepEqual([c.get(15).done, c.get(15).streaming, c.running()], [false, true, true], 'a stored turn that is not done is running');
  feed({ type: 'message.delta', turn: 15, text: ' and more' });
  c.load([T(15, { reply: 'stale' })]);
  assert.equal(c.get(15).reply, 'half and more', 'history does not overwrite a turn that is streaming');
  feed({ type: 'turn.end', turn: 15, text: 'half and more' });

  feed({ type: 'turn.start', turn: 16, prompt: 'go' });
  feed({ type: 'message.delta', turn: 16, text: 'half' });
  feed({ type: 'error', turn: 16, code: 'figaro', text: 'aria died' });
  assert.deepEqual([c.get(16).failed, c.get(16).fault, c.get(16).done, c.get(16).reply], [true, 'Failed: aria died', true, 'half']);
  assert.equal(feed({ type: 'error', code: 'cursor', text: 'x' }).turn, null, 'an error without a turn is the aria\u2019s');

  feed({ type: 'turn.start', turn: 17, prompt: 'speak' });
  feed({ type: 'audio.start', turn: 17, format: 'pcm' });
  const err = feed({ type: 'error', turn: 17, code: 'speech', text: 'tts down' });
  assert.equal(err.kind, 'error');
  assert.deepEqual([c.binary(), c.get(17).failed, c.get(17).done], [null, false, false], 'a speech error closes the audio stream and fails nothing else');
  feed({ type: 'audio.start', turn: 17, format: 'pcm' });
  assert.equal(c.cut().id, 17, 'a dropped socket hands back the turn whose audio was cut');
  assert.equal(c.get(17).streaming, false);
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
  const get = (p) => core.handle('GET', '/chat/api' + p, '');
  const tap = (cursor) => {
    const seen = [];
    const conn = core.attach('spain', 'wick-sushi', cursor || null, { text: (s) => seen.push(JSON.parse(s)), binary: (b) => seen.push(b), close: () => {} });
    return { seen, conn };
  };

  assert.deepEqual(get('/stores').json.stores, [{ id: 'spain', label: 'Spain', online: true }, { id: 'gluck', label: 'Gluck', online: false }]);
  assert.deepEqual([get('/stores/gluck/arias').status, get('/stores/gluck/arias').json.code], [503, 'store_offline'], 'an offline store answers 503 store_offline');
  assert.equal(get('/stores/nope/arias').status, 404);

  const first = get('/stores/spain/arias?limit=4').json;
  assert.deepEqual(first.arias.map((a) => a.id), ['wick-sushi', 'anklet-aerosol', 'arsonist-grill', 'aardvark-thaw']);
  assert.deepEqual(first.arias.map((a) => a.depth), [0, 1, 1, 2], 'the list is in tree order and says each depth');
  assert.deepEqual(Object.keys(first.arias[0]).sort(), ['depth', 'handle', 'id', 'last_turn', 'mantra', 'parent', 'roles', 'state', 'title']);
  assert.equal(first.arias[3].parent, 'arsonist-grill');
  const second = get('/stores/spain/arias?limit=4&before=' + first.next_before).json;
  assert.deepEqual(second.arias.map((a) => a.id), ['abundant-lecturer', 'again-myspace', 'degree-frosting', 'lantern-bishop'], 'the next page continues the tree where the last stopped');
  assert.equal(get('/stores/spain/arias?limit=200').json.next_before, undefined);

  const newest = get('/stores/spain/arias/wick-sushi/turns').json;
  assert.deepEqual([newest.turns.length, newest.turns[0].id, newest.turns[19].id, newest.more], [20, 101, 120, true], 'turns come oldest first, the newest page by default');
  assert.deepEqual(Object.keys(newest.turns[0]).sort(), ['at', 'cursor', 'done', 'id', 'prompt', 'reply', 'tools']);
  const older = get('/stores/spain/arias/wick-sushi/turns?before=101&limit=20').json;
  assert.deepEqual([older.turns[0].id, older.turns[19].id, older.more], [81, 100, true], 'before is the oldest id seen');
  assert.equal(get('/stores/spain/arias/wick-sushi/turns?before=21&limit=20').json.more, false);
  assert.deepEqual([get('/stores/spain/arias/again-myspace/turns').status, get('/stores/spain/arias/nope/turns').json.code], [404, 'aria_gone'], 'a reaped or unknown aria is aria_gone');
  assert.equal(core.handle('POST', '/chat/api/stores/spain/arias/wick-sushi/send', '{"text":"  "}').status, 400);

  const loud = tap(), quiet = tap();
  loud.conn.receive(JSON.stringify({ type: 'voice', on: true }));
  const sent = core.handle('POST', '/chat/api/stores/spain/arias/wick-sushi/send', JSON.stringify({ text: 'ciao' }));
  assert.deepEqual(sent.json, { state: 'accepted' });
  assert.equal(get('/stores/spain/arias/wick-sushi/turns?limit=1').json.turns[0].done, true, 'nothing has run yet: the reply comes on the socket');
  flush();
  const stored = get('/stores/spain/arias/wick-sushi/turns?limit=1').json.turns[0];
  assert.deepEqual([stored.id, stored.prompt, stored.done, stored.from], [121, 'ciao', true, 'Gluck (figchat)']);

  const tag = (f) => (f instanceof ArrayBuffer ? 'pcm' : f.type);
  const order = loud.seen.map(tag);
  const first1 = (name) => order.indexOf(name), last1 = (name) => order.lastIndexOf(name);
  assert.equal(order[0], 'turn.start', 'the prompt reaches every socket as turn.start before the reply');
  assert.deepEqual([loud.seen[0].turn, loud.seen[0].prompt, loud.seen[0].from], [121, 'ciao', 'Gluck (figchat)']);
  assert.ok(loud.seen.filter((f) => !(f instanceof ArrayBuffer)).every((f) => f.cursor && f.cursor.turn === 121 && typeof f.cursor.started === 'number'), 'every frame carries a cursor');
  assert.ok(first1('message.delta') > first1('turn.start') && last1('message.delta') < first1('turn.end'), 'deltas sit between turn.start and turn.end');
  assert.ok(first1('audio.start') > first1('message.delta'));
  assert.ok(first1('pcm') > first1('audio.start') && last1('pcm') < first1('audio.end'), 'PCM sits between audio.start and audio.end');
  assert.ok(first1('tool.start') < first1('tool.end') && last1('tool.end') < first1('turn.end'));
  assert.ok(first1('turn.end') < first1('audio.end'), 'turn.end may precede audio.end');
  const start = loud.seen[first1('audio.start')];
  assert.deepEqual([start.format, start.rate, start.bits, start.channels, start.audio_id], ['pcm', 24000, 16, 1, undefined]);
  const pcm = loud.seen.filter((f) => f instanceof ArrayBuffer);
  assert.ok(pcm.every((b) => b.byteLength % 2 === 0 && b.byteLength <= 4096), 'every PCM frame is whole samples');
  const total = pcm.reduce((n, b) => n + b.byteLength, 0);
  const endFrame = loud.seen[first1('audio.end')];
  assert.equal(core.audio(endFrame.audio_id).bytes.length, 44 + total, 'the stored copy holds exactly the streamed samples');
  const calm = quiet.seen.map(tag);
  assert.ok(!calm.includes('pcm') && !calm.includes('audio.start'), 'a socket that did not ask for voice gets no PCM');
  assert.equal(quiet.seen[calm.indexOf('audio.end')].audio_id, endFrame.audio_id, 'but it learns the audio_id, so it can replay');
  assert.equal(core.clip('audio/webm;codecs=opus', 9).json.text, 'A mock transcript.');
  assert.equal(core.clip('audio/wav', 9).status, 415);

  const c = figchat.conversation();
  let bytes = 0;
  loud.seen.forEach((f) => { if (f instanceof ArrayBuffer) { assert.equal(c.binary().id, 121); bytes += voce.decodePCM(f).length; } else c.apply(f); });
  assert.equal(bytes * 2, total);
  assert.equal(c.get(121).reply, stored.reply, 'folded deltas equal the stored reply');
  assert.deepEqual([c.get(121).audio_id, c.get(121).done], [endFrame.audio_id, true]);

  core.inject('spain', 'wick-sushi', 'from the terminal', 'terminal');
  const cut = loud.seen.filter((f) => !(f instanceof ArrayBuffer));
  clock = 0;
  const before = cut.length;
  for (let n = 0; n < 4; n++) { timers.sort((a, b) => a.at - b.at); const t = timers.shift(); clock = t.at; t.fn(); }
  const heard = loud.seen.filter((f) => !(f instanceof ArrayBuffer)).slice(before);
  const resumeAt = heard[heard.length - 1].cursor;
  const resumeCursor = [resumeAt.turn, resumeAt.text, resumeAt.started, resumeAt.ended].join('.');
  const rest1 = tap(resumeCursor);
  flush();
  const tail = loud.seen.filter((f) => !(f instanceof ArrayBuffer)).slice(before + heard.length).filter((f) => f.type !== 'audio.start').map((f) => JSON.stringify(f));
  assert.deepEqual(rest1.seen.filter((f) => !(f instanceof ArrayBuffer)).map((f) => JSON.stringify(f)), tail, 'a socket that resumes from the last cursor it saw gets exactly the frames it missed');
  assert.ok(tail.length > 3);

  const fork = core.handle('POST', '/chat/api/stores/spain/arias', JSON.stringify({ fork_of: 'arsonist-grill', title: 'side quest' }));
  const ids = get('/stores/spain/arias?limit=200').json.arias;
  const at = ids.findIndex((a) => a.id === fork.json.id);
  assert.deepEqual([ids[at].parent, ids[at].depth, ids[at - 1].id], ['arsonist-grill', 2, 'degree-frosting'], 'a fork is listed under its parent, after that parent\u2019s subtree');
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
  const answers = { 'chat/api/stores': { status: 200, body: '{"stores":[]}' } };
  const fetch = (url, init) => {
    calls.push([init.method, url, init.body, init.headers]);
    const a = answers[url] || { status: 404, body: '{"error":"no such aria","code":"aria_gone"}' };
    return Promise.resolve({ status: a.status, text: () => Promise.resolve(a.body) });
  };
  const tr = figchat.httpTransport({ api: 'chat/api/', ws: 'chat/ws', audio: 'chat/audio', base: 'https://fig.example/app/', fetch, WebSocket: FakeSocket });
  assert.equal(tr.audioURL('a b/c'), 'chat/audio/a%20b%2Fc', 'audio ids are one escaped path segment');
  const seen = [];
  const sock = tr.connect('spain', 'wick sushi', '41.7.41.40', { open: () => seen.push('open'), frame: (f) => seen.push(f.type), binary: (b) => seen.push(b.byteLength), close: (c) => seen.push('close ' + c.code) });
  assert.equal(sockets[0].url, 'wss://fig.example/app/chat/ws?store=spain&aria=wick%20sushi&cursor=41.7.41.40', 'the socket is same-origin, relative to the page, wss under https, and carries the cursor');
  assert.equal(sockets[0].binaryType, 'arraybuffer');
  assert.equal(sock.send({ type: 'voice', on: true }), false, 'nothing is sent before the socket opens');
  sockets[0].readyState = 1;
  sockets[0].heard.open();
  sockets[0].heard.message({ data: '{"type":"turn.start","turn":1,"prompt":"q"}' });
  sockets[0].heard.message({ data: '{"type":"audio.start","turn":1,"format":"pcm"}' });
  sockets[0].heard.message({ data: new ArrayBuffer(4096) });
  sockets[0].heard.message({ data: 'not json' });
  sockets[0].heard.message({ data: new ArrayBuffer(512) });
  sockets[0].heard.message({ data: '{"type":"audio.end","turn":1,"audio_id":"a"}' });
  sockets[0].heard.close({ code: 1006 });
  assert.deepEqual(seen, ['open', 'turn.start', 'audio.start', 4096, 512, 'audio.end', 'close 1006'], 'text and binary frames reach the view in arrival order');
  assert.equal(sock.send({ type: 'voice', on: true }), true);
  assert.deepEqual(sockets[0].out, ['{"type":"voice","on":true}']);
  tr.connect('spain', 'a', '', {});
  assert.equal(sockets[1].url, 'wss://fig.example/app/chat/ws?store=spain&aria=a', 'no cursor, no parameter');

  (async () => {
    assert.deepEqual(await tr.stores(), { stores: [] });
    await assert.rejects(tr.turns('spain', 'gone', { before: 9, limit: 20 }), (e) => e.status === 404 && e.code === 'aria_gone' && e.message === 'no such aria');
    await tr.arias('spain', { before: '30', limit: 30 }).catch(() => null);
    await tr.send('s 1', 'a/b', { text: 'hi' }).catch(() => null);
    await tr.cancel('spain', 'a').catch(() => null);
    await tr.createAria('spain', { fork_of: 'a' }).catch(() => null);
    assert.equal(await tr.audioStatus('zz'), 404);
    const blob = { type: 'audio/mp4', size: 3 };
    answers['chat/api/clips'] = { status: 415, body: '{"error":"record as audio/webm, audio/ogg or audio/mp4","code":"unsupported_type"}' };
    await assert.rejects(tr.clip(blob), (e) => e.status === 415 && e.code === 'unsupported_type' && /audio\/webm/.test(e.message), 'the server refusal text reaches the page');
    assert.deepEqual(calls.map((c) => c[0] + ' ' + c[1]), [
      'GET chat/api/stores',
      'GET chat/api/stores/spain/arias/gone/turns?before=9&limit=20',
      'GET chat/api/stores/spain/arias?before=30&limit=30',
      'POST chat/api/stores/s%201/arias/a%2Fb/send',
      'POST chat/api/stores/spain/arias/a/cancel',
      'POST chat/api/stores/spain/arias',
      'GET chat/audio/zz',
      'POST chat/api/clips'
    ]);
    assert.equal(calls[3][2], '{"text":"hi"}');
    assert.equal(calls[3][3]['Content-Type'], 'application/json');
    assert.equal(calls[5][2], '{"fork_of":"a"}');
    assert.equal(calls[6][3].Range, 'bytes=0-0');
    assert.deepEqual([calls[7][2], calls[7][3]['Content-Type']], [blob, 'audio/mp4'], 'a clip goes up as recorded, typed as recorded');
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
