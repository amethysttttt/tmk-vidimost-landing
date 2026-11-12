/* Поведение лендинга: цены по сфере, форма заявки, события аналитики, мобильная панель */
(function () {
  'use strict';

  var track = function (ga, ym, params) { if (typeof window.track === 'function') { window.track(ga, ym, params); } };
  var store = {
    get: function (k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) {} }
  };

  /* ---------- UTM: запоминаем метки первого захода в рамках сессии ---------- */
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  (function saveUtm() {
    var params = new URLSearchParams(window.location.search);
    var found = {};
    var has = false;
    UTM_KEYS.forEach(function (k) { var v = params.get(k); if (v) { found[k] = v.slice(0, 200); has = true; } });
    if (has) { store.set('tmk_utm', JSON.stringify(found)); }
    if (!store.get('tmk_ref') && document.referrer && document.referrer.indexOf(window.location.host) === -1) {
      store.set('tmk_ref', document.referrer.slice(0, 300));
    }
  })();

  /* ---------- Клики: CTA, пакеты, WhatsApp, телефон, почта ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a, button') : null;
    if (!a) { return; }
    var href = a.getAttribute('href') || '';
    var loc = a.getAttribute('data-loc') || a.getAttribute('data-cta') || 'page';

    if (a.hasAttribute('data-cta')) {
      track('cta_click', 'cta_click', { location: a.getAttribute('data-cta') });
    }
    if (a.hasAttribute('data-package')) {
      var pkg = a.getAttribute('data-package');
      var names = { start: 'Старт', rost: 'Рост', lider: 'Лидер' };
      var field = document.querySelector('#lead-form input[name="package"]');
      if (field) { field.value = (names[pkg] || pkg) + ' (' + currentNicheLabel() + ')'; }
      track('package_click', 'package_click', { package: pkg, niche: currentNiche() });
    }
    if (href.indexOf('wa.me/') !== -1) {
      track('click_whatsapp', 'click_whatsapp', { location: loc });
    } else if (href.indexOf('tel:') === 0) {
      track('click_phone', 'click_phone', { location: loc });
    } else if (href.indexOf('mailto:') === 0) {
      track('click_email', 'click_email', { location: loc });
    }
  });

  /* ---------- Цены по сфере бизнеса ---------- */
  var nicheLabels = { a: 'высокая конкуренция', b: 'средняя конкуренция', c: 'конкуренция ниже' };
  function currentNiche() {
    var r = document.querySelector('input[name="niche"]:checked');
    return r ? r.value : 'b';
  }
  function currentNicheLabel() { return nicheLabels[currentNiche()] || ''; }
  function formatPrice(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₸'; }
  function applyNiche(animate) {
    var n = currentNiche();
    var prices = document.querySelectorAll('[data-price]');
    for (var i = 0; i < prices.length; i++) {
      var el = prices[i];
      var v = el.getAttribute('data-' + n);
      if (!v) { continue; }
      el.textContent = formatPrice(v);
      if (animate) { el.classList.remove('price-flash'); void el.offsetWidth; el.classList.add('price-flash'); }
    }
  }
  var nicheInputs = document.querySelectorAll('input[name="niche"]');
  for (var ni = 0; ni < nicheInputs.length; ni++) {
    nicheInputs[ni].addEventListener('change', function () {
      applyNiche(true);
      track('niche_select', '', { niche: currentNiche() });
    });
  }
  applyNiche(false);

  /* ---------- Шапка: прозрачная над тёмным первым экраном, белая над светлой частью ---------- */
  var header = document.querySelector('.site-header');
  var heroEl = document.querySelector('.hero');
  if (header && heroEl) {
    var onScroll = function () {
      var limit = heroEl.offsetHeight * 0.5 - header.offsetHeight;
      header.classList.toggle('is-solid', window.scrollY > limit);
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  /* ---------- Мобильная панель: появляется после первого экрана, прячется у формы ---------- */
  var bar = document.querySelector('.mobile-bar');
  var hero = document.querySelector('.hero');
  var formSection = document.getElementById('zayavka');
  if (bar && hero && 'IntersectionObserver' in window) {
    var heroVisible = true;
    var formVisible = false;
    var update = function () {
      var show = !heroVisible && !formVisible;
      bar.classList.toggle('is-visible', show);
      bar.setAttribute('aria-hidden', show ? 'false' : 'true');
      var links = bar.querySelectorAll('a');
      for (var j = 0; j < links.length; j++) { links[j].tabIndex = show ? 0 : -1; }
    };
    new IntersectionObserver(function (en) { heroVisible = en[0].isIntersecting; update(); }, { threshold: 0 }).observe(hero);
    if (formSection) {
      new IntersectionObserver(function (en) { formVisible = en[0].isIntersecting; update(); }, { threshold: 0.05 }).observe(formSection);
    }
  }

  /* ---------- Форма заявки ---------- */
  var form = document.getElementById('lead-form');
  if (!form) { return; }

  var phone = form.querySelector('#f-phone');
  var status = form.querySelector('.form-status');
  var submitBtn = form.querySelector('button[type="submit"]');
  var submitText = submitBtn ? submitBtn.textContent : '';
  form.elements.started.value = String(Date.now());

  /* Маска телефона: +7 (XXX) XXX-XX-XX */
  function phoneDigits(value) {
    var d = String(value || '').replace(/\D/g, '');
    if (d.length === 11 && (d.charAt(0) === '8' || d.charAt(0) === '7')) { d = d.slice(1); }
    else if (d.charAt(0) === '7' && d.length > 10) { d = d.slice(1); }
    return d.slice(0, 10);
  }
  function formatPhone(d) {
    if (!d) { return ''; }
    var out = '+7 (' + d.slice(0, 3);
    if (d.length > 3) { out += ') ' + d.slice(3, 6); }
    if (d.length > 6) { out += '-' + d.slice(6, 8); }
    if (d.length > 8) { out += '-' + d.slice(8, 10); }
    return out;
  }
  /* Цифры номера без кода страны: «+7 ...» - отбрасываем 7; «8 7xx...» или «7 7xx...» из 11 цифр - отбрасываем первую */
  function inputDigits(raw, jump) {
    raw = String(raw || '').replace(/^(\s*\+7\s*\()\s*\+\s*7?/, '$1'); /* набрали «+7» поверх готового «+7 (» */
    var all = raw.replace(/\D/g, '');
    if (!/^\s*\+7/.test(raw)) { return phoneDigits(raw); }
    var rest = all.slice(1);
    /* Вставили номер целиком (8 747... или 7 747...) поверх «+7 (» - убираем лишний код страны */
    if (jump && rest.length >= 11 && /^[78]/.test(rest)) { rest = rest.slice(rest.length - 10); }
    return rest.slice(0, 10);
  }
  var prevDigits = '';
  phone.addEventListener('focus', function () { if (!phone.value) { phone.value = '+7 ('; } });
  phone.addEventListener('blur', function () { if (!inputDigits(phone.value, false)) { phone.value = ''; } });
  phone.addEventListener('beforeinput', function () { prevDigits = inputDigits(phone.value, false); });
  phone.addEventListener('input', function (e) {
    var type = (e && e.inputType) || '';
    var many = !!(e && e.data && e.data.replace(/\D/g, '').length > 1);
    var jump = many || type === 'insertFromPaste' || type === 'insertReplacementText' || type === '';
    var d = inputDigits(phone.value, jump);
    /* Набрали 11-ю цифру, а номер начинался с 7 или 8 - значит, это был код страны («7 700...», «8 700...»): сдвигаем */
    var allRest = String(phone.value).replace(/^(\s*\+7\s*\()\s*\+\s*7?/, '$1').replace(/\D/g, '').slice(/^\s*\+7/.test(phone.value) ? 1 : 0);
    if (!jump && type.indexOf('insert') === 0 && prevDigits.length === 10 && allRest.length === 11 && /^[78]/.test(prevDigits)) {
      d = allRest.slice(1);
    }
    /* Код оператора в Казахстане не начинается с 8: первую «8» считаем привычным «8-...» и пропускаем */
    if (!prevDigits && d === '8') { d = ''; }
    /* Стёрли скобку, пробел или дефис - стираем и цифру перед ним, чтобы удаление не «залипало» */
    if (type === 'deleteContentBackward' && d === prevDigits && d.length > 0) { d = d.slice(0, -1); }
    prevDigits = d;
    phone.value = d ? formatPhone(d) : (document.activeElement === phone ? '+7 (' : '');
  });

  /* form_start - один раз, на первом действии в форме */
  var started = false;
  form.addEventListener('input', function () {
    if (!started) { started = true; track('form_start', 'form_start', {}); }
  });

  function setError(name, on) {
    var box = form.querySelector('[data-field="' + name + '"]');
    if (!box) { return; }
    box.classList.toggle('has-error', on);
    var input = box.querySelector('input');
    if (input) {
      input.setAttribute('aria-invalid', on ? 'true' : 'false');
      if (on) { input.setAttribute('aria-describedby', 'e-' + name); } else { input.removeAttribute('aria-describedby'); }
    }
  }
  function validate() {
    var okName = form.elements.name.value.trim().length >= 2;
    var okPhone = inputDigits(phone.value, false).length === 10;
    var okConsent = form.elements.consent.checked;
    setError('name', !okName);
    setError('phone', !okPhone);
    setError('consent', !okConsent);
    var first = !okName ? form.elements.name : !okPhone ? phone : !okConsent ? form.elements.consent : null;
    if (first) { first.focus(); }
    return !first;
  }
  ['name', 'phone'].forEach(function (n) {
    form.elements[n].addEventListener('input', function () {
      var box = form.querySelector('[data-field="' + n + '"]');
      if (box && box.classList.contains('has-error')) {
        var ok = n === 'name' ? form.elements.name.value.trim().length >= 2 : inputDigits(phone.value, false).length === 10;
        if (ok) { setError(n, false); }
      }
    });
  });
  form.elements.consent.addEventListener('change', function () { if (form.elements.consent.checked) { setError('consent', false); } });

  function showError(html) {
    status.innerHTML = html;
    status.className = 'form-status is-error';
  }

  var sending = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) { return; }
    status.className = 'form-status';
    status.textContent = '';
    if (!validate()) { return; }

    var utm = {};
    try { utm = JSON.parse(store.get('tmk_utm') || '{}'); } catch (err) { utm = {}; }
    UTM_KEYS.forEach(function (k) { form.elements[k].value = utm[k] || ''; });
    form.elements.page.value = window.location.href.slice(0, 500);
    form.elements.referrer.value = store.get('tmk_ref') || '';

    var data = {};
    var fd = new FormData(form);
    fd.forEach(function (v, k) { data[k] = typeof v === 'string' ? v.trim() : ''; });
    data.phone = '+7' + inputDigits(phone.value, false);
    data.consent = form.elements.consent.checked ? 'yes' : '';

    sending = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем...';

    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) { controller.abort(); } }, 20000);

    fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; });
    }).then(function (r) {
      clearTimeout(timer);
      if (r.ok && r.body && r.body.ok) {
        store.set('tmk_lead', JSON.stringify({
          business_type: data.business_type || 'не указано',
          city: data.city || 'не указан',
          contact_method: data.contact_method || '',
          package: data.package || 'нет',
          t: Date.now()
        }));
        window.location.assign('/spasibo');
        return;
      }
      throw new Error((r.body && r.body.error) || 'server');
    }).catch(function (err) {
      clearTimeout(timer);
      sending = false;
      submitBtn.disabled = false;
      submitBtn.textContent = submitText;
      var msg = err && err.message === 'validation'
        ? 'Проверьте имя и телефон и отправьте ещё раз.'
        : 'Не получилось отправить заявку. Попробуйте ещё раз или <a href="https://wa.me/77479071622" target="_blank" rel="noopener" data-loc="form_error">напишите нам в WhatsApp</a> - ответим в рабочее время.';
      showError(msg);
      track('form_error', '', { reason: (err && err.message) || 'network' });
    });
  });
})();
