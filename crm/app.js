/* TMK Techno Horizon CRM */
(function () {
  'use strict';

  var C = window.TmkCrm || {};
  var state = { page: 1, perPage: 25, total: 0, items: [], currentId: null, lead: null };
  var refreshTimer = null;
  var $ = function (id) { return document.getElementById(id); };
  var loginView = $('login-view');
  var crmView = $('crm-view');
  var layout = document.querySelector('.layout');

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }
  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(function () {
      if (!crmView.hidden) loadList({ soft: true });
    }, 15000);
  }

  function fmtDate(v) {
    if (!v) return '—';
    try {
      var d = new Date(v);
      if (Number.isNaN(d.getTime())) return String(v);
      return d.toLocaleString('ru-RU', {
        timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit',
        year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return String(v); }
  }
  function fmtDay(v) { return v ? String(v).slice(0, 10) : ''; }
  function toDatetimeLocal(v) {
    if (!v) return '';
    try {
      var d = new Date(v);
      if (Number.isNaN(d.getTime())) return '';
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Almaty',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(d);
      var get = function (type) {
        var row = parts.find(function (p) { return p.type === type; });
        return row ? row.value : '';
      };
      return get('year') + '-' + get('month') + '-' + get('day') + 'T' + get('hour') + ':' + get('minute');
    } catch (e) {
      return String(v).slice(0, 16);
    }
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function phoneDigits(p) { return String(p || '').replace(/\D/g, ''); }

  /* В поле телефона — только цифры и опциональный ведущий + */
  function sanitizePhoneValue(raw) {
    var s = String(raw || '');
    var hasPlus = s.charAt(0) === '+';
    var digits = s.replace(/\D/g, '');
    return hasPlus ? ('+' + digits) : digits;
  }
  function bindPhoneOnly(el) {
    if (!el || el._phoneBound) return;
    el._phoneBound = true;
    el.setAttribute('inputmode', 'numeric');
    el.addEventListener('input', function () {
      var next = sanitizePhoneValue(el.value);
      if (el.value !== next) el.value = next;
    });
  }
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (t && t.tagName === 'INPUT' && (t.name === 'phone' || t.type === 'tel' || t.getAttribute('data-phone-only') != null)) {
      bindPhoneOnly(t);
    }
  });
  function sourceLabel(id) {
    return (C.sourceLabel && C.sourceLabel(id)) || id || '—';
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    if (opts.body && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }
    opts.credentials = 'same-origin';
    opts.headers = headers;
    return fetch(path, opts).then(function (r) {
      var ct = r.headers.get('Content-Type') || '';
      if (ct.indexOf('application/json') === -1) {
        return r.text().then(function () { return { ok: false, error: 'bad_response', _status: r.status }; });
      }
      return r.json().catch(function () {
        return { ok: false, error: 'bad_response' };
      }).then(function (j) {
        j._status = r.status;
        return j;
      });
    });
  }

  function showLogin() {
    stopAutoRefresh();
    loginView.hidden = false;
    crmView.hidden = true;
  }
  function showCrm() {
    loginView.hidden = true;
    crmView.hidden = false;
    resetFilters(false);
    loadList();
    startAutoRefresh();
  }

  function resetFilters(reload) {
    $('f-status').value = 'Все';
    $('f-source').value = 'Все';
    $('f-service').value = '';
    $('f-from').value = '';
    $('f-to').value = '';
    $('f-overdue').checked = false;
    $('search').value = '';
    state.page = 1;
    if (reload) loadList();
  }

  function boot() {
    api('/api/crm/session').then(function (res) {
      if (res.ok) showCrm();
      else showLogin();
      var lead = new URLSearchParams(location.search).get('lead');
      if (lead && res.ok) openLead(Number(lead));
    }).catch(showLogin);
  }

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    $('login-error').textContent = '';
    api('/api/crm/session', {
      method: 'POST',
      body: { login: fd.get('login'), password: fd.get('password') }
    }).then(function (res) {
      if (!res.ok) {
        $('login-error').textContent = res.error === 'locked'
          ? 'Слишком много попыток. Подождите и попробуйте снова.'
          : 'Неверный логин или пароль.';
        return;
      }
      e.target.reset();
      showCrm();
    }).catch(function () {
      $('login-error').textContent = 'Не удалось войти. Проверьте сеть.';
    });
  });

  $('toggle-pass').addEventListener('click', function () {
    var input = document.querySelector('#login-form input[name="password"]');
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    $('toggle-pass').setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
    $('toggle-pass').title = show ? 'Скрыть пароль' : 'Показать пароль';
  });

  $('btn-logout').addEventListener('click', function () {
    api('/api/crm/session', { method: 'DELETE' }).finally(showLogin);
  });

  function filterParams() {
    var p = new URLSearchParams();
    p.set('page', String(state.page));
    p.set('per_page', String(state.perPage));
    var q = $('search').value.trim();
    if (q) p.set('q', q);
    var st = $('f-status').value;
    if (st && st !== 'Все') p.set('status', st);
    var src = $('f-source').value;
    if (src && src !== 'Все') p.set('source', src);
    var svc = $('f-service').value.trim();
    if (svc) p.set('service', svc);
    if ($('f-from').value) p.set('from', $('f-from').value);
    if ($('f-to').value) p.set('to', $('f-to').value);
    if ($('f-overdue').checked) p.set('overdue', '1');
    return p;
  }

  function statusBadge(status, overdue) {
    var cls = 'muted';
    if (status === 'Новая') cls = '';
    if (status === 'Успешно') cls = 'ok';
    if (status === 'Отказ') cls = 'danger';
    if (overdue) cls = 'warn';
    return '<span class="badge ' + cls + '">' + esc(status) + (overdue ? ' · просрочено' : '') + '</span>';
  }

  function renderRows() {
    if (!state.items.length) {
      $('leads-body').innerHTML = '<tr><td colspan="8" class="empty">Заявок пока нет</td></tr>';
      return;
    }
    $('leads-body').innerHTML = state.items.map(function (item) {
      var overdue = item.next_action_overdue || item.audit_overdue;
      var who = esc(item.name || item.company || '—');
      if (item.name && item.company) who = esc(item.name) + '<div class="muted">' + esc(item.company) + '</div>';
      return '<tr data-id="' + item.id + '"' + (state.currentId === item.id ? ' class="active"' : '') + '>' +
        '<td>#' + esc(item.number) + '</td>' +
        '<td>' + esc(fmtDate(item.created_at)) + '</td>' +
        '<td>' + who + '</td>' +
        '<td>' + esc(item.phone) + '</td>' +
        '<td>' + esc(item.service || item.comment || '—') + '</td>' +
        '<td>' + esc(sourceLabel(item.source)) + '<div class="muted">' + esc(item.form_name || '') + '</div></td>' +
        '<td>' + statusBadge(item.status, overdue) + '</td>' +
        '<td>' + esc(item.next_action || '—') +
          (item.next_action_at ? '<div class="muted">' + esc(fmtDay(item.next_action_at)) + '</div>' : '') +
        '</td></tr>';
    }).join('');
  }

  function loadList(opts) {
    opts = opts || {};
    if (!opts.soft || !state.items.length) {
      $('leads-body').innerHTML = '<tr><td colspan="8" class="empty">Загрузка…</td></tr>';
    }
    return api('/api/crm/leads?' + filterParams().toString()).then(function (res) {
      if (res._status === 401) return showLogin();
      if (!res.ok) {
        $('leads-body').innerHTML = '<tr><td colspan="8" class="empty">Ошибка загрузки</td></tr>';
        return res;
      }
      state.items = res.items || [];
      state.total = res.total || 0;
      var c = res.counters || {};
      $('counters').textContent =
        'Всего: ' + (c.total || 0) +
        ' · новые: ' + (c.new || 0) +
        ' · в работе: ' + (c.in_work || 0) +
        ' · просрочено: ' + (c.overdue || 0);
      $('page-label').textContent = state.page + ' / ' + Math.max(1, Math.ceil(state.total / state.perPage) || 1);
      renderRows();
      return res;
    });
  }

  $('leads-body').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    openLead(Number(tr.getAttribute('data-id')));
  });

  $('btn-refresh').addEventListener('click', loadList);
  $('btn-export').addEventListener('click', function () {
    window.location.href = '/api/crm/export?' + filterParams().toString();
  });
  $('btn-filters').addEventListener('click', function () {
    $('filters').hidden = !$('filters').hidden;
  });
  $('btn-reset-filters').addEventListener('click', function () {
    resetFilters(true);
  });
  ['f-status', 'f-source', 'f-from', 'f-to', 'f-overdue'].forEach(function (id) {
    $(id).addEventListener('change', function () { state.page = 1; loadList(); });
  });
  var searchTimer;
  $('search').addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { state.page = 1; loadList(); }, 300);
  });
  $('f-service').addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { state.page = 1; loadList(); }, 300);
  });
  $('prev-page').addEventListener('click', function () {
    if (state.page > 1) { state.page -= 1; loadList(); }
  });
  $('next-page').addEventListener('click', function () {
    if (state.page * state.perPage < state.total) { state.page += 1; loadList(); }
  });

  function openLead(id, opts) {
    opts = opts || {};
    state.currentId = id;
    renderRows();
    return api('/api/crm/leads?id=' + id).then(function (res) {
      if (res._status === 401) return showLogin();
      if (!res.ok) return;
      state.lead = res.lead;
      renderCard(res.lead);
      // Список заявок всегда остаётся на экране; карточка — сбоку / снизу
      layout.classList.add('with-card');
      $('card-pane').hidden = false;
      if (!opts.skipListReload) loadList({ soft: true });
      history.replaceState(null, '', '/crm?lead=' + id);
      return res;
    });
  }

  $('btn-close-card').addEventListener('click', function () {
    $('card-pane').hidden = true;
    layout.classList.remove('with-card');
    state.currentId = null;
    renderRows();
    history.replaceState(null, '', '/crm');
    loadList({ soft: true });
  });

  function field(label, name, value, type) {
    type = type || 'text';
    if (type === 'textarea') {
      return '<label>' + esc(label) + '<textarea name="' + name + '" rows="3">' + esc(value || '') + '</textarea></label>';
    }
    if (type === 'select-status') {
      var opts = (C.STATUSES || ['Новая', 'Готовится разбор', 'В работе', 'КП отправлено', 'Переговоры', 'Успешно', 'Отказ', 'Отложено']);
      return '<label>' + esc(label) + '<select name="' + name + '">' +
        opts.map(function (o) { return '<option' + (o === value ? ' selected' : '') + '>' + o + '</option>'; }).join('') +
        '</select></label>';
    }
    if (type === 'select-result') {
      var results = [''].concat(C.RESULTS || ['Успешно', 'Отказ', 'Отложено']);
      return '<label>' + esc(label) + '<select name="' + name + '">' +
        results.map(function (o) {
          return '<option value="' + esc(o) + '"' + (o === (value || '') ? ' selected' : '') + '>' +
            (o || '—') + '</option>';
        }).join('') + '</select></label>';
    }
    if (type === 'select-next') {
      var actions = [''].concat(C.NEXT_ACTIONS || []);
      return '<label>' + esc(label) + '<select name="' + name + '">' +
        actions.map(function (o) {
          return '<option value="' + esc(o) + '"' + (o === (value || '') ? ' selected' : '') + '>' +
            (o || '—') + '</option>';
        }).join('') + '</select></label>';
    }
    if (type === 'select-refuse') {
      var reasons = [''].concat(C.REFUSE_REASONS || []);
      return '<label>' + esc(label) + '<select name="' + name + '">' +
        reasons.map(function (o) {
          return '<option value="' + esc(o) + '"' + (o === (value || '') ? ' selected' : '') + '>' +
            (o || '—') + '</option>';
        }).join('') + '</select></label>';
    }
    var extra = name === 'phone' ? ' inputmode="numeric" data-phone-only' : '';
    var inputType = name === 'phone' ? 'tel' : type;
    return '<label>' + esc(label) + '<input name="' + name + '" type="' + inputType + '" value="' + esc(value || '') + '"' + extra + '></label>';
  }

  function renderCard(lead) {
    $('card-title').textContent = '#' + lead.number + ' · ' + (lead.name || lead.company || 'Без имени');
    $('card-sub').textContent = sourceLabel(lead.source) + (lead.form_name ? ' · ' + lead.form_name : '');
    var digits = phoneDigits(lead.phone);
    var overdueBits = [];
    if (lead.next_action_overdue) overdueBits.push('просрочено следующее действие');
    if (lead.audit_overdue) overdueBits.push('просрочен срок SEO-разбора');
    var html = '';
    if (lead.phone_matches && lead.phone_matches.length) {
      html += '<div class="warn-box">По этому телефону уже есть обращения: ' +
        lead.phone_matches.map(function (m) { return '#' + m.number; }).join(', ') + '</div>';
    }
    if (overdueBits.length) {
      html += '<div class="warn-box">' + esc(overdueBits.join('; ')) + '</div>';
    }
    html += '<div class="actions">' +
      '<a class="btn primary" href="tel:' + esc(lead.phone) + '">Позвонить</a>' +
      '<a class="ghost" href="https://wa.me/' + digits + '" target="_blank" rel="noopener">WhatsApp</a>' +
      '<button type="button" class="ghost" id="btn-retry-notify">Повторить email</button>' +
      '</div>';

    var showAudit = C.showAuditBlock ? C.showAuditBlock(lead) : true;

    html += '<form id="lead-form" class="card-body">' +
      '<div class="block"><h3>Данные клиента</h3><div class="grid-2">' +
      field('Имя', 'name', lead.name) +
      field('Компания', 'company', lead.company) +
      field('Телефон', 'phone', lead.phone) +
      field('Ссылка', 'link', lead.link) +
      field('Сфера', 'business_type', lead.business_type) +
      field('Город', 'city', lead.city) +
      field('Услуга', 'service', lead.service) +
      field('Как связаться', 'contact_method', lead.contact_method) +
      '</div>' +
      field('Сообщение / запрос', 'comment', lead.comment, 'textarea') +
      '<p class="muted">Создано: ' + esc(fmtDate(lead.created_at)) +
      (lead.page_url ? ' · <a href="' + esc(lead.page_url) + '" target="_blank" rel="noopener">страница формы</a>' : '') +
      '</p></div>';

    html += '<div class="block"><h3>Обработка</h3><div class="grid-2">' +
      field('Статус', 'status', lead.status, 'select-status') +
      field('Дата контакта', 'contact_at', toDatetimeLocal(lead.contact_at), 'datetime-local') +
      '</div>' +
      field('Заметки', 'notes', lead.notes, 'textarea') +
      field('Результат разговора', 'talk_result', lead.talk_result, 'textarea') +
      field('Потребности / проблемы', 'needs', lead.needs, 'textarea') +
      '</div>';

    html += '<div class="block"><h3>Разбор / диагностика</h3>' +
      (lead.audit_due_at
        ? '<p class="muted">Срок бесплатного SEO + GEO разбора: <strong>' + esc(fmtDay(lead.audit_due_at)) + '</strong></p>'
        : '<p class="muted">Автосрок 3 рабочих дня не назначен (не бесплатный SEO-разбор или корпоративная заявка).</p>') +
      (showAudit ? '<div class="grid-2">' + field('Срок разбора', 'audit_due_at', fmtDay(lead.audit_due_at), 'date') + '</div>' +
        field('Результаты поиска', 'audit_search', lead.audit_search, 'textarea') +
        field('Карты / 2ГИС', 'audit_maps', lead.audit_maps, 'textarea') +
        field('Ответы ИИ', 'audit_ai', lead.audit_ai, 'textarea') +
        field('Комментарии по разбору', 'audit_notes', lead.audit_notes, 'textarea')
        : field('Заметки по диагностике', 'audit_notes', lead.audit_notes, 'textarea')) +
      '</div>';

    html += '<div class="block"><h3>КП и переговоры</h3><div class="grid-2">' +
      field('Дата КП', 'proposal_sent_at', fmtDay(lead.proposal_sent_at), 'date') +
      field('Пакет', 'proposal_package', lead.proposal_package) +
      field('Сумма', 'proposal_amount', lead.proposal_amount) +
      '</div>' +
      field('Комментарии КП', 'proposal_notes', lead.proposal_notes, 'textarea') +
      '</div>';

    html += '<div class="block"><h3>Следующее действие</h3><div class="grid-2">' +
      field('Что сделать', 'next_action', lead.next_action, 'select-next') +
      field('Дата', 'next_action_at', fmtDay(lead.next_action_at), 'date') +
      '</div></div>';

    html += '<div class="block"><h3>Результат</h3><div class="grid-2">' +
      field('Итог', 'result', lead.result, 'select-result') +
      field('Дата завершения', 'closed_at', fmtDay(lead.closed_at), 'date') +
      '</div>' +
      field('Причина отказа', 'refuse_reason', lead.refuse_reason, 'select-refuse') +
      '</div>';

    html += '<div class="block"><h3>Файлы разбора / КП</h3>' +
      '<div class="file-list">' +
      (lead.attachments || []).map(function (f) {
        return '<a href="/api/crm/attach?file=' + f.id + '" target="_blank" rel="noopener">' + esc(f.filename) +
          ' <span class="muted">(' + esc(f.kind) + ', ' + Math.round(f.size_bytes / 1024) + ' КБ)</span></a>';
      }).join('') +
      '</div>' +
      '<label>Тип файла<select id="file-kind"><option value="audit">Разбор</option><option value="proposal">КП</option><option value="other">Другое</option></select></label>' +
      '<input type="file" id="file-input">' +
      '</div>';

    html += '<div class="block"><h3>Уведомления</h3><ul class="timeline">' +
      (lead.notifications || []).map(function (n) {
        return '<li><time>' + esc(fmtDate(n.created_at)) + '</time>' +
          esc(n.channel) + ': ' + esc(n.status) + ' — ' + esc(n.detail) + '</li>';
      }).join('') +
      '</ul></div>';

    html += '<div class="block"><h3>История</h3><ul class="timeline">' +
      (lead.events || []).map(function (ev) {
        return '<li><time>' + esc(fmtDate(ev.created_at)) + '</time>' + esc(ev.message || ev.kind) + '</li>';
      }).join('') +
      '</ul></div>';

    html += '<button class="btn primary" type="submit">Сохранить</button>' +
      '<p class="form-error" id="card-error"></p></form>';

    $('card-body').innerHTML = html;

    $('lead-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = e.target.querySelector('button[type="submit"]');
      var fd = new FormData(e.target);
      var patch = {};
      fd.forEach(function (v, k) { patch[k] = v; });
      if (patch.contact_at) patch.contact_at = new Date(patch.contact_at).toISOString();
      if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }
      $('card-error').textContent = '';
      api('/api/crm/leads?id=' + lead.id, { method: 'POST', body: patch }).then(function (res) {
        if (!res.ok) {
          if (btn) { btn.disabled = false; btn.textContent = 'Сохранить'; }
          $('card-error').textContent = 'Не удалось сохранить: ' + (res.error || '');
          return;
        }
        state.lead = res.lead;
        renderCard(res.lead);
        loadList();
      }).catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'Сохранить'; }
        $('card-error').textContent = 'Ошибка сети при сохранении';
      });
    });

    $('btn-retry-notify').addEventListener('click', function () {
      var btn = $('btn-retry-notify');
      btn.disabled = true;
      api('/api/crm/leads?retry_notify=' + lead.id, { method: 'POST', body: {} }).then(function () {
        openLead(lead.id);
      }).catch(function () {
        btn.disabled = false;
        alert('Не удалось повторить уведомление');
      });
    });

    $('file-input').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var base64 = String(reader.result).split(',')[1] || '';
        api('/api/crm/attach?id=' + lead.id, {
          method: 'POST',
          body: {
            filename: file.name,
            content_type: file.type || 'application/octet-stream',
            kind: $('file-kind').value,
            content_base64: base64
          }
        }).then(function (res) {
          if (res.ok) openLead(lead.id);
          else alert('Не удалось загрузить файл');
        });
      };
      reader.readAsDataURL(file);
    });
  }

  $('btn-add').addEventListener('click', function () {
    $('add-error').textContent = '';
    $('add-form').reset();
    $('add-dialog').showModal();
  });
  function closeAddDialog() { $('add-dialog').close(); }
  $('add-cancel').addEventListener('click', closeAddDialog);
  $('add-cancel-foot').addEventListener('click', closeAddDialog);
  $('add-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    var btn = $('add-save');
    btn.disabled = true;
    $('add-error').textContent = '';
    api('/api/crm/leads', {
      method: 'POST',
      body: {
        name: fd.get('name'),
        company: fd.get('company'),
        phone: fd.get('phone'),
        source: fd.get('source'),
        service: fd.get('service'),
        comment: fd.get('comment'),
        form_name: (C.FORM_LABELS && C.FORM_LABELS.manual) || 'Ручной ввод',
        notify: true
      }
    }).then(function (res) {
      btn.disabled = false;
      if (!res.ok) {
        $('add-error').textContent = 'Проверьте имя/компанию и телефон';
        return;
      }
      $('add-dialog').close();
      e.target.reset();
      // Сбрасываем фильтры, чтобы новая и все остальные заявки были видны в списке постоянно
      resetFilters(false);
      loadList().then(function () {
        openLead(res.lead.id, { skipListReload: true });
      });
    }).catch(function () {
      btn.disabled = false;
      $('add-error').textContent = 'Ошибка сети';
    });
  });

  $('btn-password').addEventListener('click', function () {
    $('password-error').textContent = '';
    $('password-hash').hidden = true;
    $('password-form').reset();
    $('password-dialog').showModal();
  });
  function closePasswordDialog() { $('password-dialog').close(); }
  $('password-cancel').addEventListener('click', closePasswordDialog);
  $('password-cancel-foot').addEventListener('click', closePasswordDialog);
  $('password-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    var btn = e.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    $('password-error').textContent = '';
    api('/api/crm/password', {
      method: 'POST',
      body: { current: fd.get('current'), new_password: fd.get('new_password') }
    }).then(function (res) {
      if (btn) btn.disabled = false;
      if (!res.ok) {
        $('password-error').textContent = res.error === 'bad_current'
          ? 'Неверный текущий пароль'
          : 'Пароль слишком короткий';
        return;
      }
      $('password-hash').hidden = false;
      $('password-hash').textContent = res.password_hash + '\n\n' + (res.hint || '');
    }).catch(function () {
      if (btn) btn.disabled = false;
      $('password-error').textContent = 'Ошибка сети';
    });
  });

  // Esc / клик по фону уже закрывает <dialog>; сброс ошибок
  ['add-dialog', 'password-dialog'].forEach(function (id) {
    $(id).addEventListener('close', function () {
      var err = $(id === 'add-dialog' ? 'add-error' : 'password-error');
      if (err) err.textContent = '';
    });
  });

  boot();
})();
