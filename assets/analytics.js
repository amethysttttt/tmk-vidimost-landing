/* Согласие на cookie + аналитика (Google Analytics 4 и Яндекс Метрика).
   Счётчики загружаются ТОЛЬКО после согласия посетителя на аналитические cookie.
   Персональные данные (имя, телефон, ссылки) в счётчики не передаём. */
(function () {
  'use strict';
  var GA_ID = 'G-KHNE6V8072';
  var YM_ID = 114152302;
  var KEY = 'tmk_cookie_consent_v1';

  var gaReady = /^G-[A-Z0-9]+$/.test(GA_ID) && GA_ID.indexOf('XXXX') === -1;
  var ymReady = YM_ID > 0;
  var loaded = false;

  function readConsent() {
    try { var v = JSON.parse(window.localStorage.getItem(KEY) || 'null'); return v && typeof v.analytics === 'boolean' ? v : null; } catch (e) { return null; }
  }
  function saveConsent(analytics) {
    try { window.localStorage.setItem(KEY, JSON.stringify({ analytics: analytics, date: new Date().toISOString() })); } catch (e) {}
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  function loadCounters() {
    if (loaded) { return; }
    loaded = true;
    if (gaReady) {
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
      document.head.appendChild(s);
      window.gtag('js', new Date());
      window.gtag('config', GA_ID, { anonymize_ip: true });
    }
    if (ymReady) {
      (function (m, e, t, r, i, k, a) {
        m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
        m[i].l = 1 * new Date();
        for (var j = 0; j < e.scripts.length; j++) { if (e.scripts[j].src === r) { return; } }
        k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
      })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + YM_ID, 'ym');
      window.ym(YM_ID, 'init', { ssr: true, webvisor: true, clickmap: true, accurateTrackBounce: true, trackLinks: true });
    }
  }

  /* track('generate_lead', 'lead_form', {...}) - событие GA4 и цель Метрики; без согласия ничего не отправляет */
  window.track = function (gaEvent, ymGoal, params) {
    params = params || {};
    if (loaded) {
      try { if (gaReady && gaEvent) { window.gtag('event', gaEvent, params); } } catch (e) {}
      try { if (ymReady && ymGoal) { window.ym(YM_ID, 'reachGoal', ymGoal, params); } } catch (e) {}
    }
    if (window.location.search.indexOf('debug_events=1') !== -1 && window.console) {
      console.info('[track]', gaEvent, ymGoal, params, loaded ? 'sent' : 'no consent');
    }
  };

  /* ---------- Баннер согласия ---------- */
  var banner = null;
  var lastFocus = null;

  function closeBanner() {
    if (!banner) { return; }
    banner.parentNode.removeChild(banner);
    banner = null;
    document.documentElement.classList.remove('has-cookie-banner');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }
  function choose(analytics) {
    saveConsent(analytics);
    closeBanner();
    if (analytics) { loadCounters(); }
    else if (loaded) { window.location.reload(); }
  }
  function openBanner(fromSettings) {
    if (banner) { return; }
    lastFocus = document.activeElement;
    banner = document.createElement('section');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Настройки cookie');
    banner.innerHTML =
      '<div class="cookie-inner">' +
        '<p class="cookie-text"><b>Мы используем cookie.</b> Необходимые - чтобы сайт работал. Аналитические (Яндекс Метрика, Google Analytics) - только с вашего согласия, чтобы понимать, какие разделы полезны. ' +
        '<a href="/cookies">Подробнее о cookie</a></p>' +
        '<div class="cookie-actions">' +
          '<button type="button" class="btn cookie-btn" data-consent="all">Разрешить аналитику</button>' +
          '<button type="button" class="btn cookie-btn" data-consent="necessary">Только необходимые</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(banner);
    document.documentElement.classList.add('has-cookie-banner');
    banner.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-consent]') : null;
      if (b) { choose(b.getAttribute('data-consent') === 'all'); }
    });
    if (fromSettings) { var first = banner.querySelector('button'); if (first) { first.focus(); } }
  }

  document.addEventListener('click', function (e) {
    var s = e.target.closest ? e.target.closest('[data-cookie-settings]') : null;
    if (s) { e.preventDefault(); openBanner(true); }
  });

  var consent = readConsent();
  if (consent && consent.analytics) { loadCounters(); }
  function init() { if (!readConsent()) { openBanner(false); } }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
