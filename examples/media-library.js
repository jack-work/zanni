'use strict';

zanni.proscenio.attach(document.querySelector('[data-proscenio]'));
var records = [
  { key: 'demo/video-one.mp4', title: 'A video with saved progress', kind: 'video', duration: 3600, position: { position: 846, duration: 3600 } },
  { key: 'demo/recording.mp3', title: 'An audio recording', kind: 'audio', duration: 2728, position: { position: 421, duration: 2728 } },
  { key: 'demo/unknown.mp4', title: 'Unknown duration', kind: 'video', duration: null, position: null },
  { key: 'demo/finished.mp4', title: 'A video at the end', kind: 'video', duration: 600, position: { position: 598, duration: 600 } },
  { key: 'demo/unstarted.mp4', title: 'A video not started', kind: 'video', duration: 1200, position: null }
];
var origin = null, originY = 0;
var library = document.getElementById('library'), detail = document.getElementById('detail');
var title = zanni.titolo.mount(detail, {
  onBack: function () {
    detail.hidden = true;
    library.hidden = false;
    if (origin) origin.view.focus(origin.key);
    window.scrollTo(0, originY);
  },
  onPlay: function (item, at) { document.getElementById('action').textContent = 'Demo only: playback requested for ' + item.key + ' at ' + zanni.catalogo.clock(at) + '. No media or cast request was made.'; }
});
function select(view, item) {
  origin = { view: view, key: item.key };
  originY = window.scrollY;
  title.setItem(item);
  library.hidden = true;
  detail.hidden = false;
  window.scrollTo(0, 0);
  title.focus();
}
var continuing = zanni.catalogo.mount(document.getElementById('continue'), {
  title: 'Continue watching and listening', layout: 'shelf', resumeOnly: true, items: records,
  onSelect: function (item) { select(continuing, item); }
});
var catalog = zanni.catalogo.mount(document.getElementById('catalog'), {
  title: 'My media', items: records,
  onSelect: function (item) { select(catalog, item); }
});
document.getElementById('mode').addEventListener('change', function (event) {
  [catalog, continuing, title].forEach(function (component) { component.setMode(event.target.value); });
});
window.mediaDemo = { catalog: catalog, continuing: continuing, title: title, records: records };
