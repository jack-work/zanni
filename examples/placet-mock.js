(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.placetMock = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function fakeHash(seed) {
    var h = 2166136261, out = '';
    for (var round = 0; round < 8; round++) {
      for (var i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i) ^ round, 16777619) >>> 0;
      out += ('00000000' + h.toString(16)).slice(-8);
    }
    return out;
  }

  function seal(r) {
    r.hash = fakeHash(JSON.stringify([r.filing, r.id, r.verb, r.target, r.lines, r.refusal || '']));
    r.token = 'tok-' + r.hash.slice(0, 10) + '-' + r.version;
    return r;
  }

  function iso(ms) { return new Date(ms).toISOString(); }

  function demo(now) {
    return [
      seal({
        filing: '@96447061', filer_name: 'King of Spain', id: 'r7f3a', verb: 'figaro.model',
        target: '947bf85d94293547cd5cfbaf84e9e3cf', target_name: 'Figaro Engineer', state: 'pending',
        reason: 'The Engineer is out of Gemini quota; move him to claude-opus-4-5 for the release window.',
        expires: iso(now + 3 * 3600000), version: 41, applied: false, at_succession: false,
        raw: '{"verb":"figaro.model","target":"947bf85d94293547cd5cfbaf84e9e3cf","set":{"system.model":"claude-opus-4-5"}}',
        lines: [
          { op: 'set', key: 'system.model', current: '"gpt-6.1"', new: '"claude-opus-4-5"' },
          { op: 'remove', key: 'elicit.r7f3a' }
        ]
      }),
      seal({
        filing: '@2e0bb68c', filer_name: 'Ministro de TV', id: 'k2m9x', verb: 'role.model',
        target: '@62c5c9bf8794ec5b8d1d00d05dd26c69', target_name: 'Il Zanni', state: 'pending',
        reason: 'Zanni needs the KIC seat for the usage proposal.',
        expires: iso(now + 20 * 60000), version: 8, applied: false, at_succession: true,
        lines: [
          { op: 'set', key: 'system.provider', current: '"rou2"', new: '"rou2"' },
          { op: 'set', key: 'system.model', current: '"anthropic-kic/claude-fable-5-2"', new: '"anthropic-kic-2/claude-fable-5-2"' },
          { op: 'remove', key: 'elicit.k2m9x' }
        ]
      }),
      seal({
        filing: '@96447061', filer_name: 'King of Spain', id: 'ttl4', verb: 'figaro.ttl',
        target: 'a515eb45ef3a1c39bcfbdf253d7f1aaa', target_name: 'Il Zanni VIII', state: 'pending',
        reason: '', expires: iso(now + 26 * 3600000), version: 41, applied: true, at_succession: false,
        lines: [
          { op: 'set', key: 'system.ttl', current: '"0"', new: '"0"' },
          { op: 'remove', key: 'elicit.ttl4' }
        ]
      }),
      seal({
        filing: '@ee927149', filer_name: 'Figaro Engineer', id: 'q9z', verb: 'figaro.quota',
        target: '947bf85d94293547cd5cfbaf84e9e3cf', target_name: 'Figaro Engineer', state: 'pending',
        reason: 'Fan-out for the approvals build.', expires: iso(now + 5 * 3600000), version: 17,
        applied: false, at_succession: false,
        lines: [
          { op: 'set', key: 'system.fanout.quota', current: '4', new: '8' },
          { op: 'set', key: 'system.grants', current: '["valet","box"]', new: '["valet","fanout"]' },
          { op: 'remove', key: 'elicit.q9z' }
        ]
      }),
      seal({
        filing: '@96447061', filer_name: 'King of Spain', id: 'w1', verb: 'figaro.nuke', target: '', state: 'pending',
        refusal: 'unknown verb "figaro.nuke"', reason: 'Please delete the store.', expires: iso(now + 9 * 3600000),
        version: 41, applied: false, at_succession: false,
        raw: '{"verb":"figaro.nuke","reason":"Please delete the store."}',
        lines: [{ op: 'remove', key: 'elicit.w1' }]
      })
    ];
  }

  function hostile(now) {
    var evil = '<img src=x onerror="window.__pwned=1">';
    return [
      seal({
        filing: '@96447061', filer_name: evil, id: 'h1', verb: 'figaro.model<b>',
        target: 'aria"><script>window.__pwned=1</script>', target_name: evil, state: evil,
        reason: '<script>window.__pwned=1</script>' + evil + ' \u202eelif\u202c and \u200bzero\u200bwidth ' + 'x'.repeat(6000),
        expires: iso(now + 2 * 3600000), version: 3, applied: false, at_succession: false,
        refusal: '',
        raw: evil + '\n</pre>' + evil + '\u0000\u0007',
        lines: [
          { op: 'set', key: 'system.model' + evil, current: '"' + evil + '"', new: '"</code>' + evil + ' \u202eevil\u202c"' },
          { op: 'set', key: 'system.grants', current: '["a"]', new: '["a","' + evil + '"]' },
          { op: 'remove', key: 'elicit.h1' }
        ]
      }),
      seal({
        filing: '@96447061', filer_name: 'King of Spain', id: 'h2', verb: 'figaro.nuke', target: '', state: 'pending',
        refusal: evil + ' deny only', reason: evil, expires: iso(now + 4 * 3600000), version: 3, applied: false,
        at_succession: false, raw: evil, lines: [{ op: 'remove', key: 'elicit.h2' }]
      })
    ];
  }

  function create(requests) {
    var state = {
      requests: requests, admin: 'admin', down: false, status: 0, posts: [], hold: false, refuse: null, delay: 0, postStatus: 0
    };
    function find(f, i) { for (var k = 0; k < state.requests.length; k++) if (state.requests[k].filing === f && state.requests[k].id === i) return state.requests[k]; return null; }
    function handle(method, url, body) {
      if (state.down) throw new TypeError('Failed to fetch');
      var path = url.replace(/^https?:\/\/[^/]+/, '');
      if (state.status) return { status: state.status, json: { error: 'forced ' + state.status } };
      if (method === 'GET' && path === '/api/v1/requests') return { status: 200, json: { requests: JSON.parse(JSON.stringify(state.requests)), admin: state.admin } };
      var m = /^\/api\/v1\/requests\/([^/]+)\/([^/]+)\/(approve|deny)$/.exec(path);
      if (method === 'POST' && m) {
        var f = decodeURIComponent(m[1]), i = decodeURIComponent(m[2]), r = find(f, i);
        var b;
        try { b = JSON.parse(body); } catch (e) { return { status: 400, json: { error: 'bad json' } }; }
        state.posts.push({ kind: m[3], filing: f, id: i, body: b });
        if (state.postStatus) return { status: state.postStatus, json: { error: 'stale or forged token' } };
        if (!r) return { status: 404, json: { error: 'no such request' } };
        if (b.token !== r.token || b.hash !== r.hash || b.version !== r.version) return { status: 403, json: { error: 'stale or forged token' } };
        if (state.refuse) return { status: 409, json: { result: 'nothing changed', error: state.refuse } };
        state.requests = state.requests.filter(function (x) { return x !== r; });
        return { status: 200, json: { result: m[3] === 'approve' ? 'applied and removed ' + r.id : 'denied and removed ' + r.id } };
      }
      return { status: 404, json: { error: 'not found' } };
    }
    return {
      state: state,
      handle: handle,
      find: find,
      bump: function (f, i) { var r = find(f, i); r.version++; r.token = 'tok-' + r.hash.slice(0, 10) + '-' + r.version; },
      edit: function (f, i, patch) { var r = find(f, i); Object.keys(patch).forEach(function (k) { r[k] = patch[k]; }); r.version++; seal(r); },
      add: function (r) { state.requests.push(r); },
      remove: function (f, i) { state.requests = state.requests.filter(function (x) { return !(x.filing === f && x.id === i); }); },
      fetch: function (url, init) {
        init = init || {};
        return new Promise(function (resolve, reject) {
          var go = function () {
            var res;
            try { res = handle(init.method || 'GET', String(url), init.body); } catch (e) { reject(e); return; }
            resolve({ status: res.status, text: function () { return Promise.resolve(JSON.stringify(res.json)); } });
          };
          if (state.delay) setTimeout(go, state.delay); else go();
        });
      }
    };
  }

  return { create: create, demo: demo, hostile: hostile, seal: seal };
}));
