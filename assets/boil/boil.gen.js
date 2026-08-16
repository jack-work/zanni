/* zanni · boil — the filter defs, generated.
 *
 * These used to be a static SVG file. They are generated now for two reasons,
 * both measured rather than assumed (see docs/boil.md § What it costs):
 *
 *  1. KNOBS. SVG filter primitive attributes — scale, baseFrequency,
 *     stdDeviation — are XML attributes, NOT CSS properties. `var()` in them
 *     does not resolve; Chrome reads an invalid number and falls back to 0,
 *     silently unfiltered. So a filter cannot be tuned from a stylesheet at
 *     runtime, and the only honest places to put a knob are the build step
 *     (`--set boil.text.scale=2`) and the class (a variant filter per
 *     intensity). This module serves both from one source.
 *
 *  2. THE DRIVER. A SMIL <animate> on the filter keeps the filtered subtree
 *     perpetually dirty: Chrome re-rasterises it EVERY FRAME, whether or not
 *     the discrete seed actually changed. Measured: dur=20s costs the same as
 *     dur=0.3s, and both cost ~11x a JS driver writing the same six seeds at
 *     the same 5Hz. So the default driver is JS, and SMIL is kept as an
 *     escape hatch for pages that must animate without script.
 */
'use strict';

const DEFAULTS = {
  driver: 'js',            // 'js' (cheap, needs boil.js) | 'smil' (no script)
  text:  { freq: 0.9, scale: 1.2, dur: 1200, blur: 0.4, alpha: '0 0.2 1 1 1',
           seeds: [3, 7, 13, 5, 11, 3],  region: [-6, -14, 112, 128] },
  stage: { freq: 0.9, scale: 1.4, dur: 1600, blur: 0,   alpha: null,
           seeds: [7, 3, 12, 5, 9, 7],   region: [-2, -2, 104, 104] },
  ui:    { freq: 0.9, scale: 0.9, dur: 1400, blur: 0,   alpha: null,
           seeds: [11, 4, 9, 14, 6, 11], region: [-3, -3, 106, 106] },
};

/* Named intensities, selectable at runtime by class. baseFrequency is the
 * wavelength of the noise: HIGH means the displacement is uncorrelated
 * pixel-to-pixel and reads as fuzz or erosion; LOW means neighbouring pixels
 * move together and whole strokes bend, which is what "line boil" and
 * Squigglevision actually are. Measured cost difference between these and the
 * default: about 5%. The intensity is nearly free; only AREA and whether it
 * animates at all are expensive. */
const VARIANTS = {
  '':         {},                                  // as figar.org ships
  'squiggle': { freq: 0.05, scale: 3.0 },          // strokes visibly bend
  'strong':   { freq: 0.05, scale: 6.0 },          // theatrical; test legibility
};

const num = (v) => (typeof v === 'number' ? v : parseFloat(v));

function filter(id, p, driver) {
  const [x, y, w, h] = p.region;
  const anim = driver === 'smil'
    ? `\n      <animate attributeName="seed" values="${p.seeds.join(';')}"` +
      ` dur="${(p.dur / 1000)}s" repeatCount="indefinite" calcMode="discrete"/>`
    : '';
  const head =
    `  <filter id="${id}" x="${x}%" y="${y}%" width="${w}%" height="${h}%">\n` +
    `    <feTurbulence type="fractalNoise" baseFrequency="${p.freq}" numOctaves="1"` +
    ` seed="${p.seeds[0]}" result="n"` +
    (anim ? `>${anim}\n    </feTurbulence>\n` : '/>\n');
  const disp =
    `    <feDisplacementMap in="SourceGraphic" in2="n" xChannelSelector="R"` +
    ` yChannelSelector="G" scale="${p.scale}"${p.blur ? ' result="d"' : ''}/>\n`;
  const tail = p.blur
    ? `    <feGaussianBlur in="d" stdDeviation="${p.blur}" result="b"/>\n` +
      `    <feComponentTransfer in="b"><feFuncA type="table" tableValues="${p.alpha}"/></feComponentTransfer>\n`
    : '';
  return head + disp + tail + '  </filter>';
}

/* `overrides` is a flat map from `--set`, e.g. { 'text.scale': '2.4',
 * 'driver': 'smil' }. Unknown keys are an error rather than a silent no-op:
 * a knob that quietly does nothing is the failure this library exists against. */
function resolve(overrides = {}) {
  const cfg = JSON.parse(JSON.stringify(DEFAULTS));
  for (const [k, v] of Object.entries(overrides)) {
    if (k === 'driver') {
      if (v !== 'js' && v !== 'smil') throw new Error(`boil.driver must be js or smil, got ${v}`);
      cfg.driver = v; continue;
    }
    const [which, prop] = k.split('.');
    if (!cfg[which] || !(prop in cfg[which])) throw new Error(`unknown boil knob: ${k}`);
    cfg[which][prop] = prop === 'seeds' ? String(v).split(',').map(Number)
      : prop === 'alpha' ? v : num(v);
  }
  return cfg;
}

function defs(overrides = {}) {
  const cfg = resolve(overrides);
  const out = [];
  for (const [name, suffix] of [['text', ''], ['stage', ''], ['ui', '']]) void 0;
  for (const which of ['text', 'stage', 'ui']) {
    for (const [vname, vpatch] of Object.entries(VARIANTS)) {
      const p = Object.assign({}, cfg[which], vpatch);
      out.push(filter('pixel-' + which + (vname ? '-' + vname : ''), p, cfg.driver));
    }
  }
  const seeds = JSON.stringify({
    text: cfg.text.seeds, stage: cfg.stage.seeds, ui: cfg.ui.seeds,
    dur: { text: cfg.text.dur, stage: cfg.stage.dur, ui: cfg.ui.dur },
    driver: cfg.driver,
  });
  return (
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true">\n' +
    out.join('\n') + '\n</svg>\n' +
    `<script type="application/json" id="zanni-boil-config">${seeds}</script>`
  );
}

module.exports = { defs, resolve, DEFAULTS, VARIANTS };
