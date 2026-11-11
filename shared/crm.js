(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TmkCrm = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var C = {
    CRM_TITLE: 'TMK Techno Horizon',
    CSV_PREFIX: 'tmk-techno-horizon-leads',
    TIMEZONE: 'Asia/Almaty',
    STATUSES: ['Новая','Готовится разбор','В работе','КП отправлено','Переговоры','Успешно','Отказ','Отложено'],
    RESULTS: ['Успешно','Отказ','Отложено'],
    SOURCES: [
      { id: 'site_seo', label: 'SEO + GEO — лендинг' },
      { id: 'site_corp', label: 'Techno Horizon — корпоративный сайт' },
      { id: 'whatsapp', label: 'WhatsApp' },
      { id: 'call', label: 'Звонок' },
      { id: 'other', label: 'Другое' }
    ],
    SERVICES: [
      'Бесплатный SEO + GEO разбор','Пакет Старт','Пакет Рост','Пакет Лидер',
      'Аудит сайта / системы','Разработка сайта','Автоматизация процессов',
      'Система под бизнес','Мобильное приложение','AI-решение',
      'Не знаю — нужна консультация','Другое'
    ],
    FORM_LABELS: {
      seo_audit: 'Бесплатный SEO + GEO разбор',
      process: 'Обсудить задачу',
      contact: 'Готовы обсудить проект?',
      deletion: 'Запрос на удаление данных',
      manual: 'Ручной ввод'
    },
    CONTACT_METHODS: ['WhatsApp','Звонок','Telegram'],
    NEXT_ACTIONS: ['Позвонить','Написать в WhatsApp','Подготовить разбор','Отправить КП','Повторный контакт','Дождаться решения','Другое'],
    REFUSE_REASONS: ['Высокая стоимость','Не актуально','Выбрал другого подрядчика','Нет бюджета','Нецелевой запрос','Не удалось связаться','Другое'],
    AD_FIELDS: ['gclid','gbraid','wbraid','utm_source','utm_medium','utm_campaign','utm_content','utm_term']
  };
  C.READONLY_FIELDS = C.AD_FIELDS.concat(['id','number','created_at','updated_at','source','form_name','page_url','referrer']);
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
  C.emptyLead = function (o) {
    return Object.assign({
      name: '', company: '', phone: '', link: '', email: '',
      service: '', comment: '', business_type: '', city: '', contact_method: '',
      page_url: '', referrer: '', form_name: C.FORM_LABELS.manual, source: 'whatsapp',
      status: 'Новая', notes: '', talk_result: '', needs: '',
      next_action: '', next_action_at: '',
      audit_due_at: '', audit_search: '', audit_maps: '', audit_ai: '', audit_notes: '',
      proposal_sent_at: '', proposal_package: '', proposal_amount: '', proposal_notes: '',
      result: '', closed_at: '', refuse_reason: '',
      gclid: '', gbraid: '', wbraid: '',
      utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: ''
    }, o || {});
  };
  return C;
});
