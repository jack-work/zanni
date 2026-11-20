(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var core = ariaMock.create({ step: params.has('step') ? Number(params.get('step')) : 40, pageBytes: Number(params.get('page')) || 3000 });
  var client = new figaroAria.AriaClient({ dial: core.dial, retryMinMs: 100, retryMaxMs: 400, pageBytes: Number(params.get('page')) || 3000 });
  var stores = { local: client };
  var host = document.getElementById('app');
  var speech = figchatSpeech.mock({ gap: 10 });
  window.mock = core;
  window.client = client;
  window.speech = speech;
  window.chat = figchat.mount(host, { stores: stores, store: 'local', speech: speech });
}());
