(function () {
  var params = new URLSearchParams(location.search);
  var bar = document.getElementById('bar');
  if (params.get('mode') === 'tv') bar.setAttribute('data-proscenio', 'tv');
  if (params.get('key') === 'off') bar.setAttribute('data-proscenio-search-key', 'off');
  var main = document.getElementById('main');
  for (var i = 0; i < 60; i++) {
    var p = document.createElement('p');
    p.textContent = 'Largo al factotum della città. Presto a bottega, che l\u2019alba è già. ' + i;
    main.appendChild(p);
  }
  window.log = [];
  ['proscenio:menu', 'proscenio:drawer', 'proscenio:search', 'proscenio:hidden', 'proscenio:leave'].forEach(function (t) {
    document.addEventListener(t, function (e) { log.push([t, e.detail]); });
  });
  window.casts = 0;
  document.getElementById('cast').addEventListener('click', function () { casts++; });
})();
