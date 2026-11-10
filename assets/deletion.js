/* Форма «Удаление данных и отписка» */
(function () {
  'use strict';
  var form = document.getElementById('deletion-form');
  if (!form) { return; }
  var phone = form.elements.phone;
  var status = form.querySelector('.form-status');
  var btn = form.querySelector('button[type="submit"]');
  function digits(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 11 && /^[78]/.test(d)) { d = d.slice(1); }
    return d.slice(0, 10);
  }
  function fmt(d) {
    if (!d) { return ''; }
    var o = '+7 (' + d.slice(0, 3);
    if (d.length > 3) { o += ') ' + d.slice(3, 6); }
    if (d.length > 6) { o += '-' + d.slice(6, 8); }
    if (d.length > 8) { o += '-' + d.slice(8, 10); }
    return o;
  }
  phone.addEventListener('blur', function () { var d = digits(phone.value); if (d.length === 10) { phone.value = fmt(d); } });
  function setError(name, on) {
    var box = form.querySelector('[data-field="' + name + '"]');
    box.classList.toggle('has-error', on);
    var input = box.querySelector('input');
    input.setAttribute('aria-invalid', on ? 'true' : 'false');
    if (on) { input.setAttribute('aria-describedby', 'e-' + name); } else { input.removeAttribute('aria-describedby'); }
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var okName = form.elements.name.value.trim().length >= 2;
    var d = digits(phone.value);
    var okPhone = d.length === 10;
    setError('name', !okName);
    setError('phone', !okPhone);
    if (!okName) { form.elements.name.focus(); return; }
    if (!okPhone) { phone.focus(); return; }
    var what = form.querySelector('input[name="what"]:checked');
    var data = {
      request_type: 'deletion',
      name: form.elements.name.value.trim(),
      phone: '+7' + d,
      message: ((what ? what.value : '') + (form.elements.message.value.trim() ? '. ' + form.elements.message.value.trim() : '')).slice(0, 1000),
      company: form.elements.company.value,
      page: window.location.href.slice(0, 500)
    };
    btn.disabled = true;
    status.className = 'form-status';
    fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) { return r.json().then(function (b) { return r.ok && b.ok; }); })
      .then(function (ok) {
        if (!ok) { throw new Error('fail'); }
        form.hidden = true;
        var done = document.querySelector('.deletion-done');
        done.hidden = false;
        done.setAttribute('tabindex', '-1');
        done.focus();
      })
      .catch(function () {
        btn.disabled = false;
        status.innerHTML = 'Не получилось отправить. Попробуйте ещё раз или напишите на <a href="mailto:tmk.techno.horizon@gmail.com">tmk.techno.horizon@gmail.com</a>.';
        status.className = 'form-status is-error';
      });
  });
  if (/[?&]sent=1/.test(window.location.search)) {
    form.hidden = true;
    document.querySelector('.deletion-done').hidden = false;
  }
})();
