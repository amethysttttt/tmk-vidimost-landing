/* Страница «Спасибо»: засчитываем заявку один раз - только после успешной отправки формы */
(function () {
  'use strict';
  var raw = null;
  try { raw = window.sessionStorage.getItem('tmk_lead'); } catch (e) {}
  if (raw) {
    var lead = {};
    try { lead = JSON.parse(raw) || {}; } catch (e) { lead = {}; }
    try { window.sessionStorage.removeItem('tmk_lead'); } catch (e) {}
    if (lead.t && Date.now() - lead.t < 10 * 60 * 1000 && typeof window.track === 'function') {
      window.track('generate_lead', 'lead_form', {
        business_type: lead.business_type || '',
        city: lead.city || '',
        contact_method: lead.contact_method || '',
        package: lead.package || ''
      });
    }
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!a || typeof window.track !== 'function') { return; }
    var href = a.getAttribute('href') || '';
    var loc = a.getAttribute('data-loc') || 'thanks';
    if (href.indexOf('wa.me/') !== -1) { window.track('click_whatsapp', 'click_whatsapp', { location: loc }); }
    else if (href.indexOf('tel:') === 0) { window.track('click_phone', 'click_phone', { location: loc }); }
    else if (href.indexOf('mailto:') === 0) { window.track('click_email', 'click_email', { location: loc }); }
  });
})();
