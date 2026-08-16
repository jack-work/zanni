/* zanni · boil — reduced-motion honour guard.
 *
 * SMIL is not CSS. A blanket `@media (prefers-reduced-motion: reduce) { *
 * { animation: none !important } }` does nothing to <animate> inside a
 * <filter>: the seed keeps stepping and the type keeps boiling. The only
 * reliable stop is to remove the animate elements, which freezes each filter
 * on its initial seed — still displaced, no longer moving.
 *
 * This is the piece every hand-copy of the CSS forgets. It is the reason
 * boil is a package and not a snippet. */
(function () {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var kill = function () {
    var nodes = document.querySelectorAll('filter animate');
    for (var i = 0; i < nodes.length; i++) nodes[i].remove();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', kill, { once: true });
  } else {
    kill();
  }
})();
