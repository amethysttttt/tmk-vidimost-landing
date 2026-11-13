/* CRM заявок TMK Techno Horizon: список, карточка, ручные заявки, настройки. Без сторонних библиотек. */
(function () {
  'use strict';

  var STATUSES = ['Новая', 'В работе', 'Готовится разбор', 'КП отправлено', 'Переговоры', 'Успешно', 'Отказ', 'Отложено'];
  var FINAL = ['Успешно', 'Отказ', 'Отложено'];
  var OPEN_RAZBOR = ['Новая', 'В работе', 'Готовится разбор'];
  var STATUS_CLASS = {
    'Новая': 'b-new', 'В работе': 'b-work', 'Готовится разбор': 'b-razbor', 'КП отправлено': 'b-kp',
    'Переговоры': 'b-talk', 'Успешно': 'b-ok', 'Отказ': 'b-no', 'Отложено': 'b-wait'
  };
  var SOURCES = { landing: 'SEO + GEO - лендинг', corporate: 'Корпоративный сайт', manual: 'Вручную' };
  var SERVICES = [
    'Бесплатный разбор SEO + GEO', 'Продвижение SEO + GEO',
    'Аудит сайта / системы', 'Разработка сайта', 'Автоматизация процессов', 'Система под бизнес',
    'Мобильное приложение', 'AI-решение', 'Не знаю - нужна консультация', 'Другое'
  ];
  var RAZBOR_SERVICE = 'Бесплатный разбор SEO + GEO';
  var REFUSAL = ['Дорого', 'Нет бюджета / не сейчас', 'Выбрали другого подрядчика', 'Делают своими силами',
    'Не отвечает', 'Нецелевая заявка', 'Спам / ошибочная заявка', 'Другое'];
  var MAX_FILE = 3 * 1024 * 1024;
  var ERR = {
    bad_credentials: 'Неверный логин или пароль.',
    locked: 'Слишком много попыток входа. Подождите 15 минут и попробуйте снова.',
    not_configured: 'CRM ещё не настроена на сервере. Обратитесь к разработчику.',
    storage_unavailable: 'Хранилище заявок временно недоступно. Попробуйте через минуту.',
    conflict: 'Карточку уже изменили в другой вкладке. Обновите её и внесите правки ещё раз.',
    name_required: 'Укажите имя или название компании.',
    phone_required: 'Укажите телефон: от 10 до 15 цифр.',
    bad_date: 'Проверьте даты.',
    bad_email: 'Проверьте адреса почты.',
    bad_holiday: 'Праздники укажите датами в формате ГГГГ-ММ-ДД через запятую.',
    weak_password: 'Новый пароль должен быть не короче 10 символов.',
    file_too_large: 'Файл больше 3 МБ. Сожмите его или загрузите ссылкой в заметках.',
    empty_file: 'Файл пустой.',
    validation: 'Проверьте заполненные поля.',
    forbidden: 'Запрос отклонён. Обновите страницу.',
    not_found: 'Заявка не найдена.'
  };

  var S = {
    login: '', leads: [], today: '', loaded: false,
    q: '', f: { status: '', source: '', service: '', from: '', to: '', overdue: false, active: '' },
    filtersOpen: false, card: null, dirty: false, saving: false
  };
  var app = document.getElementById('app');

  /* ---------- утилиты ---------- */
  function el(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') n.textContent = v;
        else if (k === 'class') n.className = v;
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
        else if (k === 'value') n.value = v;
        else if (k === 'checked') n.checked = !!v;
        else n.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(n, arguments[i]);
    return n;
  }
  function add(n, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(n, x); }); return; }
    n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function svg(path) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    path.split('|').forEach(function (d) {
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.appendChild(p);
    });
    return s;
  }
  var IC = {
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z|M20 20l-4-4',
    filter: 'M4 5h16|M7 12h10|M10 19h4',
    refresh: 'M20 11a8 8 0 1 0-2.3 5.7|M20 4v7h-7',
    plus: 'M12 5v14|M5 12h14',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
    chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
    close: 'M6 6l12 12|M18 6L6 18',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
    download: 'M12 4v11|M7 10l5 5 5-5|M5 20h14'
  };

  function api(method, action, body, query) {
    var url = '/api/crm?a=' + encodeURIComponent(action) + (query ? '&' + query : '');
    var opts = { method: method, credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
    if (method === 'POST') {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['X-CRM-Request'] = '1';
      opts.body = JSON.stringify(body || {});
    }
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: 'storage_unavailable' }; }).then(function (data) {
        if (res.status === 401 && action !== 'login' && action !== 'password') {
          S.dirty = false;
          renderLogin(data.error === 'session_expired' ? 'Сессия закрыта: пароль CRM изменён. Войдите с новым паролем.' : 'Сессия закончилась, войдите снова.');
          throw new Error('auth');
        }
        if (!res.ok || !data.ok) throw new Error(data.error || 'storage_unavailable');
        return data;
      });
    }, function () { throw new Error('storage_unavailable'); });
  }

  function errText(e) { return ERR[e && e.message] || 'Не получилось выполнить действие. Проверьте интернет и попробуйте снова.'; }

  function toast(text, kind, actionLabel, action) {
    var box = document.getElementById('toasts');
    var t = el('div', { class: 'toast' + (kind ? ' ' + kind : ''), role: kind === 'bad' ? 'alert' : 'status' }, text);
    if (actionLabel) t.appendChild(el('button', { type: 'button', text: actionLabel, onclick: function () { t.remove(); action(); } }));
    t.appendChild(el('button', { type: 'button', 'aria-label': 'Закрыть уведомление', text: '×', onclick: function () { t.remove(); } }));
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, kind === 'bad' ? 9000 : 4000);
  }

  var TZ = 'Asia/Almaty';
  function fmtDT(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString('ru-RU', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function fmtD(ymd) {
    if (!ymd) return '';
    var p = String(ymd).split('-');
    return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : ymd;
  }
  function ymdOf(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-CA', { timeZone: TZ });
  }
  function fmtPhone(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (d.length === 11 && d[0] === '7') return '+7 ' + d.slice(1, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7, 9) + ' ' + d.slice(9);
    return p || '';
  }
  function telHref(phone) { return 'tel:' + String(phone || '').replace(/[^\d+]/g, ''); }
  function waHref(phone) { return 'https://wa.me/' + String(phone || '').replace(/\D/g, ''); }
  function safeUrl(v) {
    v = String(v || '').trim();
    if (!v || /\s/.test(v)) return '';
    if (!/^https?:\/\//i.test(v)) {
      if (!/^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(v)) return '';
      v = 'https://' + v;
    }
    try { var u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch (e) { return ''; }
  }

  /* ---------- признаки сроков ---------- */
  function razborState(l) {
    if (!l.razbor_required || !l.razbor_due || OPEN_RAZBOR.indexOf(l.status) < 0) return null;
    if (l.razbor_due < S.today) return { cls: 'bad', text: 'Разбор просрочен: срок ' + fmtD(l.razbor_due) };
    if (l.razbor_due === S.today) return { cls: 'warn', text: 'Разбор: срок сегодня' };
    return { cls: 'ok', text: 'Разбор до ' + fmtD(l.razbor_due) };
  }
  function nextOverdue(l) {
    return !!(l.next_action_date && l.next_action_date < S.today && FINAL.indexOf(l.status) < 0);
  }
  function isOverdue(l) {
    var r = razborState(l);
    return nextOverdue(l) || !!(r && r.cls === 'bad');
  }

  /* ---------- вход ---------- */
  function renderLogin(message) {
    closeLayers();
    Array.prototype.forEach.call(document.querySelectorAll('.modal'), function (m) { m.remove(); });
    S.login = '';
    app.textContent = '';
    var err = el('p', { class: 'err', role: 'alert' }, message || '');
    var login = el('input', { class: 'i', name: 'username', autocomplete: 'username', required: true, id: 'l-login' });
    var pass = el('input', { class: 'i', type: 'password', name: 'password', autocomplete: 'current-password', required: true, id: 'l-pass' });
    var btn = el('button', { class: 'btn primary', type: 'submit', text: 'Войти' });
    var form = el('form', { novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      if (!login.value.trim() || !pass.value) { err.textContent = 'Введите логин и пароль.'; return; }
      btn.disabled = true; btn.textContent = 'Проверяем…'; err.textContent = '';
      api('POST', 'login', { login: login.value.trim(), password: pass.value }).then(function (d) {
        S.login = d.login;
        renderShell();
        loadLeads(true);
      }).catch(function (e2) {
        btn.disabled = false; btn.textContent = 'Войти';
        err.textContent = errText(e2);
        pass.value = ''; pass.focus();
      });
    } },
      el('img', { src: '/assets/logo-dark.png', alt: 'TMK Techno Horizon', width: 127, height: 22 }),
      el('h1', { text: 'CRM заявок' }),
      el('p', { text: 'Заявки с лендинга SEO + GEO и корпоративного сайта.' }),
      el('label', { class: 'f', for: 'l-login' }, el('span', { text: 'Логин' }), login),
      el('label', { class: 'f', for: 'l-pass' }, el('span', { text: 'Пароль' }), pass),
      err, btn
    );
    app.appendChild(el('div', { class: 'login' }, form));
    login.focus();
  }

  /* ---------- каркас ---------- */
  var els = {};
  function renderShell() {
    app.textContent = '';
    els.search = el('input', { class: 'i', type: 'search', placeholder: 'Имя, компания, телефон или сайт клиента', 'aria-label': 'Поиск по заявкам', value: S.q,
      oninput: function () { S.q = els.search.value; renderList(); } });
    els.counters = el('div', { class: 'counters' });
    els.filters = el('div', { class: 'filters' + (S.filtersOpen ? ' open' : ''), id: 'filters' });
    els.chips = el('div', { class: 'chips' });
    els.table = el('div', { class: 'tablewrap' });
    els.sub = el('div', { class: 'sub' });
    var top = el('header', { class: 'top' }, el('div', { class: 'in' },
      el('img', { src: '/assets/logo-dark.png', alt: 'TMK Techno Horizon', width: 116, height: 20 }),
      el('span', { class: 'title', text: 'CRM заявок' }),
      el('span', { class: 'sp' }),
      el('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Настройки', onclick: openSettings }, svg(IC.gear), el('span', { class: 'lbl', text: 'Настройки' })),
      el('button', { class: 'btn sm', type: 'button', text: 'Выйти', onclick: logout })
    ));
    var toolbar = el('div', { class: 'toolbar' },
      el('div', { class: 'search' }, svg(IC.search), els.search),
      el('button', { class: 'btn', type: 'button', 'aria-label': 'Фильтры', 'aria-expanded': String(S.filtersOpen), 'aria-controls': 'filters', onclick: function (e) {
        S.filtersOpen = !S.filtersOpen; els.filters.classList.toggle('open', S.filtersOpen);
        e.currentTarget.setAttribute('aria-expanded', String(S.filtersOpen));
      } }, svg(IC.filter), el('span', { class: 'lbl', text: 'Фильтры' })),
      el('button', { class: 'btn', type: 'button', 'aria-label': 'Обновить список', onclick: function () { loadLeads(false, true); } }, svg(IC.refresh), el('span', { class: 'lbl', text: 'Обновить' })),
      el('button', { class: 'btn', type: 'button', 'aria-label': 'Скачать CSV', onclick: exportCsv }, svg(IC.download), el('span', { class: 'lbl', text: 'CSV' })),
      el('button', { class: 'btn primary', type: 'button', 'aria-label': 'Добавить заявку', onclick: openManual }, svg(IC.plus), el('span', { class: 'lbl', text: 'Добавить заявку' }))
    );
    app.appendChild(top);
    app.appendChild(el('main', null,
      el('div', { class: 'head' }, el('div', null, el('h2', { class: 'h', text: 'Заявки' }), els.sub)),
      els.counters, toolbar, els.filters, els.chips, els.table));
    renderFilters();
    els.table.appendChild(el('div', { class: 'empty', text: 'Загружаем заявки…' }));
  }

  function renderFilters() {
    var f = els.filters;
    f.textContent = '';
    function sel(key, label, options) {
      var s = el('select', { class: 'i', id: 'f-' + key, onchange: function () { S.f[key] = s.value; renderList(); } },
        el('option', { value: '', text: 'Все' }),
        options.map(function (o) { var v = Array.isArray(o) ? o[0] : o; return el('option', { value: v, text: Array.isArray(o) ? o[1] : o }); }));
      s.value = S.f[key];
      return el('label', { class: 'f', for: 'f-' + key }, el('span', { text: label }), s);
    }
    function date(key, label) {
      var i = el('input', { class: 'i', type: 'date', id: 'f-' + key, value: S.f[key], onchange: function () { S.f[key] = i.value; renderList(); } });
      return el('label', { class: 'f', for: 'f-' + key }, el('span', { text: label }), i);
    }
    f.appendChild(sel('status', 'Статус', STATUSES));
    f.appendChild(sel('source', 'Источник', [['landing', SOURCES.landing], ['corporate', SOURCES.corporate], ['manual', 'Вручную (WhatsApp, звонок, другое)']]));
    f.appendChild(sel('service', 'Услуга', SERVICES));
    f.appendChild(date('from', 'Дата с'));
    f.appendChild(date('to', 'Дата по'));
  }

  function filtered() {
    var q = S.q.trim().toLowerCase();
    var qd = q.replace(/\D/g, '');
    return S.leads.filter(function (l) {
      var f = S.f;
      if (f.status && l.status !== f.status) return false;
      if (f.source && l.source !== f.source) return false;
      if (f.service && l.service !== f.service) return false;
      var day = ymdOf(l.created_at);
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
      if (f.overdue && !isOverdue(l)) return false;
      if (f.active === 'new' && l.status !== 'Новая') return false;
      if (f.active === 'work' && (l.status === 'Новая' || FINAL.indexOf(l.status) >= 0)) return false;
      if (q) {
        var hay = [l.name, l.company, l.link, l.phone].join(' ').toLowerCase();
        var phoneHit = qd.length >= 3 && String(l.phone).replace(/\D/g, '').indexOf(qd) >= 0;
        if (hay.indexOf(q) < 0 && !phoneHit && String(l.id) !== q.replace('№', '')) return false;
      }
      return true;
    });
  }

  function renderCounters() {
    var all = S.leads.length;
    var nNew = S.leads.filter(function (l) { return l.status === 'Новая'; }).length;
    var nWork = S.leads.filter(function (l) { return l.status !== 'Новая' && FINAL.indexOf(l.status) < 0; }).length;
    var nOver = S.leads.filter(isOverdue).length;
    els.counters.textContent = '';
    [['', all, 'Всего заявок'], ['new', nNew, 'Новые'], ['work', nWork, 'В работе'], ['overdue', nOver, 'Просрочены сроки']].forEach(function (c) {
      var on = c[0] === 'overdue' ? S.f.overdue : (c[0] ? S.f.active === c[0] : (!S.f.active && !S.f.overdue));
      els.counters.appendChild(el('button', { type: 'button', class: 'counter' + (on ? ' on' : '') + (c[0] === 'overdue' && c[1] ? ' alert' : ''), 'aria-pressed': String(on),
        onclick: function () {
          if (c[0] === 'overdue') { S.f.overdue = !S.f.overdue; S.f.active = ''; }
          else { S.f.active = c[0] && S.f.active !== c[0] ? c[0] : ''; S.f.overdue = false; }
          renderList();
        } }, el('b', { text: String(c[1]) }), el('span', { text: c[2] })));
    });
  }

  function renderChips() {
    els.chips.textContent = '';
    var labels = { status: 'Статус', source: 'Источник', service: 'Услуга', from: 'С', to: 'По' };
    Object.keys(labels).forEach(function (k) {
      if (!S.f[k]) return;
      var v = k === 'source' ? SOURCES[S.f[k]] : (k === 'from' || k === 'to' ? fmtD(S.f[k]) : S.f[k]);
      els.chips.appendChild(el('span', { class: 'chip' }, labels[k] + ': ' + v,
        el('button', { type: 'button', 'aria-label': 'Убрать фильтр «' + labels[k] + '»', text: '×', onclick: function () {
          S.f[k] = ''; renderFilters(); renderList();
        } })));
    });
    if (S.f.overdue) els.chips.appendChild(el('span', { class: 'chip' }, 'Просроченные',
      el('button', { type: 'button', 'aria-label': 'Убрать фильтр просроченных', text: '×', onclick: function () { S.f.overdue = false; renderList(); } })));
  }

  function renderList() {
    if (!els.table) return;
    renderCounters();
    renderChips();
    var list = filtered();
    els.sub.textContent = S.loaded ? 'Показано ' + list.length + ' из ' + S.leads.length + '. Сначала новые.' : '';
    els.table.textContent = '';
    if (!S.loaded) { els.table.appendChild(el('div', { class: 'empty', text: 'Загружаем заявки…' })); return; }
    if (!S.leads.length) {
      els.table.appendChild(el('div', { class: 'empty' }, el('b', { text: 'Заявок пока нет' }),
        'Заявки с обоих сайтов появятся здесь автоматически. Заявку из WhatsApp или звонка добавьте кнопкой «Добавить заявку».'));
      return;
    }
    if (!list.length) {
      els.table.appendChild(el('div', { class: 'empty' }, el('b', { text: 'Ничего не нашлось' }), 'Измените поиск или ',
        el('button', { class: 'btn sm', type: 'button', text: 'сбросьте фильтры', onclick: resetFilters })));
      return;
    }
    var tbody = el('tbody');
    list.forEach(function (l) {
      var r = razborState(l);
      var over = nextOverdue(l);
      var tr = el('tr', { tabindex: '0', 'aria-label': 'Открыть заявку №' + l.id, onclick: function () { openCard(l.id); },
        onkeydown: function (e) { if (e.key === 'Enter') openCard(l.id); } },
        el('td', { class: 'num', text: '№' + l.id }),
        el('td', { class: 'dt' }, fmtDT(l.created_at).split(', ')[0], el('span', { text: fmtDT(l.created_at).split(', ')[1] || '' })),
        el('td', { class: 'nm' }, el('b', { text: l.name || l.company || 'Без имени' }), l.name && l.company ? el('span', { text: l.company }) : null),
        el('td', { class: 'ph' }, fmtPhone(l.phone), l.repeat_phone ? el('span', { class: 'repeat', title: 'С этого номера есть другие заявки', text: 'повтор' }) : null),
        el('td', { class: 'sv' }, l.service || (l.message_short ? el('span', null, el('span', { class: 'hint', text: 'Запрос: ' }), l.message_short) : (l.form_label || '-'))),
        el('td', { class: 'src' }, el('span', { class: 'badge b-src-' + l.source, text: SOURCES[l.source] || l.source_label }),
          l.manual_channel ? el('span', { class: 'hint', text: ' ' + l.manual_channel }) : null),
        el('td', { class: 'st' }, el('span', { class: 'badge ' + (STATUS_CLASS[l.status] || 'b-wait'), text: l.status })),
        el('td', { class: 'nx' },
          l.next_action ? el('div', { text: l.next_action }) : null,
          l.next_action_date ? el('span', { class: over ? 'flag bad' : '', text: (over ? 'Просрочено: ' : '') + fmtD(l.next_action_date) }) : null,
          r ? el('div', { class: 'flag ' + r.cls, text: r.text }) : null,
          !l.next_action && !l.next_action_date && !r ? el('span', { text: '-' }) : null)
      );
      tbody.appendChild(tr);
    });
    els.table.appendChild(el('table', { class: 'leads' },
      el('thead', null, el('tr', null, ['№', 'Дата', 'Имя / компания', 'Телефон', 'Услуга', 'Источник', 'Статус', 'Следующее действие / срок']
        .map(function (h) { return el('th', { scope: 'col', text: h }); }))),
      tbody));
  }

  function resetFilters() {
    S.f = { status: '', source: '', service: '', from: '', to: '', overdue: false, active: '' };
    S.q = ''; els.search.value = '';
    renderFilters(); renderList();
  }

  function loadLeads(first, manual) {
    return api('GET', 'leads').then(function (d) {
      S.leads = d.leads || [];
      S.today = d.today || new Date().toLocaleDateString('en-CA', { timeZone: TZ });
      S.loaded = true;
      renderList();
      if (manual) toast('Список обновлён', 'ok');
      if (first) openFromHash();
    }).catch(function (e) {
      if (e.message === 'auth') return;
      S.loaded = true;
      els.table.textContent = '';
      els.table.appendChild(el('div', { class: 'empty' }, el('b', { text: 'Не удалось загрузить заявки' }), errText(e) + ' ',
        el('button', { class: 'btn sm', type: 'button', text: 'Повторить', onclick: function () { loadLeads(first); } })));
    });
  }

  function logout() {
    if (S.dirty && !confirm('Есть несохранённые изменения. Всё равно выйти?')) return;
    S.dirty = false;
    api('POST', 'logout', {}).catch(function () {}).then(function () { renderLogin('Вы вышли из CRM.'); });
  }

  /* ---------- экспорт ---------- */
  function exportCsv() {
    var list = filtered();
    var cols = [['id', '№'], ['created_at', 'Дата'], ['name', 'Имя'], ['company', 'Компания'], ['phone', 'Телефон'],
      ['service', 'Услуга'], ['source_label', 'Источник'], ['manual_channel', 'Канал'], ['status', 'Статус'],
      ['next_action', 'Следующее действие'], ['next_action_date', 'Дата действия'], ['razbor_due', 'Срок разбора']];
    function cell(v) {
      v = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
      return '"' + v.replace(/"/g, '""') + '"';
    }
    var rows = [cols.map(function (c) { return cell(c[1]); }).join(';')];
    list.forEach(function (l) {
      rows.push(cols.map(function (c) { return cell(c[0] === 'created_at' ? fmtDT(l.created_at) : l[c[0]]); }).join(';'));
    });
    var blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: 'zayavki-' + S.today + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    toast('Выгружено заявок: ' + list.length, 'ok');
  }

  /* ---------- карточка ---------- */
  var layer = null;
  function closeLayers() {
    if (layer) { layer.remove(); layer = null; }
    S.card = null; S.dirty = false;
    document.body.style.overflow = '';
  }

  function openFromHash() {
    var m = /^#lead-(\d+)$/.exec(location.hash);
    if (m) openCard(Number(m[1]));
  }

  function openCard(id) {
    if (S.card && S.dirty && !confirm('Изменения не сохранены. Закрыть карточку?')) return;
    closeLayers();
    var drawer = el('div', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Заявка №' + id },
      el('div', { class: 'empty', text: 'Открываем заявку №' + id + '…' }));
    layer = el('div', null, el('div', { class: 'scrim', onclick: tryClose }), drawer);
    document.body.appendChild(layer);
    document.body.style.overflow = 'hidden';
    if (location.hash !== '#lead-' + id) history.replaceState(null, '', '#lead-' + id);
    api('GET', 'lead', null, 'id=' + id).then(function (d) {
      S.card = d; S.dirty = false;
      S.today = d.today || S.today;
      renderCard(drawer);
    }).catch(function (e) {
      if (e.message === 'auth') return;
      drawer.textContent = '';
      drawer.appendChild(el('div', { class: 'empty' }, el('b', { text: 'Не удалось открыть заявку' }), errText(e) + ' ',
        el('button', { class: 'btn sm', type: 'button', text: 'Закрыть', onclick: function () { closeLayers(); history.replaceState(null, '', location.pathname); } })));
    });
  }

  function tryClose() {
    if (S.dirty && !confirm('Изменения не сохранены. Закрыть карточку?')) return;
    closeLayers();
    history.replaceState(null, '', location.pathname);
  }

  function renderCard(drawer) {
    var d = S.card, l = d.lead;
    var form = {};
    drawer.textContent = '';
    var stateEl = el('div', { class: 'state', text: 'Все изменения сохранены' });
    var saveBtn = el('button', { class: 'btn primary', type: 'button', text: 'Сохранить', onclick: save });

    function markDirty() {
      S.dirty = true;
      stateEl.textContent = 'Есть несохранённые изменения';
      stateEl.className = 'state dirty';
    }
    function input(key, label, opts) {
      opts = opts || {};
      var id = 'c-' + key;
      var node;
      if (opts.type === 'textarea') node = el('textarea', { class: 'i', id: id, rows: opts.rows || 3, maxlength: opts.max || 4000 });
      else if (opts.options) {
        node = el('select', { class: 'i', id: id }, opts.blank !== false ? el('option', { value: '', text: opts.blank || 'Не выбрано' }) : null,
          opts.options.map(function (o) { return el('option', { value: o, text: o }); }));
        if (l[key] && opts.options.indexOf(l[key]) < 0) node.appendChild(el('option', { value: l[key], text: l[key] }));
      } else node = el('input', { class: 'i', id: id, type: opts.type || 'text', maxlength: opts.max || 300, inputmode: opts.inputmode });
      node.value = l[key] || '';
      node.addEventListener('input', markDirty);
      node.addEventListener('change', function () { markDirty(); if (opts.onchange) opts.onchange(node.value); });
      form[key] = node;
      return el('label', { class: 'f' + (opts.full ? ' full' : '') + (opts.req ? ' req' : ''), for: id }, el('span', { text: label }), node,
        opts.hint ? el('span', { class: 'hint', text: opts.hint }) : null);
    }

    // шапка
    var r = razborState(l);
    var head = el('div', { class: 'dhead' },
      el('div', { class: 'row' },
        el('div', { style: 'flex:1;min-width:0' },
          el('h2', { text: 'Заявка №' + l.id + ': ' + (l.name || l.company || 'Без имени') }),
          el('div', { class: 'meta' },
            el('span', { class: 'badge b-src-' + l.source, text: l.source_label }),
            l.manual_channel ? el('span', { text: 'канал: ' + l.manual_channel }) : null,
            el('span', { text: fmtDT(l.created_at) }),
            el('span', { class: 'badge ' + (STATUS_CLASS[l.status] || 'b-wait'), text: l.status }))),
        el('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Закрыть карточку', onclick: tryClose }, svg(IC.close))),
      el('div', { class: 'acts' },
        el('a', { class: 'btn sm', href: telHref(l.phone) }, svg(IC.phone), 'Позвонить'),
        el('a', { class: 'btn sm', href: waHref(l.phone), target: '_blank', rel: 'noopener noreferrer' }, svg(IC.chat), 'Написать в WhatsApp'),
        el('span', { class: 'hint', style: 'align-self:center', text: fmtPhone(l.phone) })));

    var secs = [['s-client', 'Клиент'], ['s-work', 'Обработка'], ['s-razbor', 'Разбор'], ['s-kp', 'КП'], ['s-next', 'Дальше'], ['s-result', 'Результат'], ['s-hist', 'История']];
    var tabs = el('nav', { class: 'tabs', 'aria-label': 'Разделы карточки' }, secs.map(function (s, i) {
      return el('a', { href: '#' + s[0], class: i === 0 ? 'on' : '', onclick: function (e) {
        e.preventDefault();
        var t = document.getElementById(s[0]);
        tabLock = Date.now();
        Array.prototype.forEach.call(tabs.children, function (a) { a.classList.toggle('on', a === e.currentTarget); });
        if (t) body.scrollTo({ top: t.offsetTop - 8 });
      } , text: s[1] });
    }));
    head.appendChild(tabs);

    var notes = [];
    if (d.same_phone && d.same_phone.length) {
      notes.push(el('div', { class: 'note warn' }, 'С этого номера есть другие обращения: ',
        d.same_phone.map(function (s, i) {
          return [i ? ', ' : '', el('a', { href: '#lead-' + s.id, onclick: function (e) { e.preventDefault(); openCard(s.id); }, text: '№' + s.id }),
            ' (' + fmtDT(s.created_at).split(', ')[0] + ', ' + s.status + ')'];
        }), '. Заявки не объединяются автоматически.'));
    }
    if (r) notes.push(el('div', { class: 'note ' + (r.cls === 'ok' ? 'info' : r.cls) }, r.text + '. Обещание на лендинге: бесплатный разбор за 3 рабочих дня.'));
    if (nextOverdue(l)) notes.push(el('div', { class: 'note bad', text: 'Просрочено следующее действие: ' + (l.next_action || 'без описания') + ', дата ' + fmtD(l.next_action_date) + '.' }));
    var badNotify = (d.jobs || []).filter(function (j) { return j.status !== 'sent'; });
    var notifyLine = el('div', { class: 'note ' + (badNotify.length ? 'warn' : 'info') },
      'Уведомления: email - ' + (l.notify_email || 'нет данных') + '; WhatsApp - ' + (l.notify_wa || 'нет данных') + '. ',
      badNotify.length ? el('button', { class: 'btn sm', type: 'button', text: 'Отправить ещё раз', onclick: function (e) {
        e.currentTarget.disabled = true;
        api('POST', 'renotify', { id: l.id }).then(function (res) {
          toast('Уведомления отправлены повторно', 'ok');
          S.card = res; renderCard(drawer); loadLeads();
        }).catch(function (err) { if (err.message !== 'auth') toast(errText(err), 'bad'); e.target.disabled = false; });
      } }) : null);

    var isSeo = l.source === 'landing' || l.razbor_required || /SEO/.test(l.service || '');
    var razborBox = el('input', { type: 'checkbox', id: 'c-razbor_required', checked: !!l.razbor_required });
    razborBox.addEventListener('change', function () { markDirty(); form.razbor_required = razborBox; });
    form.razbor_required = razborBox;

    var statusSel;
    var body = el('div', { class: 'dbody' },
      notes,
      el('section', { class: 'sec', id: 's-client' },
        el('h3', { text: 'Данные клиента' }),
        el('p', { class: 'lead', text: 'Пришли из формы сайта или заполнены вручную. Источник фиксируется при создании.' }),
        el('div', { class: 'grid' },
          input('name', 'Имя', { max: 80 }),
          input('company', 'Компания', { max: 200 }),
          input('phone', 'Телефон', { type: 'tel', max: 30, req: true }),
          input('link', 'Сайт / 2ГИС / Instagram', { max: 300 }),
          input('business_type', 'Сфера', { max: 80 }),
          input('city', 'Город', { max: 60 }),
          input('contact_method', 'Как удобнее связаться', { options: ['WhatsApp', 'Звонок', 'Telegram'] }),
          input('service', 'Интересующая услуга', { options: SERVICES }),
          input('message', 'Сообщение клиента', { type: 'textarea', full: true, rows: 3 })),
        safeUrl(l.link) ? el('p', { class: 'hint', style: 'margin:8px 0 0' }, 'Ссылка клиента: ',
          el('a', { href: safeUrl(l.link), target: '_blank', rel: 'noopener noreferrer nofollow', text: l.link })) : null,
        el('dl', { class: 'kv' },
          kv('Исходный сайт', l.source_label + (l.manual_channel ? ' (' + l.manual_channel + ')' : '')),
          kv('Форма', l.form_label),
          kv('Дата заявки', fmtDT(l.created_at)),
          kv('Страница формы', l.page_url),
          kv('Язык страницы', ({ ru: 'русский', en: 'английский', kk: 'казахский' })[l.locale] || l.locale),
          kv('Пакет на лендинге', l.package),
          kv('UTM', [l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content, l.utm_term].filter(String).join(' / ')),
          kv('Откуда пришёл', l.referrer),
          kv('Согласие с политикой', l.consent_policy),
          kv('Согласие на материалы', l.consent_marketing)),
        notifyLine),
      el('section', { class: 'sec', id: 's-work' },
        el('h3', { text: 'Обработка' }),
        el('div', { class: 'grid' },
          (function () {
            var wrap = input('status', 'Статус', { options: STATUSES, blank: false, onchange: function (v) {
              refusalWrap.style.display = v === 'Отказ' ? '' : 'none';
            } });
            statusSel = form.status;
            return wrap;
          })(),
          input('contact_date', 'Дата контакта', { type: 'date' }),
          input('call_result', 'Результат разговора', { type: 'textarea', full: true }),
          input('needs', 'Потребности и проблемы клиента', { type: 'textarea', full: true }),
          input('notes', 'Заметки', { type: 'textarea', full: true, rows: 4, max: 8000 }))),
      el('section', { class: 'sec', id: 's-razbor' },
        el('h3', { text: isSeo ? 'Бесплатный разбор SEO + GEO' : 'Диагностика' }),
        el('p', { class: 'lead', text: isSeo ? 'Что нашли в поиске, на картах и в ответах ИИ. Срок - 3 рабочих дня с даты заявки, без выходных и праздников РК.'
          : 'Задачи бизнеса и первичная диагностика. Срок трёх рабочих дней к таким заявкам автоматически не применяется.' }),
        el('label', { class: 'hint', style: 'display:flex;gap:8px;align-items:center;margin-bottom:12px', for: 'c-razbor_required' }, razborBox,
          'Это заявка на бесплатный разбор SEO + GEO (срок 3 рабочих дня)' + (l.razbor_due ? ', срок ' + fmtD(l.razbor_due) : '')),
        el('div', { class: 'grid' },
          isSeo ? input('razbor_search', 'Поиск: Google и Яндекс', { type: 'textarea', full: true, max: 6000 }) : null,
          isSeo ? input('razbor_maps', 'Карты: 2ГИС, Яндекс, Google', { type: 'textarea', full: true, max: 6000 }) : null,
          isSeo ? input('razbor_ai', 'Ответы ИИ', { type: 'textarea', full: true, max: 6000 }) : null,
          input('diag_notes', isSeo ? 'Выводы и другие заметки' : 'Задачи бизнеса и диагностика', { type: 'textarea', full: true, rows: 4, max: 8000 })),
        filesBlock('razbor', 'Файлы разбора')),
      el('section', { class: 'sec', id: 's-kp' },
        el('h3', { text: 'КП и переговоры' }),
        el('div', { class: 'grid' },
          input('kp_sent_date', 'Дата отправки КП', { type: 'date' }),
          input('kp_package', 'Пакет или название предложения', { max: 120 }),
          input('kp_amount', 'Сумма, ₸ (необязательно)', { max: 40, inputmode: 'numeric' }),
          input('kp_comment', 'Комментарии', { type: 'textarea', full: true })),
        filesBlock('kp', 'Файл КП')),
      el('section', { class: 'sec', id: 's-next' },
        el('h3', { text: 'Следующее действие' }),
        el('p', { class: 'lead', text: 'Если дата пройдёт, а заявка не завершена, CRM покажет просрочку. Статус сам не меняется.' }),
        el('div', { class: 'grid' },
          input('next_action', 'Что сделать', { max: 500 }),
          input('next_action_date', 'Дата следующего контакта', { type: 'date' }))),
      el('section', { class: 'sec', id: 's-result' },
        el('h3', { text: 'Результат' }),
        el('p', { class: 'lead', text: 'Итог задаётся статусом «Успешно», «Отказ» или «Отложено». Дата завершения ставится автоматически, её можно поправить.' }),
        el('div', { class: 'grid' },
          input('closed_date', 'Дата завершения', { type: 'date' }))),
      el('section', { class: 'sec', id: 's-hist' },
        el('h3', { text: 'История' }),
        historyList(d.history || []))
    );
    var refusalWrap = input('refusal_reason', 'Причина отказа', { options: REFUSAL });
    refusalWrap.style.display = l.status === 'Отказ' ? '' : 'none';
    var resultGrid = body.querySelector('#s-result .grid');
    resultGrid.appendChild(refusalWrap);
    resultGrid.appendChild(input('result_comment', 'Комментарий к результату', { type: 'textarea', full: true }));

    // подсветка раздела во вкладках
    var tabLock = 0;
    body.addEventListener('scroll', function () {
      if (Date.now() - tabLock < 900) return;
      var cur = secs[0][0];
      secs.forEach(function (s) { var t = document.getElementById(s[0]); if (t && t.offsetTop - 30 <= body.scrollTop) cur = s[0]; });
      Array.prototype.forEach.call(tabs.children, function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + cur); });
    }, { passive: true });

    var foot = el('div', { class: 'dfoot' }, stateEl, el('button', { class: 'btn', type: 'button', text: 'Закрыть', onclick: tryClose }), saveBtn);
    drawer.appendChild(head); drawer.appendChild(body); drawer.appendChild(foot);
    drawer.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') tryClose();
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    });
    (statusSel || saveBtn).focus({ preventScroll: true });

    function kv(k, v) { return v ? [el('dt', { text: k }), el('dd', { text: v })] : null; }

    function filesBlock(kind, title) {
      var files = (d.files || []).filter(function (f) { return f.kind === kind; });
      var fileInput = el('input', { type: 'file', class: 'sr', id: 'up-' + kind, accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt,.csv' });
      var comment = el('input', { class: 'i', placeholder: 'Комментарий к файлу (необязательно)', maxlength: 500, style: 'flex:1 1 220px;min-height:32px;padding:4px 10px;font-size:13.5px' });
      var btn = el('label', { class: 'btn sm', for: 'up-' + kind, tabindex: '0', onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } }, svg(IC.plus), 'Добавить файл');
      fileInput.addEventListener('change', function () {
        var f = fileInput.files[0];
        if (!f) return;
        if (f.size > MAX_FILE) { toast(ERR.file_too_large, 'bad'); fileInput.value = ''; return; }
        if (S.dirty) { toast('Сначала сохраните изменения карточки', 'bad'); fileInput.value = ''; return; }
        var reader = new FileReader();
        btn.textContent = 'Загружаем…';
        reader.onload = function () {
          var b64 = String(reader.result).split(',')[1] || '';
          api('POST', 'upload', { lead_id: l.id, kind: kind, name: f.name, mime: f.type || 'application/octet-stream', b64: b64, comment: comment.value })
            .then(function () { toast('Файл добавлен', 'ok'); openCard(l.id); })
            .catch(function (e) { if (e.message !== 'auth') { toast(errText(e), 'bad'); openCard(l.id); } });
        };
        reader.onerror = function () { toast('Не удалось прочитать файл', 'bad'); };
        reader.readAsDataURL(f);
      });
      return el('div', null,
        el('h4', { style: 'margin:14px 0 0;font-size:14px', text: title }),
        files.length ? el('ul', { class: 'files' }, files.map(function (f) {
          return el('li', null, el('a', { href: '/api/crm?a=file&id=' + encodeURIComponent(f.file_id), text: f.name }),
            f.comment ? el('em', { class: 'hint', text: f.comment }) : null,
            el('span', { text: Math.max(1, Math.round(Number(f.size) / 1024)) + ' КБ, ' + fmtDT(f.uploaded_at) }));
        })) : el('p', { class: 'hint', style: 'margin:6px 0 0', text: 'Файлов пока нет. До 3 МБ, доступны только после входа в CRM.' }),
        el('div', { class: 'upl' }, fileInput, btn, comment));
    }

    function save() {
      if (S.saving) return;
      var patch = {};
      Object.keys(form).forEach(function (k) {
        var node = form[k];
        var v = node.type === 'checkbox' ? (node.checked ? 'да' : '') : node.value.trim();
        if (String(l[k] || '') !== v) patch[k] = v;
      });
      if (!Object.keys(patch).length) { S.dirty = false; stateEl.textContent = 'Изменений нет'; stateEl.className = 'state'; return; }
      if (patch.phone !== undefined && String(patch.phone).replace(/\D/g, '').length < 10) { toast(ERR.phone_required, 'bad'); form.phone.focus(); return; }
      if (!(form.name.value.trim() || form.company.value.trim())) { toast(ERR.name_required, 'bad'); form.name.focus(); return; }
      S.saving = true; saveBtn.disabled = true; saveBtn.textContent = 'Сохраняем…';
      api('POST', 'update', { id: l.id, version: l.version, patch: patch }).then(function () {
        S.saving = false; S.dirty = false;
        toast('Заявка №' + l.id + ' сохранена', 'ok');
        return api('GET', 'lead', null, 'id=' + l.id).then(function (fresh) {
          S.card = fresh; renderCard(drawer); loadLeads();
        });
      }).catch(function (e) {
        S.saving = false; saveBtn.disabled = false; saveBtn.textContent = 'Сохранить';
        if (e.message === 'auth') return;
        if (e.message === 'conflict') toast(ERR.conflict, 'bad', 'Обновить', function () { S.dirty = false; openCard(l.id); });
        else toast('Не сохранено. ' + errText(e), 'bad');
      });
    }
  }

  function historyList(items) {
    if (!items.length) return el('p', { class: 'hint', text: 'Пока пусто.' });
    return el('ol', { class: 'hist' }, items.slice().reverse().map(function (h) {
      return el('li', { class: h.kind === 'status' ? 'status' : '' },
        el('time', { text: fmtDT(h.at) }), el('div', { text: h.text }),
        h.kind !== 'status' && (h.new_value || h.old_value) && h.field ? el('div', { class: 'ch', text: (h.old_value ? 'было: ' + h.old_value + '; ' : '') + 'стало: ' + (h.new_value || 'пусто') }) : null);
    }));
  }

  /* ---------- модальные окна ---------- */
  function modal(title, bodyNodes, footNodes, onClose) {
    var box = el('div', { class: 'box', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div', { class: 'mh' }, el('h2', { text: title }), el('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Закрыть', onclick: close }, svg(IC.close))),
      el('div', { class: 'mb' }, bodyNodes), el('div', { class: 'mf' }, footNodes));
    var m = el('div', { class: 'modal', onclick: function (e) { if (e.target === m) close(); } }, box);
    m.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    function close() { m.remove(); if (onClose) onClose(); }
    document.body.appendChild(m);
    var first = box.querySelector('input,select,textarea');
    if (first) first.focus();
    return { close: close, box: box };
  }
  function field(id, label, node, req, hint) {
    node.id = id;
    return el('label', { class: 'f' + (req ? ' req' : ''), for: id }, el('span', { text: label }), node, hint ? el('span', { class: 'hint', text: hint }) : null);
  }

  function openManual() {
    var name = el('input', { class: 'i', maxlength: 80, autocomplete: 'off' });
    var company = el('input', { class: 'i', maxlength: 200, autocomplete: 'off' });
    var phone = el('input', { class: 'i', type: 'tel', maxlength: 30, placeholder: '+7 700 000 00 00', autocomplete: 'off' });
    var channel = el('select', { class: 'i' }, ['WhatsApp', 'Звонок', 'Другое'].map(function (c) { return el('option', { value: c, text: c }); }));
    var service = el('select', { class: 'i' }, el('option', { value: '', text: 'Не выбрано' }), SERVICES.map(function (c) { return el('option', { value: c, text: c }); }));
    var message = el('textarea', { class: 'i', maxlength: 4000, rows: 3 });
    var razbor = el('input', { type: 'checkbox', id: 'm-razbor' });
    service.addEventListener('change', function () { razbor.checked = service.value === RAZBOR_SERVICE; });
    var err = el('p', { class: 'err', role: 'alert' });
    var btn = el('button', { class: 'btn primary', type: 'button', text: 'Создать заявку', onclick: submit });
    var m = modal('Новая заявка', [
      el('p', { class: 'hint', style: 'margin:0', text: 'Например, клиент написал в WhatsApp или позвонил. Обязательны имя или компания и телефон.' }),
      el('div', { class: 'grid' },
        field('m-name', 'Имя', name), field('m-company', 'Компания', company),
        field('m-phone', 'Телефон', phone, true), field('m-channel', 'Откуда обращение', channel, true),
        el('div', { class: 'full' }, field('m-service', 'Интересующая услуга', service)),
        el('div', { class: 'full' }, field('m-message', 'Что хочет клиент', message))),
      el('label', { class: 'hint', style: 'display:flex;gap:8px;align-items:center', for: 'm-razbor' }, razbor, 'Бесплатный разбор SEO + GEO: поставить срок 3 рабочих дня'),
      err
    ], [el('button', { class: 'btn', type: 'button', text: 'Отмена', onclick: function () { m.close(); } }), btn]);
    function submit() {
      err.textContent = '';
      if (!name.value.trim() && !company.value.trim()) { err.textContent = ERR.name_required; name.focus(); return; }
      var digits = phone.value.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) { err.textContent = ERR.phone_required; phone.focus(); return; }
      btn.disabled = true; btn.textContent = 'Создаём…';
      api('POST', 'create', { lead: { name: name.value.trim(), company: company.value.trim(), phone: phone.value.trim(),
        manual_channel: channel.value, service: service.value, message: message.value.trim(), razbor_required: razbor.checked ? 'да' : '' } })
        .then(function (res) {
          m.close();
          toast('Заявка №' + res.id + ' создана' + (res.same_phone && res.same_phone.length ? '. С этого номера уже были обращения' : ''), 'ok');
          loadLeads().then(function () { openCard(res.id); });
        }).catch(function (e) {
          btn.disabled = false; btn.textContent = 'Создать заявку';
          if (e.message !== 'auth') err.textContent = errText(e);
        });
    }
  }

  function openSettings() {
    var loading = modal('Настройки', [el('p', { class: 'hint', text: 'Загружаем настройки…' })], []);
    api('GET', 'settings').then(function (d) {
      loading.close();
      renderSettings(d.settings || {});
    }).catch(function (e) { loading.close(); if (e.message !== 'auth') toast(errText(e), 'bad'); });
  }

  function renderSettings(st) {
    function inp(key, attrs) { var n = el('input', Object.assign({ class: 'i', value: st[key] || '' }, attrs || {})); return n; }
    var emails = inp('NOTIFY_EMAILS', { maxlength: 500 });
    var copyEmails = inp('LANDING_COPY_EMAILS', { maxlength: 500 });
    var provider = el('select', { class: 'i' }, [['none', 'Не подключён'], ['meta', 'WhatsApp Business Platform (Meta Cloud API)'], ['callmebot', 'CallMeBot (личные уведомления)']]
      .map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
    provider.value = st.WA_PROVIDER || 'none';
    var waTo = inp('WA_TO', { maxlength: 20, inputmode: 'numeric' });
    var phoneId = inp('WA_META_PHONE_ID', { maxlength: 40 });
    var template = inp('WA_META_TEMPLATE', { maxlength: 100 });
    var lang = inp('WA_META_LANG', { maxlength: 10 });
    var token = el('input', { class: 'i', type: 'password', autocomplete: 'new-password', placeholder: st.WA_META_TOKEN_SET ? 'Задан. Оставьте пустым, чтобы не менять' : 'Не задан' });
    var cmbKey = el('input', { class: 'i', type: 'password', autocomplete: 'new-password', placeholder: st.WA_CALLMEBOT_KEY_SET ? 'Задан. Оставьте пустым, чтобы не менять' : 'Не задан' });
    var metaBox = el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
      field('s-phoneid', 'Phone number ID отправителя', phoneId),
      field('s-token', 'Постоянный токен доступа', token),
      field('s-tpl', 'Шаблон сообщения (имя)', template, false, 'Пять переменных: №, сайт, услуга, имя и телефон, ссылка на CRM. Без шаблона Meta доставит текст только в течение 24 часов после вашего последнего сообщения.'),
      field('s-lang', 'Язык шаблона', lang));
    var cmbBox = el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, field('s-cmb', 'API-ключ CallMeBot', cmbKey));
    function sync() { metaBox.style.display = provider.value === 'meta' ? '' : 'none'; cmbBox.style.display = provider.value === 'callmebot' ? '' : 'none'; }
    provider.addEventListener('change', sync); sync();
    var holidays = el('textarea', { class: 'i', rows: 4, maxlength: 4000, value: st.HOLIDAYS || '' });
    var cur = el('input', { class: 'i', type: 'password', autocomplete: 'current-password' });
    var nw = el('input', { class: 'i', type: 'password', autocomplete: 'new-password', minlength: 10 });
    var nw2 = el('input', { class: 'i', type: 'password', autocomplete: 'new-password' });
    var err = el('p', { class: 'err', role: 'alert' });
    var saveBtn = el('button', { class: 'btn primary', type: 'button', text: 'Сохранить настройки', onclick: saveSettings });
    function testBtn(ch, label) {
      return el('button', { class: 'btn sm', type: 'button', text: label, onclick: function (e) {
        var b = e.currentTarget; b.disabled = true;
        api('POST', 'notify_test', { channel: ch }).then(function (r) {
          b.disabled = false;
          if (r.result && r.result.status === 'sent') toast('Проверочное сообщение отправлено', 'ok');
          else toast('Не отправлено: ' + ((r.result && r.result.error) || 'ошибка'), 'bad');
        }).catch(function (er) { b.disabled = false; if (er.message !== 'auth') toast(errText(er), 'bad'); });
      } });
    }
    var m = modal('Настройки', [
      el('fieldset', null, el('legend', { text: 'Email-уведомления' }),
        field('s-emails', 'О каждой заявке с обоих сайтов', emails, false, 'Через запятую. Эти адреса видны только здесь, на сайтах их нет.'),
        field('s-copy', 'Дополнительно о заявках с лендинга', copyEmails),
        el('div', null, testBtn('email', 'Отправить проверочное письмо'))),
      el('fieldset', null, el('legend', { text: 'WhatsApp-уведомления' }),
        field('s-provider', 'Способ отправки', provider, false, 'Ссылка wa.me сама сообщения не отправляет: нужен подключённый провайдер.'),
        field('s-wato', 'Номер получателя', waTo, false, 'Только цифры, например 77479071622.'),
        metaBox, cmbBox,
        el('div', null, testBtn('whatsapp', 'Отправить проверочное сообщение'))),
      el('fieldset', null, el('legend', { text: 'Праздники РК для срока разбора' }),
        field('s-hol', 'Нерабочие дни, кроме суббот и воскресений', holidays, false, 'Даты ГГГГ-ММ-ДД через запятую. Проверьте переносы по постановлению Правительства на год.')),
      el('fieldset', null, el('legend', { text: 'Смена пароля' }),
        field('s-cur', 'Текущий пароль', cur), field('s-new', 'Новый пароль, от 10 символов', nw), field('s-new2', 'Новый пароль ещё раз', nw2),
        el('div', null, el('button', { class: 'btn sm', type: 'button', text: 'Сменить пароль', onclick: changePassword }))),
      err
    ], [el('button', { class: 'btn', type: 'button', text: 'Закрыть', onclick: function () { m.close(); } }), saveBtn]);

    function saveSettings() {
      err.textContent = '';
      var s = { NOTIFY_EMAILS: emails.value, LANDING_COPY_EMAILS: copyEmails.value, WA_PROVIDER: provider.value,
        WA_TO: waTo.value.replace(/\D/g, ''), WA_META_PHONE_ID: phoneId.value.trim(), WA_META_TEMPLATE: template.value.trim(),
        WA_META_LANG: lang.value.trim() || 'ru', HOLIDAYS: holidays.value };
      if (token.value.trim()) s.WA_META_TOKEN = token.value.trim();
      if (cmbKey.value.trim()) s.WA_CALLMEBOT_KEY = cmbKey.value.trim();
      saveBtn.disabled = true;
      api('POST', 'settings', { settings: s }).then(function () {
        saveBtn.disabled = false; toast('Настройки сохранены', 'ok'); m.close();
      }).catch(function (e) { saveBtn.disabled = false; if (e.message !== 'auth') err.textContent = errText(e); });
    }
    function changePassword() {
      err.textContent = '';
      if (nw.value.length < 10) { err.textContent = ERR.weak_password; nw.focus(); return; }
      if (nw.value !== nw2.value) { err.textContent = 'Новые пароли не совпадают.'; nw2.focus(); return; }
      api('POST', 'password', { current: cur.value, new: nw.value }).then(function () {
        cur.value = nw.value = nw2.value = '';
        toast('Пароль изменён. На других устройствах нужно будет войти заново.', 'ok');
      }).catch(function (e) { if (e.message !== 'auth') err.textContent = errText(e); });
    }
  }

  /* ---------- запуск ---------- */
  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('hashchange', function () { if (S.login) openFromHash(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S.login && !S.card && S.loaded) loadLeads();
  });
  setInterval(function () { if (document.visibilityState === 'visible' && S.login && !S.card) loadLeads(); }, 120000);

  api('GET', 'session').then(function (d) {
    if (d.auth) { S.login = d.login; renderShell(); loadLeads(true); }
    else renderLogin();
  }).catch(function () { renderLogin('Не удалось связаться с сервером. Обновите страницу.'); });
})();
