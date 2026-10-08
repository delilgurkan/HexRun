// Waitlist form: POST {email, locale} as JSON to <api>/v1/waitlist. No framework, CSP-safe.
(function () {
  'use strict';
  var form = document.getElementById('waitlist-form');
  if (!form || !window.fetch) return;

  var MSG = {
    tr: {
      sending: 'Gönderiliyor…',
      ok: 'Listedesin. Şehrinde açıldığımızda sana yazacağız.',
      dup: 'Bu adres zaten listede. Açılışta haber vereceğiz.',
      invalid: 'Bu e-posta adresi geçerli görünmüyor. Kontrol edip tekrar dener misin?',
      rate: 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.',
      server: 'Şu an kaydedemedik. Lütfen biraz sonra tekrar dene.',
      network: 'Bağlantı kurulamadı. İnternet bağlantını kontrol edip tekrar dene.'
    },
    en: {
      sending: 'Sending…',
      ok: "You're on the list. We'll write when we open in your city.",
      dup: "This address is already on the list. We'll let you know at launch.",
      invalid: "That email address doesn't look right. Could you check it and try again?",
      rate: 'Too many attempts. Please try again in a few minutes.',
      server: "We couldn't save that right now. Please try again a bit later.",
      network: "We couldn't connect. Check your internet connection and try again."
    }
  };
  var locale = form.getAttribute('data-locale') === 'en' ? 'en' : 'tr';
  var t = MSG[locale];
  var api = (form.getAttribute('data-api') || '').replace(/\/$/, '');
  var input = form.querySelector('input[type="email"]');
  var button = form.querySelector('button[type="submit"]');
  var status = document.getElementById('wl-status');
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var busy = false;

  function show(state, text) {
    status.setAttribute('data-state', state);
    status.textContent = text;
  }
  function setInvalid(on) {
    if (on) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  input.addEventListener('input', function () {
    if (input.getAttribute('aria-invalid')) setInvalid(false);
  });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (busy) return;
    var email = (input.value || '').trim();
    if (!EMAIL.test(email) || email.length > 254) {
      setInvalid(true);
      show('error', t.invalid);
      input.focus();
      return;
    }
    setInvalid(false);
    busy = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    show('pending', t.sending);

    fetch(api + '/v1/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: email, locale: locale }),
      credentials: 'omit',
      mode: 'cors'
    })
      .then(function (res) {
        if (res.ok) {
          show('success', t.ok);
          form.reset();
        } else if (res.status === 409) {
          show('success', t.dup);
        } else if (res.status === 400 || res.status === 422) {
          setInvalid(true);
          show('error', t.invalid);
          input.focus();
        } else if (res.status === 429) {
          show('error', t.rate);
        } else {
          show('error', t.server);
        }
      })
      .catch(function () {
        show('error', t.network);
      })
      .then(function () {
        busy = false;
        button.disabled = false;
        form.removeAttribute('aria-busy');
      });
  });
})();
