/* zanni · boil — the seed driver, and the reduced-motion guard.
 *
 * WHY THIS EXISTS AT ALL, and why it is not a SMIL <animate>:
 *
 * A SMIL animation attached to a filter keeps the filtered subtree
 * perpetually dirty. Chrome re-rasterises it every frame — about 60 times a
 * second — even though `calcMode="discrete"` means the OUTPUT only changes
 * five times a second. Fifty-five of every sixty rasters produce a
 * pixel-identical image and are thrown away.
 *
 * Measured (Chrome 145, headless, 1280x900, CPU raster, 5s windows):
 *
 *   no filter at all ............................  0 ms raster
 *   boil with no <animate> ......................  0 ms raster
 *   boil, SMIL dur=20s  (seed changes /3.3s) .... 60.0 s  0.99x
 *   boil, SMIL dur=1.2s (seed changes /0.2s) .... 60.6 s  1.00x
 *   boil, SMIL dur=0.3s (seed changes /0.05s) ... 60.4 s  1.00x
 *   boil, THIS DRIVER, same seeds at the same 5Hz  5.7 s  0.09x
 *
 * The seed RATE is irrelevant to SMIL's cost and decisive for this driver's,
 * which is exactly what "dirty every frame" versus "dirty on change" predicts.
 * Writing the attribute only when the value changes is an 11x saving on the
 * single most expensive thing in this library.
 *
 * Consequences worth knowing:
 *   - Without JS the boil is STATIC — displaced, not moving. That is a
 *     reasonable floor, and it is what reduced-motion readers get too.
 *   - Nothing here runs when the document is hidden; a background tab should
 *     not be rasterising a filter nobody is looking at.
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  function start() {
    var el = document.getElementById('zanni-boil-config');
    if (!el) return;                       // defs were inlined without a config
    var cfg;
    try { cfg = JSON.parse(el.textContent); } catch (e) { return; }
    if (cfg.driver === 'smil') return;     // the markup animates itself

    /* Reduced motion: leave every filter on its first seed. Note a CSS
     * `animation: none` cannot do this job — there is no CSS animation here,
     * and there would be no way to stop SMIL from CSS either. */
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var clocks = [];
    ['text', 'stage', 'ui'].forEach(function (which) {
      var seeds = cfg[which];
      if (!seeds || seeds.length < 2) return;
      /* Every variant of one register shares a clock, so a page mixing
       * .boil-text and .boil-text-squiggle still steps in unison rather than
       * beating against itself. */
      var nodes = [];
      ['', '-squiggle', '-strong'].forEach(function (v) {
        var f = document.getElementById('pixel-' + which + v);
        if (f) {
          var t = f.querySelector('feTurbulence');
          if (t) nodes.push(t);
        }
      });
      if (!nodes.length) return;
      var period = Math.max(1, Math.round((cfg.dur[which] || 1200) / seeds.length));
      clocks.push({ nodes: nodes, seeds: seeds, period: period, i: 0, timer: null });
    });
    if (!clocks.length) return;

    function tick(c) {
      c.i = (c.i + 1) % c.seeds.length;
      var v = String(c.seeds[c.i]);
      for (var j = 0; j < c.nodes.length; j++) {
        /* Only write when it differs. A write is what marks the filter dirty,
         * so a redundant write is a whole wasted raster of the subtree. */
        if (c.nodes[j].getAttribute('seed') !== v) c.nodes[j].setAttribute('seed', v);
      }
    }
    function run() {
      stop();
      clocks.forEach(function (c) { c.timer = setInterval(function () { tick(c); }, c.period); });
    }
    function stop() {
      clocks.forEach(function (c) { if (c.timer) { clearInterval(c.timer); c.timer = null; } });
    }

    document.addEventListener('visibilitychange', function () {
      document.hidden ? stop() : run();
    });
    if (!document.hidden) run();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
