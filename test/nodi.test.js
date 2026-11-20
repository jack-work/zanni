'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const nodi = require('../assets/nodi/nodi.js');
const A = require('../assets/aria/aria.js');
const mock = require('../examples/aria-mock.js');

let failed = 0;
async function test(name, fn) {
  try { await fn(); process.stdout.write('ok   ' + name + '\n'); } catch (e) { failed++; process.stdout.write('FAIL ' + name + '\n' + (e && e.stack || e) + '\n'); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms) {
  const end = Date.now() + (ms || 8000);
  while (Date.now() < end) { if (fn()) return; await wait(10); }
  throw new Error('timed out waiting: ' + fn);
}

function clientFor(core) {
  return new A.AriaClient({ dial: core.dial, retryMinMs: 20, retryMaxMs: 60, pageBytes: 3000 });
}

(async () => {
  await test('model: a turn becomes input, nodes in order, then an end only when it says something', () => {
    const m = nodi.model([{
      turn: 3, sealed: true,
      input: { text: 'hi', segments: [{ text: 'hi' }], at: 1 },
      nodes: [
        { kind: 'thinking', node: 0, text: 't', settled: true },
        { kind: 'prose', node: 1, text: 'p', settled: false },
        { kind: 'tool', node: 2, settled: true, tool: { node: 2, status: 'ok', output: 'x', outputBase: 0, name: 'bash', args: { a: 1 } } }
      ],
      end: { failed: false }
    }]);
    assert.strictEqual(m.length, 1);
    assert.deepStrictEqual(m[0].items.map((i) => i.kind + ':' + i.key), ['thinking:n0', 'prose:n1', 'tool:n2']);
    assert.strictEqual(m[0].end, null);
    assert.strictEqual(m[0].items[2].args, JSON.stringify({ a: 1 }, null, 2));
  });

  await test('model: error and interrupted ends are kept, a plain stop is not', () => {
    const one = (end) => nodi.model([{ turn: 1, sealed: true, nodes: [], end }])[0].end;
    assert.deepStrictEqual(one({ failed: true, reason: 'error: gateway: HTTP 400' }), { kind: 'error', text: 'gateway: HTTP 400' });
    assert.deepStrictEqual(one({ failed: false, reason: 'interrupted' }), { kind: 'end', text: 'interrupted' });
    assert.strictEqual(one({ failed: false, reason: 'stop' }), null);
  });

  await test('model: who sent an input decides how it reads', () => {
    assert.deepStrictEqual(nodi.who(undefined, undefined), { role: 'you', label: 'You' });
    assert.deepStrictEqual(nodi.who('', 'Gluck'), { role: 'you', label: 'Gluck' });
    assert.deepStrictEqual(nodi.who('c0ffee02c0ffee02c0ffee02c0ffee02', 'Il Zanni'), { role: 'aria', label: 'Il Zanni' });
    assert.deepStrictEqual(nodi.who('c0ffee02c0ffee02c0ffee02c0ffee02'), { role: 'aria', label: 'c0ffee02' });
    assert.deepStrictEqual(nodi.who('king', 'the King'), { role: 'caller', label: 'the King' });
    const m = nodi.model([{ turn: 1, sealed: true, nodes: [], input: { text: 'a\n\nb', segments: [{ sender: 'king', senderName: 'the King', text: 'a' }, { text: 'b' }] } }])[0];
    assert.deepStrictEqual(m.input.parts.map((p) => p.role), ['caller', 'you']);
  });

  await test('model: unknown node kinds become labelled items, never dropped', () => {
    const m = nodi.model([{ turn: 1, sealed: false, nodes: [
      { kind: 'unknown', node: 0, type: 'sparkle', text: 'shiny', settled: true },
      { kind: 'hologram', node: 1, settled: false },
      { node: 2 }
    ] }])[0];
    assert.deepStrictEqual(m.items.map((i) => i.kind), ['unknown', 'unknown', 'unknown']);
    assert.deepStrictEqual(m.items.map((i) => i.type), ['sparkle', 'hologram', 'unnamed']);
    assert.strictEqual(m.items[0].text, 'shiny');
  });

  await test('metrics line is short and says when the context is a guess', () => {
    assert.strictEqual(nodi.metricsLine({ context_tokens: 12345, context_exact: false, tokens_in: 800, tokens_out: 1500000, cache_read_tokens: 0, cache_write_tokens: 0 }), 'ctx ~12.3k \u00b7 in 800 \u00b7 out 1.5M');
    assert.strictEqual(nodi.metricsLine(undefined), '');
  });

  await test('events: a delta replaces the node text, a re-sent node at the cursor does not repeat it', () => {
    const s = nodi.events();
    s.apply({ type: 'input', kind: 'input', turn: 5, text: 'q', segments: [{ text: 'q' }] });
    s.apply({ type: 'prose.delta', kind: 'prose', turn: 5, node: 0, text: 'He', at: 0, del: 0, ins: 'He' });
    s.apply({ type: 'prose.delta', kind: 'prose', turn: 5, node: 0, text: 'Hello', at: 2, del: 0, ins: 'llo' });
    s.apply({ type: 'prose.delta', kind: 'prose', turn: 5, node: 0, text: 'Hello', at: 0, del: 0, ins: 'Hello' });
    let t = s.turns();
    assert.strictEqual(t.length, 1);
    assert.strictEqual(t[0].nodes.length, 1);
    assert.strictEqual(t[0].nodes[0].text, 'Hello');
    assert.strictEqual(t[0].nodes[0].settled, false);
    s.apply({ type: 'prose.settled', kind: 'prose', turn: 5, node: 0, text: 'Hello!' });
    s.apply({ type: 'turn.end', kind: 'turn', turn: 5, replayed: false, reason: 'stop' });
    t = s.turns();
    assert.strictEqual(t[0].nodes[0].text, 'Hello!');
    assert.strictEqual(t[0].nodes[0].settled, true);
    assert.deepStrictEqual(t[0].end, { reason: 'stop', idle: undefined, failed: false });
  });

  await test('events: turns sort by number whatever order they arrive in', () => {
    const s = nodi.events();
    [9, 7, 8].forEach((n) => s.apply({ type: 'input', kind: 'input', turn: n, text: 'q' + n, segments: [] }));
    assert.deepStrictEqual(s.turns().map((t) => t.turn), [7, 8, 9]);
  });

  await test('events: an event kind nobody planned for lands as an unknown node', () => {
    const s = nodi.events();
    s.apply({ type: 'hologram.settled', kind: 'hologram', turn: 2, node: 4, text: 'beam' });
    const n = s.turns()[0].nodes[0];
    assert.strictEqual(n.kind, 'unknown');
    assert.strictEqual(n.node, 4);
    assert.strictEqual(n.text, 'beam');
    assert.strictEqual(s.skipped, 1);
    assert.strictEqual(s.apply(null), false);
  });

  await test('stream: the tail read pages back through older turns in order, no duplicates', async () => {
    const core = mock.create({ step: 1 });
    const c = clientFor(core);
    const st = c.attach(core.ids.main);
    await st.ready();
    let snap = st.snapshot();
    assert.ok(snap.turns.length >= 1 && snap.turns.length < 26, 'one byte-budget page, not the whole transcript');
    assert.strictEqual(snap.turns[snap.turns.length - 1].turn, 26);
    assert.strictEqual(snap.olderAvailable, true);
    let pages = 0;
    while (await st.loadOlder()) pages++;
    snap = st.snapshot();
    assert.ok(pages >= 3);
    assert.deepStrictEqual(snap.turns.map((t) => t.turn), Array.from({ length: 26 }, (_, i) => i + 1));
    assert.strictEqual(snap.olderAvailable, false);
    c.close();
  });

  await test('stream: an unknown node in history reaches the view model', async () => {
    const core = mock.create({ step: 1 });
    const c = clientFor(core);
    const st = c.attach(core.ids.main);
    await st.ready();
    while (await st.loadOlder());
    const items = nodi.model(st.snapshot().turns).find((t) => t.turn === 6).items;
    const u = items.find((i) => i.kind === 'unknown');
    assert.ok(u, 'turn 6 carries a sparkle node');
    assert.strictEqual(u.type, 'sparkle');
    c.close();
  });

  await test('stream: a drop in the middle of a turn loses nothing and repeats nothing', async () => {
    const core = mock.create({ step: 4 });
    const c = clientFor(core);
    const st = c.attach(core.ids.main);
    await st.ready();
    const seen = [];
    const store = nodi.events();
    st.subscribe((e) => { seen.push(e); store.apply(e); });
    await st.prompt('please run the tests [drop]');
    await until(() => seen.some((e) => e.type === 'turn.end' && e.turn === 27));
    assert.ok(core.dropped >= 1, 'the door really dropped the connection');
    const once = {};
    seen.forEach((e) => {
      if (!/settled$|^tool\.end$|^input$|^turn\./.test(e.type)) return;
      const k = e.type + ':' + e.turn + ':' + (e.node != null ? e.node : e.tool ? e.tool.node : '');
      once[k] = (once[k] || 0) + 1;
    });
    Object.keys(once).forEach((k) => assert.strictEqual(once[k], 1, k + ' was told more than once'));
    const fresh = clientFor(core);
    const other = fresh.attach(core.ids.main);
    await other.ready();
    const mine = nodi.model(st.snapshot().turns).filter((t) => t.turn === 27)[0];
    const theirs = nodi.model(other.snapshot().turns).filter((t) => t.turn === 27)[0];
    assert.deepStrictEqual(mine.items, theirs.items);
    const fromEvents = nodi.model(store.turns()).filter((t) => t.turn === 27)[0];
    assert.deepStrictEqual(fromEvents.items.map((i) => [i.kind, i.text]), mine.items.map((i) => [i.kind, i.text]));
    assert.deepStrictEqual(mine.items.map((i) => i.kind), ['thinking', 'prose', 'tool', 'prose']);
    assert.ok(mine.items.every((i) => i.settled));
    c.close();
    fresh.close();
  });

  await test('stream: a message sent while a turn runs is folded in as steering', async () => {
    const core = mock.create({ step: 4 });
    const c = clientFor(core);
    const st = c.attach(core.ids.main);
    await st.ready();
    await st.prompt('run the build');
    await wait(30);
    const r = await st.prompt('also mind the dark theme');
    assert.strictEqual(r.active, true);
    await until(() => !core.running(core.ids.main), 8000);
    await until(() => st.snapshot().turns.slice(-1)[0].end);
    const t = nodi.model(st.snapshot().turns).slice(-1)[0];
    assert.ok(t.items.some((i) => i.kind === 'steering' && i.text === 'also mind the dark theme'), JSON.stringify(t.items.map((i) => i.kind)));
    c.close();
  });

  await test('stream: a failed turn ends in an error the view model keeps', async () => {
    const core = mock.create({ step: 2 });
    const c = clientFor(core);
    const st = c.attach(core.ids.main);
    await st.ready();
    await st.prompt('[error] now');
    await until(() => (st.snapshot().turns.slice(-1)[0] || {}).end);
    const t = nodi.model(st.snapshot().turns).slice(-1)[0];
    assert.strictEqual(t.end.kind, 'error');
    assert.ok(/refused on purpose/.test(t.end.text));
    c.close();
  });

  await test('sinks: no file of the shell writes server text through an HTML sink or an inline handler', () => {
    const root = path.join(__dirname, '..', 'assets');
    const files = ['nodi/nodi.js', 'figchat/figchat.js', 'figchat/speech.js', 'figchat/boot.js'];
    const bad = /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|setAttribute\(\s*['"](?:on|style)|\.style\.|srcdoc|createContextualFragment|DOMParser/;
    files.forEach((f) => {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      assert.ok(!bad.test(src), f + ' contains a sink: ' + (bad.exec(src) || [])[0]);
    });
    const page = fs.readFileSync(path.join(root, 'figchat/index.html'), 'utf8');
    assert.ok(!/<script(?![^>]*\bsrc=)/.test(page), 'inline script');
    assert.ok(!/\sstyle=|\son[a-z]+=/.test(page), 'inline style or handler');
  });

  await test('sinks: nodi has exactly one function that writes text into the page', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'assets/nodi/nodi.js'), 'utf8');
    const writes = src.match(/createTextNode|\.textContent\s*=|\.appendData|\.innerText/g) || [];
    assert.strictEqual(writes.filter((w) => w === 'createTextNode').length, 1);
    assert.strictEqual(writes.filter((w) => /textContent/.test(w)).length, 1, 'one control-mark label');
  });

  process.stdout.write(failed ? failed + ' failed\n' : 'nodi: all passed\n');
  process.exit(failed ? 1 : 0);
})();
