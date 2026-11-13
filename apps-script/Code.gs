/**
 * CRM заявок TMK Techno Horizon - серверная часть хранения и уведомлений.
 *
 * Проект Apps Script в аккаунте tmk.techno.horizon@gmail.com. Хранит данные в таблице
 * «Заявки с лендинга TMK (видимость бизнеса)» (листы CRM_*), файлы - там же.
 * Вызывается ТОЛЬКО сервером сайта (Vercel, /api/lead, /api/intake, /api/crm) с общим секретом.
 *
 * Листы:
 *   CRM_Заявки        - одна строка на заявку
 *   CRM_История       - хронология изменений
 *   CRM_Файлы         - список файлов разбора и КП; CRM_ФайлыДанные - их содержимое (доступ только у владельца)
 *   CRM_Уведомления   - очередь писем и WhatsApp с повторами (WhatsApp отправляет сервер сайта)
 *   Заявки            - старый лист: сюда по-прежнему пишутся запросы на удаление данных
 *
 * Публикация: Развернуть → Управление развертываниями → изменить → Новая версия.
 * После первой установки один раз запустить setup() из редактора: создаёт листы.
 * Скрипту нужны только доступы к таблицам и почте (как и раньше).
 */
var SECRET = 'ВСТАВИТЬ_СЕКРЕТ_ИЗ_VERCEL_LEADS_WEBHOOK_SECRET'; // настоящий ключ - в Apps Script и в Vercel
var SPREADSHEET_ID = '1Ho8A9bCLQYCBQmwGe58PSDXLl_FGFsBXyLBdu_vNsFY';
var CRM_URL = 'https://ai.tmk-technohorizon.kz/crm';
var TZ = 'Asia/Almaty';

var DEFAULTS = {
  NOTIFY_EMAILS: 'kaelggbet@gmail.com',
  LANDING_COPY_EMAILS: 'tmk.techno.horizon@gmail.com',
  WA_PROVIDER: 'none',
  WA_TO: '77479071622',
  WA_META_API_VERSION: 'v21.0',
  WA_META_LANG: 'ru',
  // Праздники и переносы РК (ТК РК, ст. 84-85). Список можно править в настройках CRM.
  HOLIDAYS: [
    '2026-01-01', '2026-01-02', '2026-01-07', '2026-03-09', '2026-03-23', '2026-03-24', '2026-03-25',
    '2026-05-01', '2026-05-07', '2026-05-11', '2026-05-27', '2026-07-06', '2026-08-31', '2026-10-26',
    '2026-12-16',
    '2027-01-01', '2027-01-04', '2027-01-07', '2027-03-08', '2027-03-22', '2027-03-23', '2027-03-24',
    '2027-05-03', '2027-05-07', '2027-05-10', '2027-07-06', '2027-08-30', '2027-10-25', '2027-12-16'
  ].join(', ')
};

var STATUSES = ['Новая', 'В работе', 'Готовится разбор', 'КП отправлено', 'Переговоры', 'Успешно', 'Отказ', 'Отложено'];
var FINAL_STATUSES = ['Успешно', 'Отказ', 'Отложено'];
var SOURCE_LABELS = {
  landing: 'SEO + GEO - лендинг',
  corporate: 'Techno Horizon - корпоративный сайт',
  manual: 'Вручную'
};
var RAZBOR_SERVICE = 'Бесплатный разбор SEO + GEO';
var RAZBOR_DAYS = 3;
var DEDUPE_MINUTES = 15;
var RATE_LIMIT = { perIp: 5, windowSec: 600 };
var LOGIN_LIMIT = { perIp: 5, global: 20, windowSec: 900 };
var MAX_FILE_BYTES = 3 * 1024 * 1024;

/* ---------- Схема листов ---------- */
var LEAD_COLS = [
  ['id', '№'], ['created_at', 'Создана'], ['source', 'Источник (код)'], ['source_label', 'Источник'],
  ['manual_channel', 'Канал (вручную)'], ['form_id', 'Форма (код)'], ['form_label', 'Форма'],
  ['service', 'Интересующая услуга'], ['name', 'Имя'], ['company', 'Компания'], ['phone', 'Телефон'],
  ['phone_digits', 'Телефон (цифры)'], ['link', 'Сайт / 2ГИС / Instagram'], ['business_type', 'Сфера'],
  ['city', 'Город'], ['contact_method', 'Как связаться'], ['package', 'Пакет'], ['message', 'Сообщение клиента'],
  ['consent_policy', 'Согласие с политикой'], ['consent_marketing', 'Согласие на материалы'],
  ['page_url', 'Страница формы'], ['locale', 'Язык'], ['utm_source', 'utm_source'], ['utm_medium', 'utm_medium'],
  ['utm_campaign', 'utm_campaign'], ['utm_content', 'utm_content'], ['utm_term', 'utm_term'],
  ['referrer', 'Откуда пришёл'], ['status', 'Статус'], ['razbor_required', 'Нужен разбор 3 дня'],
  ['razbor_due', 'Срок разбора'], ['contact_date', 'Дата контакта'], ['notes', 'Заметки'],
  ['call_result', 'Результат разговора'], ['needs', 'Потребности / проблемы'],
  ['razbor_search', 'Разбор: поиск'], ['razbor_maps', 'Разбор: карты'], ['razbor_ai', 'Разбор: ИИ'],
  ['diag_notes', 'Диагностика / задачи бизнеса'], ['kp_sent_date', 'КП отправлено'], ['kp_package', 'Пакет в КП'],
  ['kp_amount', 'Сумма КП'], ['kp_comment', 'Комментарий к КП'], ['next_action', 'Следующее действие'],
  ['next_action_date', 'Дата следующего действия'], ['closed_date', 'Дата завершения'],
  ['refusal_reason', 'Причина отказа'], ['result_comment', 'Комментарий к результату'],
  ['updated_at', 'Изменена'], ['version', 'Версия'], ['dedupe_key', 'Ключ дубля'], ['client_ip', 'IP'],
  ['notify_email', 'Уведомление email'], ['notify_wa', 'Уведомление WhatsApp']
];
var HISTORY_COLS = ['lead_id', 'at', 'kind', 'text', 'field', 'old_value', 'new_value'];
var HISTORY_HEADERS = ['№ заявки', 'Когда', 'Тип', 'Что произошло', 'Поле', 'Было', 'Стало'];
var FILE_COLS = ['file_id', 'lead_id', 'drive_id', 'name', 'mime', 'size', 'kind', 'comment', 'uploaded_at'];
var FILE_HEADERS = ['ID файла', '№ заявки', 'ID на Диске', 'Имя', 'Тип', 'Размер, байт', 'Раздел', 'Комментарий', 'Загружен'];
var JOB_COLS = ['job_id', 'lead_id', 'channel', 'status', 'attempts', 'last_error', 'next_try', 'sent_at', 'created_at'];
var JOB_HEADERS = ['ID', '№ заявки', 'Канал', 'Статус', 'Попыток', 'Последняя ошибка', 'Следующая попытка', 'Отправлено', 'Создано'];

