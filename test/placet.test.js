'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const placet = require('../assets/placet/placet.js');

const root = path.join(__dirname, '..');
const now = Date.parse('2026-11-19T18:00:00Z');

assert.deepEqual(
  placet.reveal('a\u202eb\u200bc\u0000d\u0007e').map((p) => p.mark || p.plain),
  ['a', 'U+202E', 'b', 'U+200B', 'c', 'U+0000', 'd', 'U+0007', 'e'],
  'bidi, zero width and C0 controls are shown, not obeyed'
);
assert.deepEqual(placet.reveal('tab\there\nnewline').map((p) => p.plain), ['tab\there\nnewline'], 'tab and newline are text, not controls');
assert.deepEqual(placet.reveal(''), []);
assert.deepEqual(placet.reveal(null), []);

assert.equal(placet.relative(now - 1, now), 'expired');
assert.equal(placet.relative(now + 30000, now), 'expires in under a minute');
assert.equal(placet.relative(now + 20 * 60000, now), 'expires in 20 min');
assert.equal(placet.relative(now + 3 * 3600000, now), 'expires in 3 h');
assert.equal(placet.relative(now + 5 * 86400000, now), 'expires in 5 d');

const at = (h) => new Date(now + h * 3600000).toISOString();
const sorted = placet.sortRequests([
  { filing: 'b', id: '2', expires: at(5) },
  { filing: 'a', id: '1', expires: 'garbage' },
  { filing: 'a', id: '3', expires: at(1) },
  { filing: 'a', id: '0', expires: at(5) }
]).map((r) => r.filing + r.id);
assert.deepEqual(sorted, ['a3', 'a0', 'b2', 'a1'], 'soonest expiry first, unreadable expiry last, ties by key');

assert.equal(placet.stateWord({ refusal: 'x', applied: true }), 'deny only');
assert.equal(placet.stateWord({ applied: true }), 'already applied');
assert.equal(placet.stateWord({}), 'ready');

assert.equal(placet.delta({ op: 'set', current: '4', new: '8' }), '4 to 8');
assert.equal(placet.delta({ op: 'set', current: '["a","b"]', new: '["b","c"]' }), 'adds "c"; removes "a"');
assert.equal(placet.delta({ op: 'set', current: '["a"]', new: '["a"]' }), 'no change');
assert.equal(placet.delta({ op: 'set', current: '"x"', new: '"y"' }), '');
assert.equal(placet.delta({ op: 'set', new: '1' }), '');
assert.equal(placet.delta({ op: 'remove', key: 'elicit.x' }), '');

assert.equal(placet.routeFor('@96447061', 'r7f3a'), '#/r/%4096447061/r7f3a');
assert.deepEqual(placet.parseRoute('#/r/%4096447061/r7f3a'), { filing: '@96447061', id: 'r7f3a' });
assert.equal(placet.parseRoute('#/r/a/b/c'), null);
assert.equal(placet.parseRoute('#/r/%E0%A4%A/x'), null, 'a malformed escape is no route');
assert.equal(placet.parseRoute(''), null);

const base = { hash: 'h', lines: [{ op: 'set', key: 'k', new: '1' }], reason: 'r', raw: '' };
assert.equal(placet.patchSignature(base), placet.patchSignature(Object.assign({}, base, { version: 9, token: 'other' })), 'a version or token bump alone is not a changed patch');
for (const change of [{ hash: 'h2' }, { reason: 'r2' }, { applied: true }, { refusal: 'no' }, { lines: [{ op: 'set', key: 'k', new: '2' }] }, { expires: 'later' }]) {
  assert.notEqual(placet.patchSignature(base), placet.patchSignature(Object.assign({}, base, change)), 'a change to ' + Object.keys(change)[0] + ' is a changed patch');
}

const forbidden = [/innerHTML/, /insertAdjacentHTML/, /outerHTML/, /document\.write/, /\beval\s*\(/, /new\s+Function/, /setAttribute\(\s*['"]style/, /\.style\b/, /srcdoc/, /\.cssText/, /createContextualFragment/, /DOMParser/, /\bon[a-z]+\s*=/, /setTimeout\(\s*['"]/, /import\(/];
for (const rel of ['assets/placet/placet.js', 'assets/placet/boot.js']) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8').replace(/'[^'\n]*'|"[^"\n]*"/g, "''");
  for (const re of forbidden) assert.ok(!re.test(text), rel + ' uses ' + re);
}
const page = fs.readFileSync(path.join(root, 'assets/placet/index.html'), 'utf8');
assert.ok(!/<script(?![^>]*\ssrc=)/i.test(page), 'no inline script');
assert.ok(!/<style/i.test(page) && !/\sstyle=/i.test(page), 'no inline style');
assert.ok(!/\son[a-z]+=/i.test(page), 'no inline handler');
assert.ok(!/https?:\/\//.test(page.replace(/<noscript>[\s\S]*?<\/noscript>/, '')), 'no external URL');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'placet-'));
execFileSync(process.execPath, [path.join(root, 'bin/placet-bundle'), out], { stdio: 'pipe' });
const listed = fs.readFileSync(path.join(out, 'SHA256SUMS'), 'utf8').trim().split('\n').map((l) => l.split('  '));
assert.deepEqual(listed.map((l) => l[1]).sort(), ['boot.js', 'figaro-head.png', 'fonts.css', 'fonts/eb-garamond-italic.woff2', 'fonts/eb-garamond.woff2', 'fonts/jacquard-24.woff2', 'index.html', 'placet.css', 'placet.js', 'rotolo.css', 'z2-tokens.css']);
for (const [sum, file] of listed) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(out, file))).digest('hex'), sum, file);
for (const file of ['placet.css', 'fonts.css', 'rotolo.css', 'z2-tokens.css']) {
  const css = fs.readFileSync(path.join(out, file), 'utf8');
  assert.ok(!/url\(\s*['"]?(https?:|\/\/)/.test(css) && !/@import/.test(css), file + ' fetches nothing off-origin');
}
for (const name of fs.readdirSync(out)) assert.ok(!/\.map$/.test(name));
assert.equal(fs.readFileSync(path.join(out, 'placet.js'), 'utf8'), fs.readFileSync(path.join(root, 'assets/placet/placet.js'), 'utf8'));
console.log('placet: pure rules, forbidden sinks, page hygiene and the reviewed bundle pass');
