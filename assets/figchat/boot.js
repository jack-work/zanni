(function () {
  'use strict';
  var host = document.getElementById('app');
  var A = window.figaroAria;
  var store = host.getAttribute('data-store') || 'local';
  var door = host.getAttribute('data-door') || 'door';
  var client = new A.AriaClient({
    dial: A.webSocketDial({ url: function () { return A.doorUrl(door); }, credential: A.edgeSession() }),
    pageBytes: 24000
  });
  var stores = {};
  stores[store] = client;
  host.replaceChildren();
  window.figchat.mount(host, { stores: stores, store: store, speech: window.figchatSpeech.gateway({ url: host.getAttribute('data-audio') || 'audio' }) });
}());
