// Universal-link fallback pages (/invite/<code>, /r/<path>): build the app deep link
// (hexrun://invite/<code>) and show store links. No automatic redirect: if the app were
// installed, the OS would have opened the universal link before this page loaded.
(function () {
  'use strict';
  var root = document.querySelector('[data-applink]');
  if (!root) return;

  var kind = root.getAttribute('data-kind') === 'r' ? 'r' : 'invite';
  var scheme = root.getAttribute('data-scheme') || 'hexrun';
  var SEG = /^[A-Za-z0-9_-]{1,64}$/;

  function segmentsFromPath() {
    var path = window.location.pathname;
    var m = path.match(kind === 'invite' ? /^(?:\/en)?\/invite\/(.*)$/ : /^(?:\/en)?\/r\/(.*)$/);
    var rest = m ? m[1] : '';
    var segs = rest.split('/').filter(function (s) { return s && s !== 'index.html'; });
    if (!segs.length) {
      var q = new URLSearchParams(window.location.search).get(kind === 'invite' ? 'code' : 'p');
      if (q) segs = q.split('/').filter(Boolean);
    }
    try {
      segs = segs.map(function (s) { return decodeURIComponent(s); });
    } catch (e) {
      return null;
    }
    return segs;
  }

  var segs = segmentsFromPath();
  var valid =
    segs && segs.length > 0 &&
    segs.length <= (kind === 'invite' ? 1 : 4) &&
    segs.every(function (s) { return SEG.test(s); });

  var openBtn = root.querySelector('[data-open]');
  var missing = root.querySelector('[data-missing]');
  if (!valid) {
    if (missing) missing.hidden = false;
    return;
  }

  var tail = kind + '/' + segs.map(encodeURIComponent).join('/');
  var deepLink = scheme + '://' + tail;
  var href = deepLink;

  // Android: an intent URL opens the app or falls back to the Play Store / this page.
  if (/Android/i.test(navigator.userAgent)) {
    var fallback = root.getAttribute('data-play') || window.location.href;
    href = 'intent://' + tail + '#Intent;scheme=' + scheme +
      ';S.browser_fallback_url=' + encodeURIComponent(fallback) + ';end';
  }

  openBtn.href = href;
  openBtn.setAttribute('data-deeplink', deepLink);
  openBtn.hidden = false;

  if (kind === 'invite') {
    var wrap = root.querySelector('[data-code-wrap]');
    var codeEl = root.querySelector('[data-code]');
    if (wrap && codeEl) {
      codeEl.textContent = segs[0];
      wrap.hidden = false;
    }
  }

  // Keep the code when switching language.
  var alt = root.getAttribute('data-alt');
  var sw = document.querySelector('[data-lang-switch]');
  if (alt && sw) sw.href = alt + segs.map(encodeURIComponent).join('/');
})();
