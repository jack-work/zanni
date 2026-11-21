'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const nodi = require('../assets/nodi/nodi.js');

let failed = 0;
async function test(name, fn) {
  try { await fn(); process.stdout.write('ok   ' + name + '\n'); } catch (e) { failed++; process.stdout.write('FAIL ' + name + '\n' + (e && e.stack || e) + '\n'); }
}

(async () => {
  const msg = (turn, nodes, extra) => Object.assign({ turn, from: 0, role: 'output', nodes }, extra || {});

  await test('model: a turn becomes input, nodes in order, then an end only when it says something', () => {
    const m = nodi.model({ closed: [msg(3, [
      { type: 'thinking', markdown: 't' },
      { type: 'prose', markdown: 'p' },
      { type: 'tool', name: 'bash', status: 'ok', output: 'x', args: { a: 1 } }
    ], { inquiry: 'hi' })] }, {});
    assert.strictEqual(m.length, 1);
    assert.deepStrictEqual(m[0].items.map((i) => i.kind + ':' + i.key), ['thinking:n0', 'prose:n1', 'tool:n2']);
    assert.strictEqual(m[0].end, null);
    assert.strictEqual(m[0].open, false);
    assert.strictEqual(m[0].items[2].args, JSON.stringify({ a: 1 }, null, 2));
    assert.ok(m[0].items.every((i) => i.settled));
  });

  await test('model: error and interrupted ends are kept, a plain stop is not', () => {
    const one = (done) => nodi.model({ closed: [msg(1, [{ type: 'prose', markdown: 'x' }], { inquiry: 'q' })] }, { 1: done })[0].end;
    assert.deepStrictEqual(one({ reason: 'error: gateway: HTTP 400' }), { kind: 'error', text: 'gateway: HTTP 400' });
    assert.deepStrictEqual(one({ reason: 'interrupted' }), { kind: 'end', text: 'interrupted' });
    assert.strictEqual(one({ reason: 'stop' }), null);
  });

  await test('model: who sent an input decides how it reads', () => {
    assert.deepStrictEqual(nodi.who(undefined, undefined), { role: 'you', label: 'You' });
    assert.deepStrictEqual(nodi.who('', 'Gluck'), { role: 'you', label: 'Gluck' });
    assert.deepStrictEqual(nodi.who('c0ffee02c0ffee02c0ffee02c0ffee02', 'Il Zanni'), { role: 'aria', label: 'Il Zanni' });
    assert.deepStrictEqual(nodi.who('c0ffee02c0ffee02c0ffee02c0ffee02'), { role: 'aria', label: 'c0ffee02' });
    assert.deepStrictEqual(nodi.who('king', 'the King'), { role: 'caller', label: 'the King' });
    const m = nodi.model({ closed: [{ turn: 1, from: 0, role: 'input', nodes: [], inquiry: 'a\n\nb', inquirySegments: [{ sender: 'king', name: 'the King', text: 'a' }, { text: 'b' }] }] })[0];
    assert.deepStrictEqual(m.input.parts.map((p) => p.role), ['caller', 'you']);
  });

  await test('model: unknown node types become labelled items, never dropped', () => {
    const m = nodi.model({ closed: [msg(1, [{ type: 'sparkle', markdown: 'shiny' }, { type: 'hologram' }, {}])] })[0];
    assert.deepStrictEqual(m.items.map((i) => i.kind), ['unknown', 'unknown', 'unknown']);
    assert.deepStrictEqual(m.items.map((i) => i.type), ['sparkle', 'hologram', 'unnamed']);
    assert.strictEqual(m.items[0].text, 'shiny');
  });

  await test('model: a question with no nodes yet is a turn with an input and nothing else', () => {
    const m = nodi.model({ closed: [], open: { turn: 4, from: 0, role: 'input', inquiry: 'asked', nodes: [] } })[0];
    assert.strictEqual(m.items.length, 0);
    assert.strictEqual(m.open, true);
    assert.strictEqual(m.input.parts[0].text, 'asked');
  });

  await test('view: closed and open messages of one turn draw as one turn, the open suffix unsettled', () => {
    const view = {
      closed: [msg(7, [{ type: 'thinking', markdown: 'm' }, { type: 'prose', markdown: 'done part' }], { inquiry: 'q', inquirySegments: [{ sender: 'king', name: 'the King', text: 'q' }] })],
      open: { turn: 7, from: 2, role: 'output', nodes: [{ type: 'prose', markdown: 'still going' }] }
    };
    const m = nodi.model(view, {});
    assert.strictEqual(m.length, 1);
    assert.strictEqual(m[0].open, true);
    assert.deepStrictEqual(m[0].items.map((i) => [i.kind, i.node, i.settled]), [['thinking', 0, true], ['prose', 1, true], ['prose', 2, false]]);
    assert.deepStrictEqual(m[0].input.parts.map((p) => p.role + ':' + p.label), ['caller:the King']);
  });

  await test('view: a long turn split into slices keeps node numbers by from', () => {
    const m = nodi.model({ closed: [msg(2, [{ type: 'prose', markdown: 'a' }, { type: 'prose', markdown: 'b' }], { inquiry: 'q' }), { turn: 2, from: 2, role: 'output', nodes: [{ type: 'prose', markdown: 'c' }] }] })[0];
    assert.deepStrictEqual(m.items.map((i) => [i.node, i.text]), [[0, 'a'], [1, 'b'], [2, 'c']]);
  });

  await test('markdown: a GFM table is a block with alignment, escaped pipes and code kept whole, and a short row is padded', () => {
    const b = nodi.blocks('| a | b | c |\n|---|:-:|--:|\n| 1 | 2 |\n| x \\| y | `p|q` | z |\n\nafter');
    assert.deepStrictEqual(b.map((x) => x.kind), ['table', 'p']);
    assert.deepStrictEqual(b[0].align, ['', 'center', 'right']);
    assert.deepStrictEqual(b[0].head, ['a', 'b', 'c']);
    assert.deepStrictEqual(b[0].rows, [['1', '2', ''], ['x | y', '`p|q`', 'z']]);
    assert.deepStrictEqual(nodi.blocks('a | b\nnot a delimiter').map((x) => x.kind), ['p'], 'a header with no delimiter row is a paragraph');
    assert.deepStrictEqual(nodi.blocks('| a |\n|---|\n| 1 |\n```\ncode\n```').map((x) => x.kind), ['table', 'code'], 'a fence ends the table');
  });

  await test('markdown: while a reply streams, a half-typed row or delimiter stays out and an open fence shows as code', () => {
    const typing = nodi.blocks('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | ', true);
    assert.deepStrictEqual(typing[0].rows, [['1', '2']], 'the row being typed waits for its line to end');
    assert.strictEqual(nodi.blocks('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |', false)[0].rows.length, 2, 'a settled message keeps its last row');
    assert.deepStrictEqual(nodi.blocks('| a | b |\n|--', true).map((x) => x.kind), ['p'], 'a delimiter being typed is not shown as text');
    assert.deepStrictEqual(nodi.blocks('| a | b |\n|---|---|\n', true).map((x) => x.kind), ['table']);
    const fence = nodi.blocks('text\n\n```go\nfmt.Println(', true);
    assert.deepStrictEqual(fence.map((x) => x.kind), ['p', 'code']);
    assert.strictEqual(fence[1].open, true);
  });

  await test('markdown: appending re-parses only the last block, equals a fresh parse at every prefix, and keeps settled blocks as the same objects', () => {
    const full = '# Title\n\nSome text here.\n\n- one\n- two\n\n```go\nfmt.Println(1)\n```\n\n| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |\n| x | y | z |\n\nafter the table\n';
    const st = nodi.streamState();
    let before = [];
    for (let k = 1; k <= full.length; k++) {
      const live = k < full.length;
      const got = nodi.stream(st, full.slice(0, k), live);
      assert.deepStrictEqual(got, nodi.blocks(full.slice(0, k), live), 'prefix ' + k);
      for (let i = 0; i < before.length - 1; i++) assert.strictEqual(got[i], before[i], 'block ' + i + ' keeps its identity at prefix ' + k);
      before = got;
    }
    const again = nodi.stream(st, 'different start', false);
    assert.deepStrictEqual(again, nodi.blocks('different start', false), 'text that is not an extension starts over');
  });

  await test('metrics line is short and says when the context is a guess', () => {
    assert.strictEqual(nodi.metricsLine({ context_tokens: 12345, context_exact: false, tokens_in: 800, tokens_out: 1500000, cache_read_tokens: 0, cache_write_tokens: 0 }), 'ctx ~12.3k \u00b7 in 800 \u00b7 out 1.5M');
    assert.strictEqual(nodi.metricsLine(undefined), '');
  });

  await test('sinks: neither nodi nor the speech transport writes server text through an HTML sink or an inline handler', () => {
    const root = path.join(__dirname, '..', 'assets');
    const files = ['nodi/nodi.js', 'figchat/speech.js'];
    const bad = /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|setAttribute\(\s*['"](?:on|style)|\.style\.|srcdoc|createContextualFragment|DOMParser/;
    files.forEach((f) => {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      assert.ok(!bad.test(src), f + ' contains a sink: ' + (bad.exec(src) || [])[0]);
    });
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