// Поля, которые можно менять из карточки CRM
var EDITABLE = ['name', 'company', 'phone', 'link', 'business_type', 'city', 'contact_method', 'service', 'message',
  'status', 'contact_date', 'notes', 'call_result', 'needs', 'razbor_search', 'razbor_maps', 'razbor_ai', 'diag_notes',
  'kp_sent_date', 'kp_package', 'kp_amount', 'kp_comment', 'next_action', 'next_action_date', 'closed_date',
  'refusal_reason', 'result_comment', 'razbor_required'];
var FIELD_LABELS = {};
LEAD_COLS.forEach(function (c) { FIELD_LABELS[c[0]] = c[1]; });
var TEXT_LIMITS = { message: 4000, notes: 8000, call_result: 4000, needs: 4000, razbor_search: 6000, razbor_maps: 6000,
  razbor_ai: 6000, diag_notes: 8000, kp_comment: 4000, result_comment: 4000, next_action: 500 };

/* ---------- Точка входа ---------- */
function doPost(e) {
  var data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }
  if (!SECRET || data.secret !== SECRET) {
    return json_({ ok: false, error: 'forbidden' });
  }
  try {
    var action = data.action || 'legacy';
    // Сессии CRM: при смене пароля старые входы перестают работать
    if (data.session_version !== undefined && String(data.session_version) !== String(authVersion_())) {
      return json_({ ok: false, error: 'session_expired' });
    }
    var handler = ACTIONS[action];
    if (!handler) {
      return json_({ ok: false, error: 'unknown_action' });
    }
    return json_(handler(data));
  } catch (err) {
    console.error(action + ': ' + (err && err.stack || err));
    return json_({ ok: false, error: String(err && err.message || err).slice(0, 200) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'tmk-crm' });
}

var ACTIONS = {
  'legacy': legacy_,
  'lead.create': function (d) { return createLead_(d.lead || {}, { ip: d.client_ip, rateLimit: d.rate_limit === true }); },
  'lead.manual': function (d) { return createManual_(d.lead || {}); },
  'leads.list': listLeads_,
  'lead.get': function (d) { return getLead_(Number(d.id)); },
  'lead.update': function (d) { return updateLead_(Number(d.id), d.version, d.patch || {}); },
  'lead.renotify': function (d) { return renotify_(Number(d.id)); },
  'file.upload': uploadFile_,
  'file.get': function (d) { return getFile_(String(d.file_id || '')); },
  'auth.get': function (d) { return authGet_(d.ip); },
  'auth.init': function (d) { return authInit_(d); },
  'auth.fail': function (d) { return authFail_(d.ip); },
  'auth.ok': function (d) { return authOk_(d.ip); },
  'auth.set': function (d) { return authSet_(d); },
  'settings.get': function () { return { ok: true, settings: publicSettings_() }; },
  'settings.set': function (d) { return setSettings_(d.settings || {}); },
  'notify.test': function (d) { return notifyTest_(d.channel); },
  'wa.due': function (d) { var r = waDue_(Number(d.lead_id) || 0); r.ok = true; return r; },
  'wa.done': function (d) { return waDone_(d); },
  'threads.setup': function () { return threadsSetup_(); },
  'threads.import': function (d) { return threadsImport_(d.posts || []); },
  'threads.token.set': function (d) { return threadsTokenSet_(d); },
  'threads.due': function (d) { return threadsDue_(String(d.today || '')); },
  'threads.done': function (d) { return threadsDone_(d); },
  'threads.status': function () { return threadsStatus_(); }
};

/* ---------- Создание заявки ---------- */
function createLead_(input, opts) {
  opts = opts || {};
  var source = input.source === 'corporate' ? 'corporate' : (input.source === 'manual' ? 'manual' : 'landing');
  var lead = blankLead_();
  EDITABLE.concat(['form_id', 'form_label', 'consent_policy', 'consent_marketing', 'page_url', 'locale',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer', 'package',
    'manual_channel']).forEach(function (k) {
    if (input[k] !== undefined && input[k] !== null) lead[k] = clip_(k, input[k]);
  });
  lead.source = source;
  lead.source_label = SOURCE_LABELS[source];
  lead.phone = normalizePhone_(lead.phone);
  lead.phone_digits = lead.phone.replace(/\D/g, '');
  lead.client_ip = String(opts.ip || '').slice(0, 64);
  lead.dedupe_key = String(input.dedupe_key || '').slice(0, 128);
  if (!lead.name && !lead.company) throw new Error('name_required');
  if (lead.phone_digits.length < 10) throw new Error('phone_required');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var created, sheet, rows;
  try {
    sheet = sheet_('CRM_Заявки', LEAD_COLS.map(function (c) { return c[1]; }));
    rows = readLeads_(sheet);
    var now = new Date();
    if (lead.dedupe_key) {
      for (var i = rows.length - 1; i >= 0; i--) {
        var r = rows[i];
        if (r.dedupe_key === lead.dedupe_key && now - parseIso_(r.created_at) < DEDUPE_MINUTES * 60000) {
          return { ok: true, id: r.id, duplicate: true };
        }
      }
    }
    if (opts.rateLimit && lead.client_ip) {
      var key = 'rl:' + lead.client_ip;
      var cache = CacheService.getScriptCache();
      var count = Number(cache.get(key) || 0);
      if (count >= RATE_LIMIT.perIp) return { ok: false, error: 'rate_limited' };
      cache.put(key, String(count + 1), RATE_LIMIT.windowSec);
    }
    lead.id = rows.reduce(function (m, r) { return Math.max(m, Number(r.id) || 0); }, 0) + 1;
    lead.created_at = iso_(now);
    lead.updated_at = lead.created_at;
    lead.version = 1;
    lead.status = 'Новая';
    var needsRazbor = source === 'landing' ? lead.form_id === 'seo_geo_razbor'
      : (source === 'manual' && (lead.service === RAZBOR_SERVICE || truthy_(input.razbor_required)));
    lead.razbor_required = needsRazbor ? 'да' : '';
    lead.razbor_due = needsRazbor ? addWorkdays_(now, RAZBOR_DAYS) : '';
    lead.notify_email = 'в очереди';
    lead.notify_wa = waConfigured_() ? 'в очереди' : 'не настроено';
    writeRow_(sheet, sheet.getLastRow() + 1, LEAD_COLS.map(function (c) { return lead[c[0]]; }));
    if (!waConfigured_()) lead.notify_wa = 'не настроено';
    addHistory_(lead.id, 'create', 'Заявка создана: ' + lead.source_label +
      (lead.form_label ? ', форма «' + lead.form_label + '»' : '') +
      (lead.manual_channel ? ', канал ' + lead.manual_channel : ''));
    queueJob_(lead.id, 'email');
    queueJob_(lead.id, 'whatsapp', waConfigured_() ? 'pending' : 'not_configured');
    created = lead;
  } finally {
    lock.releaseLock();
  }
  var samePhone = rows.filter(function (r) { return r.phone_digits === created.phone_digits; })
    .map(function (r) { return r.id; });
  // Уведомления - после записи: их сбой не влияет на заявку
  try { processJobs_(function () { return true; }); } catch (err) { console.error('notify: ' + err); }
  var wa = { configured: false, jobs: [] };
  try { wa = waDue_(created.id); } catch (err) { console.error('wa: ' + err); }
  return { ok: true, id: created.id, duplicate: false, same_phone: samePhone, wa: wa };
}

