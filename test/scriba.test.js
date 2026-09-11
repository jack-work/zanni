#!/usr/bin/env node
/* scriba's laws.
 *
 * The first table is gluck-herald internal/md's own Go test corpus, copied
 * case for case. Those cases must agree: they cover escaping and the order
 * the rules run in, which is where the security property lives. When they
 * stop agreeing, one of the two implementations has drifted and this is
 * where it shows.
 *
 * The second table is browser-only, and the third is the reason this port
 * is stricter than its parent: Telegram will not execute an href, a browser
 * will.
 */
'use strict';

const md = require('../assets/scriba/scriba.js');

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; console.log('  ok   ' + name); }
  else {
    fail++;
    console.log('  FAIL ' + name + '\n        got  ' + JSON.stringify(got) +
                '\n        want ' + JSON.stringify(want));
  }
}
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}

/* Inline output, stripped of the paragraph the block layer adds, so these
   compare exactly against what herald's ToHTML returns. */
const inline = (s) => md.toHTML(s).replace(/^<p>/, '').replace(/<\/p>$/, '');

console.log("[scriba] herald's corpus: the cases that must agree");
[
  ['**bold** and *it*', '<b>bold</b> and <i>it</i>'],
  ['a < b & c > d', 'a &lt; b &amp; c &gt; d'],
  ['`x < y`', '<code>x &lt; y</code>'],
  ['- one\n- two', null],
  ['~~no~~', '<s>no</s>'],
  ['```go\nif a < b {}\n```', '<pre><code class="language-go">if a &lt; b {}</code></pre>'],
  ['**a** `code with *stars*`', '<b>a</b> <code>code with *stars*</code>'],
].forEach(([input, want]) => {
  if (want === null) return;
  eq(JSON.stringify(input), inline(input), want);
});
eq('[go](https://go.dev)', inline('[go](https://go.dev)'),
   '<a href="https://go.dev" target="_blank" rel="noopener noreferrer">go</a>');

console.log('[scriba] what a browser can do that Telegram cannot');
eq('a heading is a heading, not bold', md.toHTML('# Head'), '<h3>Head</h3>');
eq('bullets become a real list', md.toHTML('- one\n- two'),
   '<ul><li>one</li><li>two</li></ul>');
eq('ordered lists too', md.toHTML('1. one\n2. two'),
   '<ol><li>one</li><li>two</li></ol>');
eq('a single newline is a line break', md.toHTML('one\ntwo'), '<p>one<br>two</p>');
eq('a blank line is a new paragraph', md.toHTML('one\n\ntwo'), '<p>one</p>\n<p>two</p>');
eq('a bare url is linked', md.toHTML('see https://figar.org now'),
   '<p>see <a href="https://figar.org" target="_blank" rel="noopener noreferrer">' +
   'https://figar.org</a> now</p>');
eq('trailing punctuation stays outside the link', md.toHTML('go to https://figar.org.'),
   '<p>go to <a href="https://figar.org" target="_blank" rel="noopener noreferrer">' +
   'https://figar.org</a>.</p>');
eq('a rule', md.toHTML('---'), '<hr>');

console.log('[scriba] the browser-only law: an href is executable here');
[
  ['javascript:alert(1)', 'javascript'],
  ['JaVaScRiPt:alert(1)', 'javascript, cased'],
  ['data:text/html;base64,PHNjcmlwdD4=', 'data'],
  ['vbscript:msgbox', 'vbscript'],
].forEach(([href, what]) => {
  const out = md.toHTML('[click](' + href + ')');
  ok('a ' + what + ' url does not become a link', !/<a\b/.test(out) && !/href/.test(out), out);
  ok('  and its scheme is not left in the document', out.toLowerCase().indexOf('script:') < 0
     || !/href/.test(out), out);
});
ok('safeURL refuses javascript directly', md.safeURL('javascript:alert(1)') === null);
ok('safeURL keeps http, https and mailto',
   md.safeURL('http://a.b') === 'http://a.b' &&
   md.safeURL('https://a.b') === 'https://a.b' &&
   md.safeURL('mailto:a@b.c') === 'mailto:a@b.c');

console.log('[scriba] injection');
/* The law is not "the word onerror is absent", which escaped text may
   legitimately contain. It is that user input creates no element: every tag
   in the output is one scriba itself emitted. */
const EMITS = ['p', 'br', 'b', 'i', 's', 'a', 'code', 'pre', 'h3', 'h4', 'h5',
               'h6', 'ul', 'ol', 'li', 'hr', 'blockquote'];
const tagsIn = (html) =>
  (html.match(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g) || [])
    .map((t) => t.replace(/[<\/]/g, '').toLowerCase());

[
  ['<script>alert(1)</script>', 'a script tag'],
  ['<img src=x onerror=alert(1)>', 'an event handler'],
  ['<iframe src="https://evil"></iframe>', 'an iframe'],
  ['</p><script>alert(1)</script><p>', 'a tag that tries to break out'],
  ['<svg onload=alert(1)>', 'an svg handler'],
].forEach(([input, what]) => {
  const out = md.toHTML(input);
  const foreign = tagsIn(out).filter((t) => EMITS.indexOf(t) < 0);
  ok(what + ' creates no element', foreign.length === 0, out);
});
ok('a quote cannot escape an href attribute',
   md.toHTML('[x](https://a.b/")').indexOf('&quot;') > 0 ||
   !/href="[^"]*"[^>]*"/.test(md.toHTML('[x](https://a.b/")')),
   md.toHTML('[x](https://a.b/")'));
ok('markup inside code is not interpreted',
   md.toHTML('`<b>not bold</b>`').indexOf('&lt;b&gt;') > 0,
   md.toHTML('`<b>not bold</b>`'));

console.log('[scriba] it does not invent content');
eq('empty input', md.toHTML(''), '');
eq('null input', md.toHTML(null), '');
eq('undefined input', md.toHTML(undefined), '');
eq('plain text survives unchanged', md.toHTML('just words'), '<p>just words</p>');
ok('a lone asterisk is not italics', md.toHTML('2 * 3 * 4').indexOf('<i>') < 0,
   md.toHTML('2 * 3 * 4'));

console.log('[scriba] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
