'use strict';
const fs = require('fs');
const path = require('path');

const FACES = {
  display: [{ family: 'Jacquard 24', style: 'normal', weight: '400', file: 'jacquard-24.woff2' }],
  prose: [
    { family: 'EB Garamond', style: 'normal', weight: '400 600', file: 'eb-garamond.woff2' },
    { family: 'EB Garamond', style: 'italic', weight: '400', file: 'eb-garamond-italic.woff2' },
  ],
  mono: [{ family: 'VT323', style: 'normal', weight: '400', file: 'vt323.woff2' }],
};

function faces(list) {
  const names = (list || 'display,prose,mono').split(',').map((s) => s.trim()).filter(Boolean);
  for (const n of names) {
    if (!FACES[n]) throw new Error('fontpack.faces: no face ' + n + ' (have: ' + Object.keys(FACES).join(', ') + ')');
  }
  return names;
}

function defs(overrides = {}) {
  for (const k of Object.keys(overrides)) {
    if (k !== 'faces') throw new Error('fontpack has no knob ' + k + ' (have: faces)');
  }
  const rules = faces(overrides.faces).flatMap((n) => FACES[n]).map((f) => {
    const b64 = fs.readFileSync(path.join(__dirname, 'fonts', f.file)).toString('base64');
    return "@font-face { font-family: '" + f.family + "'; font-style: " + f.style + '; font-weight: ' + f.weight +
      "; font-display: swap; src: url(data:font/woff2;base64," + b64 + ") format('woff2'); }";
  });
  return '<style>\n' + rules.join('\n') + '\n</style>';
}

function stylesheet(base = 'fonts/') {
  return Object.values(FACES).flat().map((f) =>
    "@font-face { font-family: '" + f.family + "'; font-style: " + f.style + '; font-weight: ' + f.weight +
    "; font-display: swap; src: url(" + base + f.file + ") format('woff2'); }").join('\n') + '\n';
}

module.exports = { defs, stylesheet, FACES };

if (require.main === module) process.stdout.write(stylesheet(process.argv[2]));