function createManual_(input) {
  var channel = ['WhatsApp', 'Звонок', 'Другое'].indexOf(input.manual_channel) >= 0 ? input.manual_channel : 'Другое';
  input.source = 'manual';
  input.manual_channel = channel;
  input.form_id = 'manual';
  input.form_label = 'Добавлена вручную';
  var res = createLead_(input, { rateLimit: false });
  return res;
}

/* ---------- Чтение ---------- */
function listLeads_() {
  try { processJobs_(function () { return true; }); } catch (err) { console.error('notify: ' + err); }
  var sheet = sheet_('CRM_Заявки', LEAD_COLS.map(function (c) { return c[1]; }));
  var rows = readLeads_(sheet);
  var phones = {};
  rows.forEach(function (r) { phones[r.phone_digits] = (phones[r.phone_digits] || 0) + 1; });
  var list = rows.map(function (r) {
    return {
      id: r.id, created_at: r.created_at, source: r.source, source_label: r.source_label,
      manual_channel: r.manual_channel, form_label: r.form_label, service: r.service, name: r.name,
      company: r.company, phone: r.phone, link: r.link, city: r.city, business_type: r.business_type,
      message_short: short_(r.message, 90),
      status: r.status, razbor_due: r.razbor_due, razbor_required: r.razbor_required,
      next_action: r.next_action, next_action_date: r.next_action_date, package: r.package,
      notify_email: r.notify_email, notify_wa: r.notify_wa, repeat_phone: phones[r.phone_digits] > 1,
      updated_at: r.updated_at
    };
  });
  var wa = { configured: false, jobs: [] };
  try { wa = waDue_(0); } catch (err) { console.error('wa: ' + err); }
  return { ok: true, leads: list.reverse(), today: today_(), holidays: holidays_(), wa: wa };
}

function getLead_(id) {
  var sheet = sheet_('CRM_Заявки', LEAD_COLS.map(function (c) { return c[1]; }));
  var rows = readLeads_(sheet);
  var lead = null;
  rows.forEach(function (r) { if (Number(r.id) === id) lead = r; });
  if (!lead) return { ok: false, error: 'not_found' };
  delete lead.dedupe_key;
  delete lead.client_ip;
  var same = rows.filter(function (r) { return r.phone_digits === lead.phone_digits && Number(r.id) !== id; })
    .map(function (r) { return { id: r.id, created_at: r.created_at, source_label: r.source_label, status: r.status }; });
  return {
    ok: true, lead: lead, same_phone: same, today: today_(),
    history: readTable_('CRM_История', HISTORY_COLS, HISTORY_HEADERS).filter(function (h) { return Number(h.lead_id) === id; }),
    files: readTable_('CRM_Файлы', FILE_COLS, FILE_HEADERS).filter(function (f) { return Number(f.lead_id) === id; })
      .map(function (f) { return { file_id: f.file_id, name: f.name, mime: f.mime, size: f.size, kind: f.kind, comment: f.comment, uploaded_at: f.uploaded_at }; }),
    jobs: readTable_('CRM_Уведомления', JOB_COLS, JOB_HEADERS).filter(function (j) { return Number(j.lead_id) === id; })
      .map(function (j) { return { channel: j.channel, status: j.status, attempts: j.attempts, last_error: j.last_error, sent_at: j.sent_at }; })
  };
}

