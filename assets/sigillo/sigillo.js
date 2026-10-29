'use strict';

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.zanni = root.zanni || {};
    root.zanni.sigillo = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function fromB64url(s) {
    var b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4));
    var out = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out.buffer;
  }

  function toB64url(buf) {
    if (!buf) return null;
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function assert(publicKey) {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      return Promise.reject(new Error('This browser has no passkey support.'));
    }
    var pk = {
      challenge: fromB64url(publicKey.challenge),
      rpId: publicKey.rpId,
      timeout: publicKey.timeout || 60000,
      userVerification: 'required',
      allowCredentials: (publicKey.allowCredentials || []).map(function (c) {
        return { type: c.type || 'public-key', id: fromB64url(c.id), transports: c.transports };
      })
    };
    return navigator.credentials.get({ publicKey: pk }).then(function (cred) {
      return {
        id: cred.id,
        rawId: toB64url(cred.rawId),
        type: cred.type,
        response: {
          clientDataJSON: toB64url(cred.response.clientDataJSON),
          authenticatorData: toB64url(cred.response.authenticatorData),
          signature: toB64url(cred.response.signature),
          userHandle: toB64url(cred.response.userHandle)
        }
      };
    });
  }

  function open(opts) {
    var html = document.documentElement;
    var d = el('dialog', 'sigillo');
    d.setAttribute('aria-labelledby', 'sigillo-title');
    d.appendChild(el('h2', 'sigillo-title', opts.title || 'You are about to sign')).id = 'sigillo-title';

    var receipt = el('div', 'sigillo-receipt');
    receipt.setAttribute('role', 'document');
    (opts.lines || []).forEach(function (line) {
      receipt.appendChild(el('div', 'sigillo-line', line));
    });
    d.appendChild(receipt);

    if (opts.digest) {
      var dg = el('div', 'sigillo-digest');
      dg.appendChild(el('span', 'sigillo-digest-label', opts.digestLabel || 'digest'));
      dg.appendChild(el('span', 'sigillo-digest-value', opts.digest));
      d.appendChild(dg);
    }
    if (opts.note) d.appendChild(el('p', 'sigillo-note', opts.note));

    var error = el('p', 'sigillo-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    d.appendChild(error);

    var seal = el('button', 'sigillo-seal', opts.sealLabel || 'seal with passkey');
    seal.type = 'button';
    var back = el('button', 'sigillo-back', opts.backLabel || 'back');
    back.type = 'button';
    var row = el('div', 'sigillo-actions');
    row.appendChild(seal);
    row.appendChild(back);
    d.appendChild(row);

    var state = 'ready';
    function set(s, msg) {
      state = s;
      d.setAttribute('data-state', s);
      seal.disabled = s === 'asking' || s === 'sealed';
      back.disabled = s === 'asking';
      seal.textContent = s === 'asking' ? (opts.askingLabel || 'touch your passkey')
        : s === 'sealed' ? (opts.sealedLabel || 'sealed')
        : s === 'failed' ? (opts.retryLabel || 'try again')
        : (opts.sealLabel || 'seal with passkey');
      error.hidden = s !== 'failed';
      error.textContent = s === 'failed' ? msg || 'The seal did not take.' : '';
    }

    seal.addEventListener('click', function () {
      if (state === 'asking' || state === 'sealed') return;
      set('asking');
      Promise.resolve().then(opts.seal).then(function (result) {
        set('sealed');
        d.dispatchEvent(new CustomEvent('sigillo:sealed', { bubbles: true, detail: result }));
        close();
      }, function (err) {
        set('failed', err && err.message);
      });
    });
    back.addEventListener('click', function () { close(); });
    d.addEventListener('cancel', function (e) {
      if (state === 'asking') e.preventDefault();
    });
    d.addEventListener('close', function () {
      html.classList.remove('sigillo-open');
      if (d.parentNode) d.parentNode.removeChild(d);
      d.dispatchEvent(new CustomEvent('sigillo:closed', { detail: { state: state } }));
      if (opts.onclose) opts.onclose(state);
    });

    function close() {
      if (d.open) d.close();
    }

    set('ready');
    (opts.parent || document.body).appendChild(d);
    html.classList.add('sigillo-open');
    d.showModal();
    receipt.tabIndex = -1;
    receipt.focus({ preventScroll: true });
    d.scrollTop = 0;

    return { el: d, close: close, state: function () { return state; } };
  }

  return { open: open, assert: assert, b64url: { encode: toB64url, decode: fromB64url } };
}));
