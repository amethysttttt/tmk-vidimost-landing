(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TmkCrm = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var C = {
    STATUSES: ['Новая','Готовится разбор','В работе','КП отправлено','Переговоры','Успешно','Отказ','Отложено'],
    RESULTS: ['Успешно','Отказ','Отложено'],
    SOURCES: [
      { id: 'site_seo', label: 'SEO + GEO — лендинг' },
      { id: 'site_corp', label: 'Techno Horizon — корпоративный сайт' },
      { id: 'whatsapp', label: 'WhatsApp' },
      { id: 'call', label: 'Звонок' },
      { id: 'other', label: 'Другое' }
    ],
    FORM_LABELS: {
      seo_audit: 'Бесплатный SEO + GEO разбор',
      deletion: 'Запрос на удаление данных',
      manual: 'Ручной ввод'
    },
    NEXT_ACTIONS: ['Позвонить','Написать в WhatsApp','Подготовить разбор','Отправить КП','Повторный контакт','Дождаться решения','Другое'],
    REFUSE_REASONS: ['Высокая стоимость','Не актуально','Выбрал другого подрядчика','Нет бюджета','Нецелевой запрос','Не удалось связаться','Другое']
  };
  C.sourceLabel = function (id) {
    var row = C.SOURCES.find(function (s) { return s.id === id; });
    return row ? row.label : (id || '—');
  };
  C.isSeoAuditLead = function (lead) {
    if (!lead || lead.source !== 'site_seo') return false;
    var service = (lead.service || '').trim();
    if (service.indexOf('Пакет ') === 0) return false;
    if (service === 'Бесплатный SEO + GEO разбор') return true;
    var form = lead.form_name || '';
    if (form.toLowerCase().indexOf('удаление') !== -1) return false;
    var t = service + ' ' + form;
    return (t.indexOf('SEO') !== -1 || t.indexOf('разбор') !== -1) && service.indexOf('Пакет ') !== 0;
  };
  C.showAuditBlock = function (lead) {
    return C.isSeoAuditLead(lead) || lead.status === 'Готовится разбор' || !!lead.audit_due_at;
  };
  return C;
});