/* ---------- Изменение ---------- */
function updateLead_(id, version, patch) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = sheet_('CRM_Заявки', LEAD_COLS.map(function (c) { return c[1]; }));
    var values = sheet.getDataRange().getValues();
    var rowIndex = -1;
    for (var i = 1; i < values.length; i++) {
      if (Number(values[i][0]) === id) { rowIndex = i; break; }
    }
    if (rowIndex < 0) return { ok: false, error: 'not_found' };
    var lead = rowToObj_(values[rowIndex]);
    if (version !== undefined && String(version) !== String(lead.version)) {
      return { ok: false, error: 'conflict' };
    }
    var changes = [];
    Object.keys(patch).forEach(function (k) {
      if (EDITABLE.indexOf(k) < 0) return;
      var v = clip_(k, patch[k]);
      if (k === 'status' && STATUSES.indexOf(v) < 0) throw new Error('bad_status');
      if (k === 'phone') {
        v = normalizePhone_(v);
        if (v.replace(/\D/g, '').length < 10) throw new Error('phone_required');
      }
      if (/_date$/.test(k) && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('bad_date');
      if (k === 'razbor_required') v = truthy_(v) ? 'да' : '';
      if (String(lead[k] == null ? '' : lead[k]) !== v) {
        changes.push([k, String(lead[k] == null ? '' : lead[k]), v]);
        lead[k] = v;
      }
    });
    if (!lead.name && !lead.company) throw new Error('name_required');
    if (!changes.length) return { ok: true, lead: lead, changed: 0 };
    changes.forEach(function (c) {
      if (c[0] === 'phone') lead.phone_digits = lead.phone.replace(/\D/g, '');
      if (c[0] === 'razbor_required') {
        lead.razbor_due = lead.razbor_required ? (lead.razbor_due || addWorkdays_(parseIso_(lead.created_at), RAZBOR_DAYS)) : '';
      }
      if (c[0] === 'status' && FINAL_STATUSES.indexOf(c[2]) >= 0 && !lead.closed_date && !patch.closed_date) {
        lead.closed_date = today_();
      }
    });
    lead.version = Number(lead.version || 1) + 1;
    lead.updated_at = iso_(new Date());
    writeRow_(sheet, rowIndex + 1, LEAD_COLS.map(function (c) { return lead[c[0]]; }));
    changes.forEach(function (c) {
      var kind = c[0] === 'status' ? 'status' : (c[0] === 'next_action' || c[0] === 'next_action_date' ? 'next' :
        (c[0] === 'notes' ? 'note' : 'field'));
      var text = c[0] === 'status' ? 'Статус: ' + (c[1] || '-') + ' → ' + c[2]
        : (c[2] ? 'Изменено: ' + FIELD_LABELS[c[0]] : 'Очищено: ' + FIELD_LABELS[c[0]]);
      addHistory_(id, kind, text, c[0], short_(c[1]), short_(c[2]));
    });
    delete lead.dedupe_key;
    delete lead.client_ip;
    return { ok: true, lead: lead, changed: changes.length };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Файлы ----------
 * Файлы хранятся в закрытой таблице (лист CRM_ФайлыДанные) частями по 45 000 символов base64.
 * Так CRM обходится уже выданным доступом к таблицам, без отдельного доступа к Диску. */
var CHUNK = 45000;

function uploadFile_(d) {
  var id = Number(d.lead_id);
  var b64 = String(d.b64 || '').replace(/\s+/g, '');
  var bytes = Utilities.base64Decode(b64);
  if (!bytes.length) throw new Error('empty_file');
  if (bytes.length > MAX_FILE_BYTES) throw new Error('file_too_large');
  var kind = ['razbor', 'kp', 'other'].indexOf(d.kind) >= 0 ? d.kind : 'other';
  var name = String(d.name || 'file').replace(/[\\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 150);
  var mime = String(d.mime || 'application/octet-stream').slice(0, 100);
  if (!getLead_(id).ok) return { ok: false, error: 'not_found' };
  var meta = {
    file_id: Utilities.getUuid(), lead_id: id, drive_id: 'sheet', name: name, mime: mime,
    size: bytes.length, kind: kind, comment: String(d.comment || '').slice(0, 500), uploaded_at: iso_(new Date())
  };
  var chunks = [];
  for (var k = 0; k * CHUNK < b64.length; k++) chunks.push([meta.file_id, k, b64.slice(k * CHUNK, (k + 1) * CHUNK)]);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = sheet_('CRM_ФайлыДанные', ['ID файла', 'Часть', 'Данные (base64)']);
    var start = data.getLastRow() + 1;
    var range = data.getRange(start, 1, chunks.length, 3);
    range.setNumberFormat('@');
    range.setValues(chunks);
    var sheet = sheet_('CRM_Файлы', FILE_HEADERS);
    writeRow_(sheet, sheet.getLastRow() + 1, FILE_COLS.map(function (key) { return meta[key]; }));
    addHistory_(id, 'file', 'Добавлен файл (' + ({ razbor: 'разбор', kp: 'КП', other: 'другое' })[kind] + '): ' + name);
  } finally {
    lock.releaseLock();
  }
  delete meta.drive_id;
  return { ok: true, file: meta };
}

function getFile_(fileId) {
  var meta = null;
  readTable_('CRM_Файлы', FILE_COLS, FILE_HEADERS).forEach(function (f) { if (f.file_id === fileId) meta = f; });
  if (!meta) return { ok: false, error: 'not_found' };
  var rows = sheet_('CRM_ФайлыДанные', ['ID файла', 'Часть', 'Данные (base64)']).getDataRange().getValues()
    .filter(function (r) { return String(r[0]) === fileId; })
    .sort(function (a, b) { return Number(a[1]) - Number(b[1]); });
  if (!rows.length) return { ok: false, error: 'not_found' };
  return { ok: true, name: meta.name, mime: meta.mime, b64: rows.map(function (r) { return String(r[2]); }).join('') };
}

/* ---------- Уведомления ---------- */
function queueJob_(leadId, channel, status) {
  var sheet = sheet_('CRM_Уведомления', JOB_HEADERS);
  var now = iso_(new Date());
  writeRow_(sheet, sheet.getLastRow() + 1, [Utilities.getUuid(), leadId, channel, status || 'pending', 0,
    status === 'not_configured' ? 'провайдер WhatsApp не подключён' : '', now, '', now]);
}

function processJobsForLead_(leadId) {
  processJobs_(function (j) { return Number(j.lead_id) === leadId; });
}

/* Повтор неотправленных писем. Вызывается при каждой заявке и при открытии CRM;
   можно также поставить триггер «по времени» на эту функцию в разделе «Триггеры» редактора. */
function retryNotifications() {
  processJobs_(function () { return true; });
}

function processJobs_(filter) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  var updates = [];
  try {
    var sheet = sheet_('CRM_Уведомления', JOB_HEADERS);
    var values = sheet.getDataRange().getValues();
    var now = new Date();
    for (var i = 1; i < values.length; i++) {
      var j = {};
      JOB_COLS.forEach(function (k, n) { j[k] = values[i][n]; });
      if (!filter(j)) continue;
      if (j.channel !== 'email') continue; // WhatsApp отправляет сервер сайта (wa.due / wa.done)
      if (j.status !== 'pending' && j.status !== 'error') continue;
      if (Number(j.attempts) >= 6) continue;
      if (j.next_try && parseIso_(j.next_try) > now) continue;
      j.row = i + 1;
      updates.push(j);
    }
    updates.forEach(function (j) {
      var leadRes = getLead_(Number(j.lead_id));
      if (!leadRes.ok) return;
      var result;
      try {
        result = sendEmail_(leadRes.lead);
      } catch (err) {
        result = { status: 'error', error: String(err && err.message || err).slice(0, 300) };
      }
      j.attempts = Number(j.attempts || 0) + 1;
      j.status = result.status;
      j.last_error = result.error || '';
      j.sent_at = result.status === 'sent' ? iso_(new Date()) : '';
      var delays = [1, 5, 15, 60, 180];
      j.next_try = result.status === 'error' ? iso_(new Date(Date.now() + delays[Math.min(j.attempts - 1, 4)] * 60000)) : '';
      writeRow_(sheet, j.row, JOB_COLS.map(function (k) { return j[k]; }));
      setLeadNotify_(Number(j.lead_id), j.channel, j);
    });
  } finally {
    lock.releaseLock();
  }
}

function setLeadNotify_(leadId, channel, job) {
  var label = job.status === 'sent' ? 'отправлено ' + fmtDateTime_(job.sent_at)
    : (job.status === 'not_configured' ? 'не настроено'
      : (job.attempts >= 6 ? 'ошибка, попытки закончились' : 'ошибка, повтор: ' + fmtDateTime_(job.next_try)));
  var sheet = sheet_('CRM_Заявки', LEAD_COLS.map(function (c) { return c[1]; }));
  var ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (Number(ids[i][0]) === leadId) {
      var col = channel === 'email' ? colIndex_('notify_email') : colIndex_('notify_wa');
      writeCell_(sheet, i + 2, col, label);
      if (job.status === 'error' || job.status === 'not_configured') {
        addHistory_(leadId, 'notify', (channel === 'email' ? 'Email' : 'WhatsApp') + ': ' + label +
          (job.last_error ? ' (' + short_(job.last_error) + ')' : ''));
      }
      return;
    }
  }
}

function renotify_(id) {
  var res = getLead_(id);
  if (!res.ok) return res;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = sheet_('CRM_Уведомления', JOB_HEADERS);
    var values = sheet.getDataRange().getValues();
    var now = iso_(new Date());
    for (var i = 1; i < values.length; i++) {
      if (Number(values[i][1]) === id && values[i][3] !== 'sent') {
        values[i][3] = 'pending';
        values[i][4] = 0;
        values[i][6] = now;
        writeRow_(sheet, i + 1, values[i]);
      }
    }
    addHistory_(id, 'notify', 'Запрошена повторная отправка уведомлений');
  } finally {
    lock.releaseLock();
  }
  processJobsForLead_(id);
  var out = getLead_(id);
  out.wa = waDue_(id);
  return out;
}

