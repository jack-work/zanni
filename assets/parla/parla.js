(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var AHEM = '*AHEM*';
  var AHEM_MS = 700;

  function construct(el) {
    if (el.parla) return el.parla;
    var bubble = el.querySelector('.parla-bubble');
    var head = el.querySelector('.parla-head');
    if (!bubble) return null;

    var resting = bubble.textContent;
    var quipping = false, quipTimer = null, ahemTimer = null, pending = null;

    function animate(name) {
      bubble.classList.remove('parla-again', 'parla-wiggle');
      void bubble.offsetWidth;
      bubble.classList.add(name);
    }

    function show(text, how) {
      bubble.classList.toggle('parla-ahem', text === AHEM);
      bubble.textContent = text;
      animate(how || 'parla-again');
    }

    function hush() {
      clearTimeout(quipTimer); clearTimeout(ahemTimer);
      quipTimer = ahemTimer = pending = null;
      quipping = false;
    }

    var api = {
      say: function (text) { hush(); resting = text; show(text); },
      quip: function (text, ms) {
        hush();
        quipping = true;
        show(text);
        quipTimer = setTimeout(function () { quipping = false; quipTimer = null; show(resting); }, ms || 3500);
      },
      interrupt: function (text) {
        if (ahemTimer) { pending = text; return; }
        if (!quipping) { hush(); show(text); return; }
        hush();
        pending = text;
        show(AHEM, 'parla-wiggle');
        ahemTimer = setTimeout(function () { var t = pending; ahemTimer = pending = null; show(t); }, AHEM_MS);
      },
      rest: function () { hush(); show(resting); },
      wiggle: function () { animate('parla-wiggle'); },
      get quipping() { return quipping || !!ahemTimer; },
      get resting() { return resting; }
    };

    if (head && window.MutationObserver) {
      new MutationObserver(function () {
        if (head.classList.contains('settling')) api.wiggle();
      }).observe(head, { attributes: true, attributeFilter: ['class'] });
    }

    el.parla = api;
    return api;
  }

  function scan() {
    var all = document.querySelectorAll('[data-parla]');
    for (var i = 0; i < all.length; i++) construct(all[i]);
  }

  window.zanniParla = construct;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan, { once: true });
  } else {
    scan();
  }
})();
