(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var core = figchatMock.create({ seed: params.get('set') || 'demo', step: Number(params.get('step')) || 40 });
  window.mock = core;
  window.chat = figchat.mount(document.getElementById('app'), { transport: figchatMock.transport(core, window), backoff: function () { return 150; } });
}());