function leadSummaryLines_(lead) {
  var lines = [
    'Заявка №' + lead.id + ' - ' + lead.source_label,
    'Услуга / запрос: ' + (lead.service || (lead.message ? short_(lead.message, 300) : 'не указано')),
    'Имя: ' + (lead.name || '-') + (lead.company ? ', ' + lead.company : ''),
    'Телефон: ' + lead.phone
  ];
  if (lead.form_label) lines.push('Форма: ' + lead.form_label);
  if (lead.service && lead.message) lines.push('Сообщение: ' + short_(lead.message, 300));
  if (lead.razbor_due) lines.push('Срок бесплатного разбора: до ' + fmtDate_(lead.razbor_due));
  lines.push('Открыть в CRM: ' + CRM_URL + '#lead-' + lead.id);
  return lines;
}

function sendEmail_(lead) {
  var to = splitEmails_(setting_('NOTIFY_EMAILS'));
  if (lead.source === 'landing') to = to.concat(splitEmails_(setting_('LANDING_COPY_EMAILS')));
  to = to.filter(function (v, i, a) { return a.indexOf(v) === i; });
  if (!to.length) return { status: 'not_configured', error: 'нет адресов' };
  var lines = leadSummaryLines_(lead);
  lines.splice(4, 0, 'WhatsApp клиента: https://wa.me/' + lead.phone_digits);
  MailApp.sendEmail({
    to: to.join(','),
    subject: 'Заявка №' + lead.id + ': ' + lead.source_label + ' - ' + (lead.name || lead.company || 'без имени'),
    body: lines.join('\n'),
    name: 'CRM TMK Techno Horizon'
  });
  return { status: 'sent' };
}

function waConfigured_() {
  var p = setting_('WA_PROVIDER');
  if (p === 'meta') return !!(setting_('WA_META_TOKEN') && setting_('WA_META_PHONE_ID'));
  if (p === 'callmebot') return !!setting_('WA_CALLMEBOT_KEY');
  return false;
}

/* WhatsApp отправляет сервер сайта (Vercel): здесь только очередь, текст и настройки */
function waConfig_() {
  return {
    provider: setting_('WA_PROVIDER'), to: String(setting_('WA_TO')).replace(/\D/g, ''),
    meta_phone_id: setting_('WA_META_PHONE_ID'), meta_token: setting_('WA_META_TOKEN'),
    meta_template: setting_('WA_META_TEMPLATE'), meta_lang: setting_('WA_META_LANG'),
    meta_api_version: setting_('WA_META_API_VERSION'), callmebot_key: setting_('WA_CALLMEBOT_KEY')
  };
}

function waMessage_(lead) {
  return {
    text: leadSummaryLines_(lead).join('\n'),
    params: [String(lead.id), lead.source_label, lead.service || short_(lead.message, 120) || 'не указано',
      (lead.name || lead.company || '-') + ', ' + lead.phone, CRM_URL + '#lead-' + lead.id]
  };
}

/* Задания WhatsApp, которые пора отправить. Берём их «в работу» на 2 минуты, чтобы не отправить дважды */
function waDue_(leadId) {
  if (!waConfigured_()) return { configured: false, jobs: [] };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var out = [];
  try {
    var sheet = sheet_('CRM_Уведомления', JOB_HEADERS);
    var values = sheet.getDataRange().getValues();
    var now = new Date();
    for (var i = 1; i < values.length && out.length < 3; i++) {
      var j = {};
      JOB_COLS.forEach(function (k, n) { j[k] = values[i][n]; });
      if (j.channel !== 'whatsapp') continue;
      if (leadId && Number(j.lead_id) !== Number(leadId)) continue;
      if (['pending', 'error', 'sending'].indexOf(j.status) < 0) continue;
      if (Number(j.attempts) >= 6) continue;
      if (j.next_try && parseIso_(j.next_try) > now) continue;
      var lr = getLead_(Number(j.lead_id));
      if (!lr.ok) continue;
      j.status = 'sending';
      j.next_try = iso_(new Date(now.getTime() + 120000));
      writeRow_(sheet, i + 1, JOB_COLS.map(function (k) { return j[k]; }));
      var msg = waMessage_(lr.lead);
      out.push({ job_id: j.job_id, lead_id: j.lead_id, text: msg.text, params: msg.params });
    }
  } finally {
    lock.releaseLock();
  }
  return { configured: true, config: waConfig_(), jobs: out };
}

function waDone_(d) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = sheet_('CRM_Уведомления', JOB_HEADERS);
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) !== String(d.job_id)) continue;
      var j = {};
      JOB_COLS.forEach(function (k, n) { j[k] = values[i][n]; });
      j.attempts = Number(j.attempts || 0) + 1;
      j.status = d.status === 'sent' ? 'sent' : 'error';
      j.last_error = String(d.error || '').slice(0, 300);
      j.sent_at = j.status === 'sent' ? iso_(new Date()) : '';
      var delays = [1, 5, 15, 60, 180];
      j.next_try = j.status === 'error' ? iso_(new Date(Date.now() + delays[Math.min(j.attempts - 1, 4)] * 60000)) : '';
      writeRow_(sheet, i + 1, JOB_COLS.map(function (k) { return j[k]; }));
      setLeadNotify_(Number(j.lead_id), 'whatsapp', j);
      return { ok: true };
    }
    return { ok: false, error: 'not_found' };
  } finally {
    lock.releaseLock();
  }
}

function notifyTest_(channel) {
  var fake = {
    id: 0, source: 'manual', source_label: 'Проверка уведомлений', service: 'Тестовое сообщение',
    name: 'Проверка', phone: '+70000000000', phone_digits: '70000000000', message: '', form_label: ''
  };
  if (channel === 'whatsapp') {
    if (!waConfigured_()) return { ok: true, result: { status: 'not_configured', error: 'провайдер WhatsApp не подключён' } };
    var msg = waMessage_(fake);
    return { ok: true, wa_test: { config: waConfig_(), text: msg.text, params: msg.params } };
  }
  var res;
  try {
    res = sendEmail_(fake);
  } catch (err) {
    res = { status: 'error', error: String(err && err.message || err).slice(0, 300) };
  }
  return { ok: res.status === 'sent', result: res };
}

/* ---------- Вход в CRM ---------- */
function authVersion_() {
  return PropertiesService.getScriptProperties().getProperty('AUTH_VERSION') || '0';
}

function authGet_(ip) {
  var props = PropertiesService.getScriptProperties();
  var cache = CacheService.getScriptCache();
  var ipCount = Number(cache.get('lf:' + ip) || 0);
  var allCount = Number(cache.get('lf:all') || 0);
  return {
    ok: true,
    login: props.getProperty('AUTH_LOGIN') || '',
    hash: props.getProperty('AUTH_HASH') || '',
    salt: props.getProperty('AUTH_SALT') || '',
    iter: Number(props.getProperty('AUTH_ITER') || 0),
    version: authVersion_(),
    locked: ipCount >= LOGIN_LIMIT.perIp || allCount >= LOGIN_LIMIT.global
  };
}

function authInit_(d) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('AUTH_HASH')) return authGet_(d.ip); // уже настроено - не перезаписываем
  props.setProperties({ AUTH_LOGIN: String(d.login), AUTH_HASH: String(d.hash), AUTH_SALT: String(d.salt),
    AUTH_ITER: String(d.iter), AUTH_VERSION: '1' });
  return authGet_(d.ip);
}

