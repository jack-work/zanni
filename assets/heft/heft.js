/* zanni · heft — the drag itself.
 *
 * Everything wearing .heft becomes liftable. No configuration, no init call;
 * a MutationObserver picks up anything added later.
 *
 * The subtle part is deciding WHEN a press becomes a drag. A press commits to
 * nothing: the drag begins on the first movement past 8px, and only if no
 * text selection has started. So a pull from the margin throws the object and
 * a pull across words selects them, and neither has to be declared in
 * advance. preventDefault waits until the drag is real, which is why the
 * element is still readable and still clickable.
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLACK2 = 64;   /* 8px, squared — compared against the squared distance */

  function selecting() {
    var s = window.getSelection && window.getSelection();
    return !!(s && !s.isCollapsed);
  }

  function arm(el) {
    if (el.__heft) return;
    el.__heft = true;

    var armed = false, on = false, sx = 0, sy = 0, id = null;
    /* Whatever this element must be lifted ABOVE — a navbar, a card — is
     * marked by the author with .heft-lift. A filter or transform on that
     * ancestor makes it a stacking context, and no z-index on the child can
     * escape it. */
    var lift = el.closest ? el.closest('.heft-lift') : null;

    el.addEventListener('dragstart', function (e) { e.preventDefault(); });

    el.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      armed = true; on = false; sx = e.clientX; sy = e.clientY; id = e.pointerId;
    });

    window.addEventListener('pointermove', function (e) {
      if (!armed) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!on) {
        if (dx * dx + dy * dy < SLACK2) return;      /* still just a press */
        if (selecting()) { armed = false; return; }  /* they are reading */
        on = true;
        el.classList.remove('settling');
        el.classList.add('held');
        if (lift) document.body.classList.add('hefting');
        if (el.setPointerCapture) { try { el.setPointerCapture(id); } catch (_) {} }
      }
      el.style.translate = dx + 'px ' + dy + 'px';
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    function release() {
      armed = false;
      if (!on) return;
      on = false;
      document.body.classList.remove('hefting');
      el.classList.remove('held');
      el.classList.add('settling');
      el.style.translate = '0px 0px';
      /* Longer than the transition, so the class is gone before the next
       * grab and a fresh drag is never animated. */
      setTimeout(function () { el.classList.remove('settling'); }, 720);
    }

    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
  }

  function scan() {
    var all = document.querySelectorAll('.heft');
    for (var i = 0; i < all.length; i++) arm(all[i]);
  }

  function start() {
    scan();
    if (window.MutationObserver) {
      new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
