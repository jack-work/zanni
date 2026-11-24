(function () {
  'use strict';

  var GOOGLE = 'https://login.kelliher.info/oauth/google/start';
  var query = new URLSearchParams(location.search);
  var rd = query.get('rd') || '';
  var rm = query.get('rm') || '';
  var byId = function (id) { return document.getElementById(id); };
  var methods = { totp: false, webauthn: false };
  var current = null;

  function show(id) {
    ['first', 'second', 'done'].forEach(function (s) { byId(s).hidden = s !== id; });
  }

  function say(id, text) {
    var n = byId(id);
    n.textContent = text || '';
    n.hidden = !text;
  }

  function busy(button, on) {
    button.disabled = on;
  }

  async function api(method, path, body) {
    var init = { method: method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    var res = await fetch(path, init);
    var json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (res.status === 429) throw new Error('Too many attempts. Wait a minute, then try again.');
    if (!res.ok || !json || json.status !== 'OK') {
      var msg = json && json.message ? json.message : 'Something went wrong on our side. Try again.';
      throw new Error(msg);
    }
    return json.data || {};
  }

  function target() {
    var t = {};
    if (rd) t.targetURL = rd;
    if (rm) t.requestMethod = rm;
    return t;
  }

  function leave(data) {
    if (data && data.redirect) {
      location.assign(data.redirect);
      return true;
    }
    return false;
  }

  async function finished() {
    var state = await api('GET', '/api/state');
    if (rd) {
      var safe = await api('POST', '/api/checks/safe-redirection', { uri: rd }).catch(function () { return {}; });
      if (safe.ok) { location.assign(rd); return; }
    }
    show('done');
    byId('done-who').textContent = 'Signed in as ' + state.username + '.';
    var next = state.default_redirection_url;
    if (next) {
      byId('done-go').href = next;
      byId('done-go').hidden = false;
    }
  }

  function pick(method) {
    current = method;
    byId('totp').hidden = method !== 'totp';
    byId('passkey').hidden = method !== 'webauthn';
    var other = method === 'totp' ? 'webauthn' : 'totp';
    var sw = byId('switch');
    sw.hidden = !methods[other];
    sw.textContent = other === 'totp' ? 'Use a code instead' : 'Use a passkey instead';
    if (method === 'totp') byId('code').focus();
  }

  async function secondStep() {
    var info = await api('GET', '/api/user/info');
    methods.totp = !!info.has_totp;
    methods.webauthn = !!info.has_webauthn && typeof window.PublicKeyCredential === 'function';
    show('second');
    if (!methods.totp && !methods.webauthn) {
      byId('none').hidden = false;
      byId('totp').hidden = true;
      byId('passkey').hidden = true;
      return;
    }
    pick(methods.totp ? 'totp' : 'webauthn');
  }

  function b64urlToBuf(s) {
    var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  function bufToB64url(buf) {
    var bytes = new Uint8Array(buf);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function passkey() {
    var go = byId('passkey-go');
    busy(go, true);
    say('passkey-err', '');
    try {
      var opts = await api('GET', '/api/secondfactor/webauthn');
      var pk = opts.publicKey;
      var request = {
        challenge: b64urlToBuf(pk.challenge),
        timeout: pk.timeout,
        rpId: pk.rpId,
        userVerification: pk.userVerification,
        allowCredentials: (pk.allowCredentials || []).map(function (c) {
          return { type: c.type, id: b64urlToBuf(c.id), transports: c.transports };
        })
      };
      if (pk.extensions) request.extensions = pk.extensions;
      var cred = await navigator.credentials.get({ publicKey: request });
      var r = cred.response;
      var response = {
        id: cred.id,
        rawId: bufToB64url(cred.rawId),
        type: cred.type,
        clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
        authenticatorAttachment: cred.authenticatorAttachment || undefined,
        response: {
          clientDataJSON: bufToB64url(r.clientDataJSON),
          authenticatorData: bufToB64url(r.authenticatorData),
          signature: bufToB64url(r.signature),
          userHandle: r.userHandle ? bufToB64url(r.userHandle) : undefined
        }
      };
      var body = target();
      body.response = response;
      var data = await api('POST', '/api/secondfactor/webauthn', body);
      if (!leave(data)) await finished();
    } catch (e) {
      if (methods.totp) {
        pick('totp');
        say('totp-err', 'That passkey did not work here. Use your code instead.');
      } else {
        say('passkey-err', 'That passkey did not work here. Set up a code at auth.kelliher.info, or try again.');
      }
    } finally {
      busy(go, false);
    }
  }

  async function totp(ev) {
    ev.preventDefault();
    var go = byId('totp-go');
    var code = byId('code');
    var token = code.value.replace(/\s+/g, '');
    if (!/^[0-9]{6,8}$/.test(token)) { say('totp-err', 'Type the 6 digits your app shows.'); code.focus(); return; }
    busy(go, true);
    say('totp-err', '');
    try {
      var body = target();
      body.token = token;
      var data = await api('POST', '/api/secondfactor/totp', body);
      if (!leave(data)) await finished();
    } catch (e) {
      say('totp-err', 'That code did not work. Wait for the next one and try again.');
      code.value = '';
      code.focus();
    } finally {
      busy(go, false);
    }
  }

  async function first(ev) {
    ev.preventDefault();
    var go = byId('first-go');
    var user = byId('username');
    var pass = byId('password');
    if (!user.value) { say('first-err', 'Type your username.'); user.focus(); return; }
    if (!pass.value) { say('first-err', 'Type your password.'); pass.focus(); return; }
    busy(go, true);
    say('first-err', '');
    try {
      var body = target();
      body.username = user.value;
      body.password = pass.value;
      body.keepMeLoggedIn = byId('remember').checked;
      var data = await api('POST', '/api/firstfactor', body);
      pass.value = '';
      if (leave(data)) return;
      await secondStep();
    } catch (e) {
      say('first-err', 'Wrong username or password.');
      pass.value = '';
      pass.focus();
    } finally {
      busy(go, false);
    }
  }

  async function restart() {
    await api('POST', '/api/logout', {}).catch(function () { return null; });
    show('first');
    byId('username').focus();
  }

  function stub() {
    if (!rd) return;
    try {
      var host = new URL(rd).hostname;
      byId('stub-host').textContent = host;
      byId('stub').hidden = false;
    } catch (e) {
      return;
    }
  }

  function googleHost(host) {
    var listed = window.zanniGoogleHosts;
    if (Array.isArray(listed)) return listed.indexOf(host) >= 0;
    return host === 'kelliher.info' || /\.kelliher\.info$/.test(host);
  }

  function google() {
    var to = null;
    try { to = rd ? new URL(rd) : null; } catch (e) { to = null; }
    var ok = !!(to && to.protocol === 'https:' && googleHost(to.hostname));
    ['or', 'google', 'request'].forEach(function (id) { byId(id).hidden = !ok; });
    byId('google').href = GOOGLE + '?rd=' + encodeURIComponent(rd);
    byId('says').textContent = ok
      ? 'Sign in with the account the boss gave you, or with Google if he let yours in.'
      : 'Sign in with the account the boss gave you.';
  }

  async function start() {
    stub();
    google();
    byId('first-form').addEventListener('submit', first);
    byId('totp-form').addEventListener('submit', totp);
    byId('passkey-go').addEventListener('click', passkey);
    byId('switch').addEventListener('click', function () { pick(current === 'totp' ? 'webauthn' : 'totp'); });
    byId('restart').addEventListener('click', restart);
    try {
      var state = await api('GET', '/api/state');
      if (state.authentication_level >= 2) { await finished(); return; }
      if (state.authentication_level === 1) { await secondStep(); return; }
    } catch (e) {
      say('first-err', '');
    }
    show('first');
    byId('username').focus();
  }

  start();
})();