function authFail_(ip) {
  var cache = CacheService.getScriptCache();
  ['lf:' + ip, 'lf:all'].forEach(function (k) {
    cache.put(k, String(Number(cache.get(k) || 0) + 1), LOGIN_LIMIT.windowSec);
  });
  return { ok: true };
}

function authOk_(ip) {
  CacheService.getScriptCache().remove('lf:' + ip);
  return { ok: true };
}

function authSet_(d) {
  var props = PropertiesService.getScriptProperties();
  var version = String(Number(authVersion_()) + 1);
  props.setProperties({ AUTH_HASH: String(d.hash), AUTH_SALT: String(d.salt), AUTH_ITER: String(d.iter),
    AUTH_VERSION: version });
  return { ok: true, version: version };
}

/* ---------- Настройки ---------- */
var SETTING_KEYS = ['NOTIFY_EMAILS', 'LANDING_COPY_EMAILS', 'WA_PROVIDER', 'WA_TO', 'WA_META_PHONE_ID', 'WA_META_TEMPLATE',
  'WA_META_LANG', 'WA_META_API_VERSION', 'HOLIDAYS'];
var SECRET_SETTING_KEYS = ['WA_META_TOKEN', 'WA_CALLMEBOT_KEY'];

function setting_(key) {
  var v = PropertiesService.getScriptProperties().getProperty('S_' + key);
  return v !== null && v !== undefined ? v : (DEFAULTS[key] || '');
}

function publicSettings_() {
  var out = {};
  SETTING_KEYS.forEach(function (k) { out[k] = setting_(k); });
  SECRET_SETTING_KEYS.forEach(function (k) { out[k + '_SET'] = !!setting_(k); });
  return out;
}

function setSettings_(s) {
  var props = PropertiesService.getScriptProperties();
  if (s.NOTIFY_EMAILS !== undefined || s.LANDING_COPY_EMAILS !== undefined) {
    ['NOTIFY_EMAILS', 'LANDING_COPY_EMAILS'].forEach(function (k) {
      if (s[k] === undefined) return;
      var list = splitEmails_(s[k]);
      if (String(s[k]).trim() && !list.length) throw new Error('bad_email');
      s[k] = list.join(', ');
    });
  }
  if (s.WA_PROVIDER !== undefined && ['none', 'meta', 'callmebot'].indexOf(s.WA_PROVIDER) < 0) throw new Error('bad_provider');
  if (s.HOLIDAYS !== undefined) {
    var days = String(s.HOLIDAYS).split(/[\s,;]+/).filter(String);
    days.forEach(function (d) { if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('bad_holiday'); });
    s.HOLIDAYS = days.join(', ');
  }
  SETTING_KEYS.forEach(function (k) {
    if (s[k] !== undefined) props.setProperty('S_' + k, String(s[k]).trim().slice(0, 4000));
  });
  SECRET_SETTING_KEYS.forEach(function (k) {
    if (s[k] === null) props.deleteProperty('S_' + k);
    else if (s[k]) props.setProperty('S_' + k, String(s[k]).trim().slice(0, 1000));
  });
  return { ok: true, settings: publicSettings_() };
}

/* ---------- Старый поток: запрос на удаление данных с лендинга ---------- */
var OLD_HEADERS = ['Дата и время', 'Имя', 'Телефон', 'Сайт / 2ГИС / Instagram', 'Сфера', 'Город',
  'Как связаться', 'Пакет', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'Страница', 'Откуда пришёл', 'Статус', 'Комментарий менеджера', 'Согласие на рассылку', 'Тип обращения', 'Сообщение клиента'];

/* Запросы без action: удаление данных - в старый лист; заявка старого формата - в CRM */
function legacy_(data) {
  if (data.request_type === 'deletion') return legacyDeletion_(data);
  return createLead_({
    source: 'landing', form_id: 'seo_geo_razbor', form_label: 'Бесплатный разбор', service: RAZBOR_SERVICE,
    name: data.name, phone: data.phone, link: data.link, business_type: data.business_type, city: data.city,
    contact_method: data.contact_method, package: data.package, message: data.message, consent_policy: 'да',
    consent_marketing: data.marketing === 'yes' ? 'да' : 'нет', page_url: data.page, referrer: data.referrer,
    utm_source: data.utm_source, utm_medium: data.utm_medium, utm_campaign: data.utm_campaign,
    utm_content: data.utm_content, utm_term: data.utm_term
  }, { rateLimit: false });
}

function legacyDeletion_(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var sheet;
  try {
    sheet = sheet_('Заявки', OLD_HEADERS);
    var phone = String(data.phone || '');
    var isDeletion = data.request_type === 'deletion';
    writeRow_(sheet, sheet.getLastRow() + 1, [
      data.created_at || fmtDateTime_(iso_(new Date())), data.name, phone, data.link, data.business_type, data.city,
      data.contact_method, data.package, data.utm_source, data.utm_medium, data.utm_campaign, data.utm_content,
      data.utm_term, data.page, data.referrer, isDeletion ? 'Удалить данные' : 'Новая', '',
      data.marketing === 'yes' ? 'да' : 'нет', isDeletion ? 'Запрос на удаление данных' : 'Заявка на разбор', data.message
    ]);
  } finally {
    lock.releaseLock();
  }
  var to = splitEmails_(setting_('LANDING_COPY_EMAILS'));
  if (to.length) {
    MailApp.sendEmail({
      to: to.join(','),
      subject: 'Удаление данных: ' + (data.name || 'без имени') + ', ' + (data.phone || ''),
      body: ['ЗАПРОС НА УДАЛЕНИЕ ПЕРСОНАЛЬНЫХ ДАННЫХ - ответить в течение 10 рабочих дней', '',
        'Имя: ' + (data.name || ''), 'Телефон: ' + (data.phone || ''), 'Сообщение: ' + (data.message || '-'),
        'Время: ' + (data.created_at || ''), '', 'Журнал: ' + sheet.getParent().getUrl()].join('\n'),
      name: 'Лендинг TMK Techno Horizon'
    });
  }
  return { ok: true };
}

/* ---------- Рабочие дни ---------- */
function holidays_() {
  return String(setting_('HOLIDAYS')).split(/[\s,;]+/).filter(String);
}

function addWorkdays_(date, n) {
  var hol = holidays_();
  var d = new Date(Utilities.formatDate(date, TZ, 'yyyy-MM-dd') + 'T12:00:00Z');
  var added = 0;
  while (added < n) {
    d = new Date(d.getTime() + 86400000);
    var ymd = d.toISOString().slice(0, 10);
    var dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && hol.indexOf(ymd) < 0) added++;
  }
  return d.toISOString().slice(0, 10);
}

/* ---------- Таблица ---------- */
function sheet_(name, headers) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#DCE7FF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function writeRow_(sheet, row, values) {
  var range = sheet.getRange(row, 1, 1, values.length);
  range.setNumberFormat('@');
  range.setValues([values.map(cell_)]);
}

function writeCell_(sheet, row, col, value) {
  var range = sheet.getRange(row, col);
  range.setNumberFormat('@');
  range.setValue(cell_(value));
}

