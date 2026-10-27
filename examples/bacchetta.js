(function () {
  var tiles = document.getElementById('tiles');
  for (var i = 0; i < 24; i++) tiles.appendChild(Object.assign(document.createElement('div'), { className: 'tile' }));
  window.log = [];
  ['bacchetta:cast', 'bacchetta:control', 'bacchetta:path', 'bacchetta:boil', 'bacchetta:show', 'bacchetta:hide', 'bacchetta:minimise'].forEach(function (t) {
    document.addEventListener(t, function (e) { log.push([t, e.detail]); });
  });
  var screens = [
    { id: 'tv', name: 'Living room TV', kind: 'tv', online: true },
    { id: 'desk', name: 'gluck \u00B7 desktop', kind: 'browser', online: true },
    { id: 'cheroot', name: 'cheroot', kind: 'browser', online: false }
  ];
  window.caster = zanni.bacchetta.caster(document.getElementById('cast'), { screens: screens });
  window.remote = zanni.bacchetta.remote({});
  document.addEventListener('bacchetta:cast', function (e) {
    remote.show(e.detail.screen);
    remote.setNow({ title: 'OL overview', chapter: 'Ch. 2 \u00B7 Policy iteration', position: 846, duration: 2728, playing: true });
  });
})();
