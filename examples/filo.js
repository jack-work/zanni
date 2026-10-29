function silence(seconds) {
  var rate = 8000, n = rate * seconds, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  function s(o, str) { for (var i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); }
  s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  s(36, 'data'); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function sprite() {
  var c = document.createElement('canvas');
  c.width = 1600;
  c.height = 900;
  var g = c.getContext('2d');
  for (var i = 0; i < 100; i++) {
    g.fillStyle = 'hsl(' + (i * 37 % 360) + ' 45% 40%)';
    g.fillRect((i % 10) * 160, Math.floor(i / 10) * 90, 160, 90);
    g.fillStyle = '#f0dfc8';
    g.font = '28px monospace';
    g.fillText(String(i * 10) + ' s', (i % 10) * 160 + 30, Math.floor(i / 10) * 90 + 55);
  }
  return new Promise(function (ok) { c.toBlob(function (b) { ok(URL.createObjectURL(b)); }); });
}

function stamp(t) {
  var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  return [h, m, s].map(function (x) { return String(x).padStart(2, '0'); }).join(':') + '.000';
}

function vtt(img) {
  var out = ['WEBVTT', ''];
  for (var i = 0; i < 60; i++) {
    out.push(stamp(i * 10) + ' --> ' + stamp(i * 10 + 10));
    out.push(img + '#xywh=' + (i % 10) * 160 + ',' + Math.floor(i / 10) * 90 + ',160,90');
    out.push('');
  }
  return URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/vtt' }));
}

(function () {
  var params = new URLSearchParams(location.search);
  var kind = params.get('kind') || 'video';
  var media = document.createElement(kind === 'audio' && params.get('tag') !== 'video' ? 'audio' : 'video');
  media.id = 'media';
  media.preload = 'auto';
  if (params.get('poster')) media.poster = params.get('poster');
  media.src = params.get('src') || silence(600);
  document.getElementById('stage').appendChild(media);
  window.seeks = [];
  window.events = [];
  ['filo:seek', 'filo:quality', 'filo:rate', 'filo:bar', 'filo:fullscreen', 'filo:sleep', 'filo:stop', 'filo:dock', 'filo:expand', 'filo:pip', 'filo:background'].forEach(function (t) {
    document.addEventListener(t, function (e) {
      events.push([t, e.detail]);
      if (t === 'filo:seek') seeks.push(e.detail);
    });
  });
  var opts = {
    globalKeys: params.get('keys') !== 'focus',
    kind: kind === 'audio' ? 'audio' : undefined,
    title: params.get('title') || 'Il barbiere di Siviglia',
    chapters: [
      { start: 0, title: 'Sinfonia' },
      { start: 120, title: 'Largo al factotum' },
      { start: 300, title: 'Una voce poco fa' },
      { start: 480, title: 'Temporale' }
    ],
    qualities: [
      { value: 'auto', label: 'Auto' },
      { value: '1080', label: '1080p' },
      { value: '720', label: '720p' },
      { value: 's', label: 'Speech 32k' },
      { value: 'original', label: 'Original' }
    ],
    quality: 'auto'
  };
  if (params.get('autohide') != null) opts.autohide = Number(params.get('autohide'));
  if (params.get('boil') === 'off') opts.boil = false;
  if (params.get('bar')) opts.bar = true;
  if (params.get('wave')) {
    var w = [];
    for (var i = 0; i < 1024; i++) w.push(Math.round(255 * Math.abs(Math.sin(i / 23)) * (0.4 + 0.6 * Math.abs(Math.sin(i / 157)))));
    opts.waveform = w;
  }
  if (params.get('docked')) opts.docked = true;
  if (params.get('background')) opts.background = { src: params.get('background') === 'broken' ? 'nowhere.wav' : silence(600), type: 'audio/wav' };
  if (params.get('session')) opts.session = true;
  if (params.get('kicker')) opts.kicker = params.get('kicker');
  var ready = params.get('thumbs') ? sprite().then(function (img) { opts.thumbnails = vtt(img); }) : Promise.resolve();
  ready.then(function () {
    window.player = zanni.filo.attach(media, opts);
  });
})();
