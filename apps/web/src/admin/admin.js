// HexRun admin console: loop review queue + daily metrics.
// Vanilla JS, no innerHTML with API data (textContent / DOM only), CSP: script-src 'self'.
(function () {
  'use strict';

  var KEY_TOKEN = 'hexrun.admin.token';
  var KEY_API = 'hexrun.admin.api';
  /** 2'30"/km: faster than this is not a human running pace (matches core ANTICHEAT.MIN_PACE_SEC_PER_KM). */
  var FAST_SEC_PER_KM = 150;
  var SVGNS = 'http://www.w3.org/2000/svg';

  var REASONS = {
    pace_too_fast: 'Tempo koşu temposunun çok üstünde',
    teleport: 'GPS sıçraması (ışınlanma)',
    sparse_gps: 'Uzun GPS boşluğu',
    non_monotonic_time: 'Zaman damgaları sırasız',
    too_few_points: 'Çok az GPS noktası',
    speed_spike: 'Ani hız sıçraması',
    mock_location: 'Sahte konum şüphesi',
    vehicle_suspected: 'Araç kullanımı şüphesi',
    low_accuracy: 'GPS doğruluğu düşük',
    duplicate_import: 'Aynı koşu birden fazla kaynaktan',
    manual_report: 'Oyuncu şikâyeti'
  };
  var METRICS = [
    ['dau', 'Günlük aktif'],
    ['wau', 'Haftalık aktif'],
    ['runsToday', 'Bugünkü koşu'],
    ['loopsToday', 'Bugünkü halka'],
    ['reviewQueue', 'İnceleme kuyruğu'],
    ['activeDuels', 'Aktif düello']
  ];

  var $ = function (id) { return document.getElementById(id); };
  var main = $('main');
  var els = {
    login: $('login'), loginForm: $('login-form'), api: $('api-base'), token: $('token'),
    loginMsg: $('login-msg'), loginBtn: $('login-btn'), app: $('app'), session: $('session'),
    sessionApi: $('session-api'), logout: $('logout'), metrics: $('metrics'), metricsMsg: $('metrics-msg'),
    reviews: $('reviews'), state: $('queue-state'), count: $('queue-count'), refresh: $('refresh'),
    live: $('live'), dialog: $('confirm'), dTitle: $('confirm-title'), dBody: $('confirm-body'), dOk: $('confirm-ok')
  };

  // ---------- storage ----------
  function store(k, v) {
    try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* private mode */ }
  }
  function load(k) {
    try { return sessionStorage.getItem(k); } catch (e) { return null; }
  }
  var session = { api: load(KEY_API), token: load(KEY_TOKEN) };

  // ---------- DOM helpers ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'className') el.className = attrs[k];
      else if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }
  function s(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  // ---------- formatting ----------
  var nf = new Intl.NumberFormat('tr-TR');
  function km(m) { return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(m / 1000) + ' km'; }
  function pace(sec) {
    if (!isFinite(sec) || sec <= 0) return '—';
    var mm = Math.floor(sec / 60), ss = Math.round(sec % 60);
    if (ss === 60) { mm++; ss = 0; }
    return mm + "'" + (ss < 10 ? '0' : '') + ss + '"/km';
  }
  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return String(iso || '');
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
  }
  function reasonText(code) { return REASONS[code] || code; }

  // ---------- API ----------
  function ApiError(status, message) { this.status = status; this.message = message; }
  function api(path, opts) {
    opts = opts || {};
    var headers = { Accept: 'application/json', Authorization: 'Bearer ' + session.token };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(session.api + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'omit',
      cache: 'no-store'
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        signOut('Oturum geçersiz ya da yetkin yok (HTTP ' + res.status + '). Tekrar giriş yap.');
        throw new ApiError(res.status, 'auth');
      }
      if (!res.ok) throw new ApiError(res.status, 'HTTP ' + res.status);
      var ct = res.headers.get('content-type') || '';
      return ct.indexOf('json') >= 0 ? res.json() : null;
    }, function () {
      throw new ApiError(0, 'Ağ hatası: API adresine ulaşılamadı.');
    });
  }

  // ---------- views ----------
  function showLogin(msg) {
    els.app.hidden = true;
    els.session.hidden = true;
    els.login.hidden = false;
    els.api.value = session.api || main.getAttribute('data-default-api') || '';
    els.token.value = '';
    els.loginMsg.textContent = msg || '';
  }
  function showApp() {
    els.login.hidden = true;
    els.app.hidden = false;
    els.session.hidden = false;
    els.sessionApi.textContent = session.api.replace(/^https?:\/\//, '');
    loadAll();
  }
  function signOut(msg) {
    session.token = null;
    store(KEY_TOKEN, null);
    showLogin(msg);
    els.token.focus();
  }

  els.loginForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var base = (els.api.value || '').trim().replace(/\/+$/, '');
    var token = (els.token.value || '').trim().replace(/^Bearer\s+/i, '');
    if (!/^https?:\/\/[^\s]+$/.test(base)) { els.loginMsg.textContent = 'Geçerli bir API adresi gir (https://…).'; els.api.focus(); return; }
    if (!token) { els.loginMsg.textContent = 'Token boş olamaz.'; els.token.focus(); return; }
    session.api = base;
    session.token = token;
    store(KEY_API, base);
    store(KEY_TOKEN, token);
    els.loginMsg.textContent = '';
    showApp();
  });
  els.logout.addEventListener('click', function () { signOut('Çıkış yapıldı.'); });
  els.refresh.addEventListener('click', function () { loadAll(); });

  function loadAll() {
    loadMetrics();
    loadReviews();
  }

  // ---------- metrics ----------
  function loadMetrics() {
    els.metrics.setAttribute('aria-busy', 'true');
    els.metricsMsg.textContent = '';
    api('/v1/admin/metrics').then(function (m) {
      clear(els.metrics);
      METRICS.forEach(function (p) {
        var v = m && typeof m[p[0]] === 'number' ? nf.format(m[p[0]]) : '—';
        els.metrics.appendChild(h('div', { className: 'stat', 'data-metric': p[0] }, h('dt', { text: p[1] }), h('dd', { text: v })));
      });
      els.metrics.setAttribute('aria-busy', 'false');
    }, function (e) {
      if (e && e.message === 'auth') return;
      clear(els.metrics);
      els.metrics.setAttribute('aria-busy', 'false');
      els.metricsMsg.textContent = 'Metrikler yüklenemedi (' + (e.message || 'hata') + ').';
    });
  }

  // ---------- reviews ----------
  var items = [];
  function setState(kind, text, retry) {
    clear(els.state);
    els.state.setAttribute('data-state', kind);
    if (!text) return;
    els.state.appendChild(h('p', { text: text }));
    if (retry) {
      var b = h('button', { className: 'btn btn-ghost', type: 'button', text: 'Tekrar dene' });
      b.addEventListener('click', loadReviews);
      els.state.appendChild(b);
    }
  }
  function updateCount() {
    els.count.textContent = items.length ? '(' + items.length + ')' : '';
  }

  function loadReviews() {
    clear(els.reviews);
    els.count.textContent = '';
    els.reviews.setAttribute('aria-busy', 'true');
    setState('loading', 'Kuyruk yükleniyor…');
    api('/v1/admin/reviews').then(function (data) {
      els.reviews.setAttribute('aria-busy', 'false');
      items = (data && Array.isArray(data.items)) ? data.items : [];
      render();
    }, function (e) {
      els.reviews.setAttribute('aria-busy', 'false');
      if (e && e.message === 'auth') return;
      setState('error', 'İnceleme kuyruğu yüklenemedi (' + (e.message || 'hata') + ').', true);
    });
  }

  function render() {
    clear(els.reviews);
    updateCount();
    if (!items.length) { setState('empty', 'Kuyruk boş. İncelenecek halka yok.'); return; }
    setState('ready', '');
    items.forEach(function (it) { els.reviews.appendChild(card(it)); });
  }

  function card(it) {
    var p = it.player || {};
    var titleId = 'rv-' + String(it.loopId).replace(/[^A-Za-z0-9_-]/g, '_');
    var li = h('li', { className: 'review', 'data-loop-id': it.loopId, 'aria-labelledby': titleId });

    var head = h('div', { className: 'review-head' },
      h('h3', { id: titleId },
        h('span', { text: p.displayName || p.username || 'Oyuncu' }), ' ',
        h('span', { className: 'muted', text: p.username ? '@' + p.username : '' })),
      h('p', { className: 'muted small' }, h('time', { datetime: it.closedAt, text: when(it.closedAt) }),
        ' · halka ', h('code', { text: String(it.loopId) }), ' · koşu ', h('code', { text: String(it.runId) })));

    var reasons = h('ul', { className: 'reasons', role: 'list', 'aria-label': 'İnceleme nedenleri' });
    (it.reasons || []).forEach(function (r) { reasons.appendChild(h('li', { 'data-reason': r, text: reasonText(r) })); });

    var facts = h('dl', { className: 'facts' });
    function fact(k, v) { facts.appendChild(h('div', null, h('dt', { text: k }), h('dd', { text: v }))); }
    fact('Mesafe', km(it.distanceM || 0));
    fact('Petek', nf.format(it.cells || 0));
    if (typeof it.paceSecPerKm === 'number') fact('Şüpheli tempo', pace(it.paceSecPerKm));
    if (typeof it.segmentM === 'number') fact('Şüpheli bölüm', nf.format(Math.round(it.segmentM)) + ' m');

    var note = it.note ? h('blockquote', { className: 'note' }, h('p', { className: 'label', text: 'Oyuncunun notu' }), h('p', { text: it.note })) : null;

    var err = h('p', { className: 'msg', role: 'alert' });
    var approve = h('button', { className: 'btn', type: 'button', 'data-action': 'approve', text: 'Onayla' });
    var reject = h('button', { className: 'btn btn-danger', type: 'button', 'data-action': 'reject', text: 'Reddet' });
    approve.addEventListener('click', function () { decide(it, 'approve', li, [approve, reject], err); });
    reject.addEventListener('click', function () { decide(it, 'reject', li, [approve, reject], err); });

    li.appendChild(head);
    li.appendChild(h('div', { className: 'review-body' },
      h('div', { className: 'review-info' }, reasons, facts, note),
      trackFigure(it.track || [])));
    li.appendChild(h('div', { className: 'review-actions' }, approve, reject, err));
    return li;
  }

  // ---------- track drawing ----------
  function haversine(a, b) {
    var R = 6371000, toR = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  /** Indices i where segment (i-1 → i) is faster than FAST_SEC_PER_KM. `t` is epoch ms (or ISO string). */
  function fastSegments(track) {
    var out = [];
    for (var i = 1; i < track.length; i++) {
      var ta = +new Date(track[i - 1].t), tb = +new Date(track[i].t);
      var dt = (tb - ta) / 1000;
      if (!(dt > 0)) { out.push(i); continue; }
      var d = haversine(track[i - 1], track[i]);
      if (d > 0 && dt / (d / 1000) < FAST_SEC_PER_KM) out.push(i);
    }
    return out;
  }

  function trackFigure(track) {
    var W = 320, H = 220, PAD = 14;
    var fig = h('figure', { className: 'track' });
    var pts = track.filter(function (q) { return q && isFinite(q.lat) && isFinite(q.lng); });
    if (pts.length < 2) {
      fig.appendChild(h('p', { className: 'muted small track-empty', text: 'Rota verisi yok.' }));
      return fig;
    }
    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    pts.forEach(function (q) {
      if (q.lat < minLat) minLat = q.lat; if (q.lat > maxLat) maxLat = q.lat;
      if (q.lng < minLng) minLng = q.lng; if (q.lng > maxLng) maxLng = q.lng;
    });
    var k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    var spanX = Math.max((maxLng - minLng) * k, 1e-9), spanY = Math.max(maxLat - minLat, 1e-9);
    var scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
    var ox = (W - spanX * scale) / 2, oy = (H - spanY * scale) / 2;
    var xy = pts.map(function (q) {
      return [ox + (q.lng - minLng) * k * scale, oy + (maxLat - q.lat) * scale];
    });
    var str = function (a) { return a[0].toFixed(1) + ',' + a[1].toFixed(1); };
    var fast = fastSegments(pts);
    var distM = 0;
    for (var i = 1; i < pts.length; i++) distM += haversine(pts[i - 1], pts[i]);

    var label = 'Rota: ' + pts.length + ' GPS noktası, ' + km(distM) + '; ' +
      (fast.length ? fast.length + ' bölüm 2\'30"/km\'den hızlı, kesikli kalın çizgiyle işaretli.' : 'hızlı bölüm yok.');
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': label, class: 'track-svg' });
    svg.appendChild(s('rect', { width: W, height: H, class: 't-bg', rx: 10 }));
    svg.appendChild(s('polyline', { points: xy.map(str).join(' '), class: 't-line' }));
    fast.forEach(function (j) {
      svg.appendChild(s('line', {
        x1: xy[j - 1][0].toFixed(1), y1: xy[j - 1][1].toFixed(1), x2: xy[j][0].toFixed(1), y2: xy[j][1].toFixed(1),
        class: 't-fast', 'data-fast': String(j)
      }));
    });
    var st = xy[0];
    svg.appendChild(s('path', { d: 'M' + st[0].toFixed(1) + ' ' + (st[1] - 8).toFixed(1) + 'l7 12h-14z', class: 't-start' }));
    var en = xy[xy.length - 1];
    svg.appendChild(s('circle', { cx: en[0].toFixed(1), cy: en[1].toFixed(1), r: 4, class: 't-end' }));
    fig.appendChild(svg);
    fig.appendChild(h('figcaption', { className: 'small muted' },
      h('span', { className: 'key key-line', 'aria-hidden': 'true' }), ' rota  ',
      h('span', { className: 'key key-fast', 'aria-hidden': 'true' }), ' 2\'30"/km\'den hızlı (' + fast.length + ')  ',
      h('span', { className: 'key key-start', 'aria-hidden': 'true' }), ' başlangıç'));
    return fig;
  }

  // ---------- decisions ----------
  function confirmDialog(decision, it) {
    var approve = decision === 'approve';
    els.dTitle.textContent = approve ? 'Halkayı onayla?' : 'Halkayı reddet?';
    els.dBody.textContent = approve
      ? (it.cells || 0) + ' petek haritaya işlenecek. Bu işlem geri alınamaz.'
      : 'Harita değişmeyecek; koşu ve seri kayıtlı kalır. Oyuncuya bildirim gider.';
    els.dOk.textContent = approve ? 'Onayla' : 'Reddet';
    els.dOk.className = approve ? 'btn' : 'btn btn-danger';
    return new Promise(function (resolve) {
      if (typeof els.dialog.showModal !== 'function') { resolve(window.confirm(els.dTitle.textContent)); return; }
      els.dialog.returnValue = '';
      els.dialog.addEventListener('close', function onClose() {
        els.dialog.removeEventListener('close', onClose);
        resolve(els.dialog.returnValue === 'ok');
      });
      els.dialog.showModal();
      document.getElementById('confirm-cancel').focus();
    });
  }

  function decide(it, decision, li, buttons, err) {
    confirmDialog(decision, it).then(function (ok) {
      if (!ok) { buttons[decision === 'approve' ? 0 : 1].focus(); return; }
      err.textContent = '';
      buttons.forEach(function (b) { b.disabled = true; });
      li.setAttribute('aria-busy', 'true');
      api('/v1/admin/reviews/' + encodeURIComponent(it.loopId), { method: 'POST', body: { decision: decision } }).then(function () {
        items = items.filter(function (x) { return x.loopId !== it.loopId; });
        var name = (it.player && (it.player.displayName || it.player.username)) || 'Oyuncu';
        els.live.textContent = name + ' halkası ' + (decision === 'approve' ? 'onaylandı.' : 'reddedildi.');
        var next = li.nextElementSibling || li.previousElementSibling;
        li.remove();
        updateCount();
        if (!items.length) setState('empty', 'Kuyruk boş. İncelenecek halka yok.');
        var focusTo = next && next.querySelector('[data-action="approve"]');
        if (focusTo) focusTo.focus(); else els.refresh.focus();
        var stat = els.metrics.querySelector('[data-metric="reviewQueue"] dd');
        if (stat) stat.textContent = nf.format(items.length);
      }, function (e) {
        li.setAttribute('aria-busy', 'false');
        buttons.forEach(function (b) { b.disabled = false; });
        if (e && e.message === 'auth') return;
        err.textContent = 'Karar kaydedilemedi (' + (e.message || 'hata') + '). Tekrar dene.';
      });
    });
  }

  // ---------- boot ----------
  if (session.api && session.token) showApp();
  else showLogin();
})();