function cell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  v = String(v);
  return /^[=+\-@]/.test(v) ? "'" + v : v; // защита от формул
}

function colIndex_(key) {
  for (var i = 0; i < LEAD_COLS.length; i++) if (LEAD_COLS[i][0] === key) return i + 1;
  throw new Error('no column ' + key);
}

function rowToObj_(row) {
  var o = {};
  LEAD_COLS.forEach(function (c, i) { o[c[0]] = row[i] === undefined || row[i] === null ? '' : String(row[i]); });
  o.id = Number(o.id);
  return o;
}

function readLeads_(sheet) {
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === '' || values[i][0] === null) continue;
    out.push(rowToObj_(values[i]));
  }
  return out;
}

function readTable_(name, cols, headers) {
  var values = sheet_(name, headers).getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var o = {};
    cols.forEach(function (k, n) { o[k] = values[i][n] === undefined || values[i][n] === null ? '' : String(values[i][n]); });
    out.push(o);
  }
  return out;
}

function addHistory_(leadId, kind, text, field, oldV, newV) {
  var sheet = sheet_('CRM_История', HISTORY_HEADERS);
  writeRow_(sheet, sheet.getLastRow() + 1, [leadId, iso_(new Date()), kind, text, field || '', oldV || '', newV || '']);
}

function blankLead_() {
  var o = {};
  LEAD_COLS.forEach(function (c) { o[c[0]] = ''; });
  return o;
}

/* ---------- Мелочи ---------- */
function clip_(key, v) {
  v = String(v === null || v === undefined ? '' : v).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim();
  return v.slice(0, TEXT_LIMITS[key] || 300);
}

function normalizePhone_(raw) {
  var d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && (d[0] === '8' || d[0] === '7')) d = '7' + d.slice(1);
  else if (d.length === 10) d = '7' + d;
  return d ? '+' + d : '';
}

function truthy_(v) {
  return v === true || ['да', 'yes', 'true', '1', 'on'].indexOf(String(v).toLowerCase()) >= 0;
}

function splitEmails_(s) {
  return String(s || '').split(/[\s,;]+/).filter(function (e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); });
}

function short_(s, n) {
  s = String(s || '').replace(/\s+/g, ' ');
  n = n || 200;
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function iso_(d) {
  return Utilities.formatDate(d, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

function parseIso_(s) {
  var d = new Date(String(s));
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function today_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function fmtDate_(ymd) {
  var p = String(ymd).split('-');
  return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : String(ymd);
}

function fmtDateTime_(isoStr) {
  if (!isoStr) return '';
  return Utilities.formatDate(parseIso_(isoStr), TZ, 'dd.MM.yyyy HH:mm');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Threads: контент-план и публикации ----------
 * Отдельная таблица «Threads TMK - контент-план» на этом же аккаунте. Публикует сервер сайта (Vercel Cron,
 * api/threads_cron.py) раз в будний день: берёт самый ранний одобренный неопубликованный пост с датой не позже
 * сегодняшней. Ключ доступа Threads хранится в свойствах скрипта, в таблице его нет. */
var TH_HEADERS = ['№', 'Дата публикации', 'Тема', 'Текст поста', 'Знаков', 'Одобрено', 'Статус', 'Ссылка на пост',
  'Опубликован', 'Ошибка'];
var TH_COL = { n: 1, date: 2, topic: 3, text: 4, len: 5, ok: 6, status: 7, link: 8, at: 9, err: 10 };
var TH_LEASE_MIN = 15;

function thSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('THREADS_SHEET_ID');
  if (!id) throw new Error('threads_not_setup');
  return SpreadsheetApp.openById(id).getSheets()[0];
}

function threadsSetup_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('THREADS_SHEET_ID');
  if (id) {
    var existing = SpreadsheetApp.openById(id);
    return { ok: true, created: false, id: id, url: existing.getUrl() };
  }
  var ss = SpreadsheetApp.create('Threads TMK - контент-план');
  var sh = ss.getSheets()[0];
  sh.setName('Посты');
  sh.getRange(1, 1, 1, TH_HEADERS.length).setValues([TH_HEADERS]).setFontWeight('bold').setBackground('#DCE7FF')
    .setWrap(true).setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setColumnWidth(TH_COL.n, 40); sh.setColumnWidth(TH_COL.date, 110); sh.setColumnWidth(TH_COL.topic, 170);
  sh.setColumnWidth(TH_COL.text, 520); sh.setColumnWidth(TH_COL.len, 70); sh.setColumnWidth(TH_COL.ok, 90);
  sh.setColumnWidth(TH_COL.status, 120); sh.setColumnWidth(TH_COL.link, 220); sh.setColumnWidth(TH_COL.at, 130);
  sh.setColumnWidth(TH_COL.err, 220);
  var help = ss.insertSheet('Как пользоваться');
  help.getRange(1, 1, 9, 1).setValues([
    ['Как работает бот Threads TMK (@tmk.tech)'],
    ['1. Посты лежат на листе «Посты». Текст можно править прямо в ячейке, до 500 знаков, лучше без эмодзи.'],
    ['2. Чтобы пост вышел, поставьте галочку в колонке «Одобрено». Без галочки бот его не опубликует.'],
    ['3. Бот работает по будням около 11:00-12:00 по Алматы и публикует 1 пост в день: самый ранний одобренный пост, у которого дата публикации - сегодня или раньше.'],
    ['4. После публикации бот ставит статус «Опубликован», дату и ссылку на пост. Опубликованный пост повторно не выходит.'],
    ['5. Если публикация не удалась - статус «Ошибка» и причина в колонке «Ошибка»; письмо об ошибке уходит на почту. На следующий рабочий день бот попробует снова.'],
    ['6. Чтобы снять пост, уберите галочку. Чтобы перенести - поменяйте дату (формат ДД.ММ.ГГГГ).'],
    ['7. Новые посты добавляйте строками внизу: дата, тема, текст; статус - «Ожидает».'],
    ['Ключ доступа к Threads хранится в настройках скрипта «Приём заявок с лендинга TMK», в этой таблице его нет. Он продлевается автоматически.']
  ]).setWrap(true);
  help.setColumnWidth(1, 760);
  props.setProperty('THREADS_SHEET_ID', ss.getId());
  return { ok: true, created: true, id: ss.getId(), url: ss.getUrl() };
}

function threadsImport_(posts) {
  var sh = thSheet_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var start = sh.getLastRow() + 1;
    var rows = posts.map(function (p, i) {
      var text = String(p.text || '').trim();
      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(String(p.date || ''))) throw new Error('bad_date');
      if (!text) throw new Error('empty_text');
      return [start - 1 + i, String(p.date), String(p.topic || ''), text, '', false, 'Ожидает', '', '', ''];
    });
    if (!rows.length) return { ok: true, added: 0 };
    var range = sh.getRange(start, 1, rows.length, TH_HEADERS.length);
    range.setNumberFormat('@');
    range.setValues(rows.map(function (r) { return r.map(function (v) { return typeof v === 'boolean' ? v : cell_(v); }); }));
    sh.getRange(start, TH_COL.ok, rows.length, 1).insertCheckboxes();
    var lens = rows.map(function (r, i) { return ['=LEN(D' + (start + i) + ')']; });
    sh.getRange(start, TH_COL.len, rows.length, 1).setNumberFormat('0').setFormulas(lens);
    sh.getRange(start, TH_COL.text, rows.length, 1).setWrap(true).setVerticalAlignment('top');
    return { ok: true, added: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function threadsTokenSet_(d) {
  if (!d.token || !d.user_id) throw new Error('bad_token');
  PropertiesService.getScriptProperties().setProperties({
    THREADS_TOKEN: String(d.token), THREADS_USER_ID: String(d.user_id), THREADS_USERNAME: String(d.username || ''),
    THREADS_TOKEN_AT: iso_(new Date()), THREADS_TOKEN_EXPIRES: d.expires_in ? iso_(new Date(Date.now() + Number(d.expires_in) * 1000)) : ''
  });
  return { ok: true };
}

function thParseDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var m = String(v || '').trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}

function threadsDue_(today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) today = today_();
  var props = PropertiesService.getScriptProperties();
  var token = { token: props.getProperty('THREADS_TOKEN') || '', user_id: props.getProperty('THREADS_USER_ID') || '',
    username: props.getProperty('THREADS_USERNAME') || '', saved_at: props.getProperty('THREADS_TOKEN_AT') || '' };
  var sh = thSheet_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var values = sh.getDataRange().getValues();
    var now = new Date();
    for (var i = 1; i < values.length; i++) {
      var r = values[i];
      var text = String(r[TH_COL.text - 1] || '').trim();
      if (!text || r[TH_COL.ok - 1] !== true) continue;
      var status = String(r[TH_COL.status - 1] || '');
      if (status === 'Опубликован') continue;
      if (status === 'Публикуется') {
        var since = parseIso_(String(r[TH_COL.at - 1] || ''));
        if (now - since < TH_LEASE_MIN * 60000) continue;
      }
      var date = thParseDate_(r[TH_COL.date - 1]);
      if (!date || date > today) continue;
      writeCell_(sh, i + 1, TH_COL.status, 'Публикуется');
      writeCell_(sh, i + 1, TH_COL.at, iso_(now));
      return { ok: true, token: token, post: { row: i + 1, n: r[TH_COL.n - 1], date: date, text: text } };
    }
    return { ok: true, token: token, post: null };
  } finally {
    lock.releaseLock();
  }
}

function threadsDone_(d) {
  var sh = thSheet_();
  var row = Number(d.row);
  if (!(row > 1)) throw new Error('bad_row');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (d.ok) {
      writeCell_(sh, row, TH_COL.status, 'Опубликован');
      writeCell_(sh, row, TH_COL.link, String(d.permalink || d.media_id || ''));
      writeCell_(sh, row, TH_COL.at, fmtDateTime_(iso_(new Date())));
      writeCell_(sh, row, TH_COL.err, '');
    } else {
      writeCell_(sh, row, TH_COL.status, 'Ошибка');
      writeCell_(sh, row, TH_COL.at, '');
      writeCell_(sh, row, TH_COL.err, String(d.error || 'неизвестная ошибка').slice(0, 300));
    }
  } finally {
    lock.releaseLock();
  }
  if (!d.ok) {
    var to = splitEmails_(setting_('LANDING_COPY_EMAILS'));
    if (to.length) {
      MailApp.sendEmail({ to: to.join(','), subject: 'Threads-бот: пост не опубликован (строка ' + row + ')',
        body: ['Бот не смог опубликовать пост в Threads.', '', 'Причина: ' + String(d.error || ''), '',
          'Таблица: ' + sh.getParent().getUrl(), 'Бот попробует снова в следующий рабочий день.'].join('\n'),
        name: 'Threads-бот TMK' });
    }
  }
  return { ok: true };
}

