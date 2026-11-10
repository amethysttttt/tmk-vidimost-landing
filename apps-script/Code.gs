/**
 * Приём заявок с лендинга TMK Techno Horizon.
 * Отдельный проект Apps Script в аккаунте tmk.techno.horizon@gmail.com,
 * пишет в таблицу «Заявки с лендинга TMK (видимость бизнеса)» по её ID.
 * 1) Пишет заявку новой строкой на лист «Заявки».
 * 2) Отправляет письмо на NOTIFY_EMAIL.
 * Публикация: Развернуть → Новое развертывание → Веб-приложение,
 * «Выполнять от имени: меня», «У кого есть доступ: все».
 */
var NOTIFY_EMAIL = 'tmk.techno.horizon@gmail.com';
var SECRET = 'ВСТАВИТЬ_СЕКРЕТ_ИЗ_VERCEL_LEADS_WEBHOOK_SECRET'; // настоящий ключ - в Apps Script и в Vercel
var SPREADSHEET_ID = '1Ho8A9bCLQYCBQmwGe58PSDXLl_FGFsBXyLBdu_vNsFY';
var SHEET_NAME = 'Заявки';
var HEADERS = ['Дата и время', 'Имя', 'Телефон', 'Сайт / 2ГИС / Instagram', 'Сфера', 'Город',
  'Как связаться', 'Пакет', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'Страница', 'Откуда пришёл', 'Статус', 'Комментарий менеджера', 'Согласие на рассылку', 'Тип обращения', 'Сообщение клиента'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SECRET && data.secret !== SECRET) {
      return json_({ ok: false, error: 'forbidden' });
    }
    lock.waitLock(10000);
    var sheet = getSheet_();
    var phone = String(data.phone || '');
    var isDeletion = data.request_type === 'deletion';
    sheet.appendRow([
      data.created_at || Utilities.formatDate(new Date(), 'Asia/Almaty', 'dd.MM.yyyy HH:mm'),
      text_(data.name), "'" + phone, text_(data.link), text_(data.business_type), text_(data.city),
      text_(data.contact_method), text_(data.package), text_(data.utm_source), text_(data.utm_medium),
      text_(data.utm_campaign), text_(data.utm_content), text_(data.utm_term), text_(data.page),
      text_(data.referrer), isDeletion ? 'Удалить данные' : 'Новая', '',
      data.marketing === 'yes' ? 'да' : 'нет', isDeletion ? 'Запрос на удаление данных' : 'Заявка на разбор',
      text_(data.message)
    ]);
    lock.releaseLock();
    notify_(data, phone, sheet, isDeletion);
    return json_({ ok: true });
  } catch (err) {
    try { lock.releaseLock(); } catch (ignore) {}
    return json_({ ok: false, error: String(err).slice(0, 200) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'tmk-landing-leads' });
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME, 0);
  }
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() < HEADERS.length) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#FFD166');
    sheet.setColumnWidths(1, HEADERS.length, 150);
  }
  return sheet;
}

function notify_(data, phone, sheet, isDeletion) {
  var digits = phone.replace(/\D/g, '');
  var lines = [
    isDeletion ? 'ЗАПРОС НА УДАЛЕНИЕ ПЕРСОНАЛЬНЫХ ДАННЫХ - ответить в течение 10 рабочих дней' : 'Новая заявка на бесплатный разбор',
    '',
    'Имя: ' + (data.name || ''),
    'Телефон: ' + phone,
    'WhatsApp: https://wa.me/' + digits,
    'Как связаться: ' + (data.contact_method || 'не указано'),
    'Сайт / 2ГИС / Instagram: ' + (data.link || 'не указано'),
    'Сфера: ' + (data.business_type || 'не указана'),
    'Город: ' + (data.city || 'не указан'),
    'Пакет: ' + (data.package || 'не выбран'),
    'Согласие на рассылку: ' + (data.marketing === 'yes' ? 'да' : 'нет'),
    'Сообщение: ' + (data.message || '-'),
    'Источник: ' + ([data.utm_source, data.utm_medium, data.utm_campaign].filter(String).join(' / ') || 'без меток'),
    'Время: ' + (data.created_at || ''),
    '',
    'Все заявки: ' + sheet.getParent().getUrl()
  ];
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: (isDeletion ? 'Удаление данных: ' : 'Заявка с лендинга: ') + (data.name || 'без имени') + ', ' + phone,
    body: lines.join('\n'),
    name: 'Лендинг TMK Techno Horizon'
  });
}

function text_(v) {
  v = String(v == null ? '' : v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* Запустить один раз из редактора: создаёт лист с заголовками и запрашивает доступ к таблице и почте */
function setup() {
  getSheet_();
  Logger.log('Писем на сегодня осталось: ' + MailApp.getRemainingDailyQuota());
}
