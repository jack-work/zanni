'use strict';

(function () {
  var rp = location.hostname;
  var make = document.getElementById('make');
  var error = document.getElementById('error');

  document.getElementById('rp').textContent = rp;

  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function hex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return s.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  }

  function attested(auth) {
    if (auth.length < 55 || !(auth[32] & 0x40)) throw new Error('The authenticator returned no credential.');
    if (auth[32] & 0x80) throw new Error('The authenticator added extensions this page does not read. Nothing was printed.');
    var len = (auth[53] << 8) | auth[54];
    return {
      aaguid: auth.slice(37, 53),
      id: auth.slice(55, 55 + len),
      cose: auth.slice(55 + len)
    };
  }

  function show(id, text) {
    document.getElementById(id).textContent = text;
  }

  make.addEventListener('click', function () {
    make.disabled = true;
    error.hidden = true;
    var challenge = new Uint8Array(32), user = new Uint8Array(16);
    crypto.getRandomValues(challenge);
    crypto.getRandomValues(user);
    navigator.credentials.create({ publicKey: {
      challenge: challenge,
      rp: { id: rp, name: 'grants' },
      user: { id: user, name: 'gluck', displayName: 'Gluck' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -8 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      attestation: 'none',
      timeout: 120000
    } }).then(function (cred) {
      var r = cred.response;
      var a = attested(new Uint8Array(r.getAuthenticatorData()));
      if (b64url(a.id) !== b64url(new Uint8Array(cred.rawId))) throw new Error('The credential id does not match the authenticator data.');
      show('cred-id', b64url(a.id));
      show('alg', String(r.getPublicKeyAlgorithm()));
      show('cose', b64url(a.cose));
      var spki = r.getPublicKey();
      show('spki', spki ? b64url(new Uint8Array(spki)) : 'not offered by this browser');
      show('aaguid', hex(a.aaguid));
      document.getElementById('out').hidden = false;
      make.hidden = true;
    }).catch(function (err) {
      make.disabled = false;
      error.hidden = false;
      error.textContent = err && err.name === 'NotAllowedError' ? 'No passkey was made.' : (err && err.message) || 'No passkey was made.';
    });
  });
}());