function threadsStatus_() {
  var props = PropertiesService.getScriptProperties();
  var out = { ok: true, connected: !!props.getProperty('THREADS_TOKEN'), username: props.getProperty('THREADS_USERNAME') || '',
    token_at: props.getProperty('THREADS_TOKEN_AT') || '', counts: {} };
  if (!props.getProperty('THREADS_SHEET_ID')) return out;
  var sh = thSheet_();
  out.url = sh.getParent().getUrl();
  sh.getDataRange().getValues().slice(1).forEach(function (r) {
    if (!String(r[TH_COL.text - 1] || '').trim()) return;
    var k = String(r[TH_COL.status - 1] || 'Ожидает') + (r[TH_COL.ok - 1] === true ? ' (одобрено)' : '');
    out.counts[k] = (out.counts[k] || 0) + 1;
  });
  return out;
}

/* ---------- Запустить вручную из редактора ---------- */

/* Один раз после установки: создаёт листы CRM (нужны только доступы к таблицам и почте) */
function setup() {
  sheet_('CRM_Заявки', LEAD_COLS.map(function (c) { return c[1]; }));
  sheet_('CRM_История', HISTORY_HEADERS);
  sheet_('CRM_Файлы', FILE_HEADERS);
  sheet_('CRM_ФайлыДанные', ['ID файла', 'Часть', 'Данные (base64)']);
  sheet_('CRM_Уведомления', JOB_HEADERS);
  Logger.log('Готово. Писем на сегодня осталось: ' + MailApp.getRemainingDailyQuota());
}

/* Убрать тестовые заявки (имя начинается с «ТЕСТ»): строки заявок, истории, файлов и уведомлений */
function purgeTestLeads() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = sheet_('CRM_Заявки', LEAD_COLS.map(function (c) { return c[1]; }));
    var values = sheet.getDataRange().getValues();
    var nameCol = colIndex_('name') - 1;
    var ids = [];
    for (var i = values.length - 1; i >= 1; i--) {
      if (/^ТЕСТ/i.test(String(values[i][nameCol]))) {
        ids.push(Number(values[i][0]));
        sheet.deleteRow(i + 1);
      }
    }
    var fileIds = [];
    [['CRM_История', HISTORY_HEADERS, 0], ['CRM_Файлы', FILE_HEADERS, 1], ['CRM_Уведомления', JOB_HEADERS, 1]].forEach(function (t) {
      var sh = sheet_(t[0], t[1]);
      var v = sh.getDataRange().getValues();
      for (var r = v.length - 1; r >= 1; r--) {
        if (ids.indexOf(Number(v[r][t[2]])) >= 0) {
          if (t[0] === 'CRM_Файлы') fileIds.push(String(v[r][0]));
          sh.deleteRow(r + 1);
        }
      }
    });
    var fd = sheet_('CRM_ФайлыДанные', ['ID файла', 'Часть', 'Данные (base64)']);
    var fv = fd.getDataRange().getValues();
    for (var q = fv.length - 1; q >= 1; q--) {
      if (fileIds.indexOf(String(fv[q][0])) >= 0) fd.deleteRow(q + 1);
    }
    Logger.log('Удалено тестовых заявок: ' + ids.length + ' (' + ids.join(', ') + ')');
  } finally {
    lock.releaseLock();
  }
}
