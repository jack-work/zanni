(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var now = Date.now();
  var set = params.get('set') === 'hostile' ? placetMock.hostile(now) : params.get('set') === 'empty' ? [] : placetMock.demo(now);
  var mock = placetMock.create(set);
  window.mock = mock;
  window.order = placet.mount(document.getElementById('app'), { fetch: mock.fetch, base: '/api/v1', poll: Number(params.get('poll')) || 400 });
  document.getElementById('scheme').onclick = function () {
    document.documentElement.dataset.scheme = document.documentElement.dataset.scheme === 'dark' ? 'light' : 'dark';
  };
}());
