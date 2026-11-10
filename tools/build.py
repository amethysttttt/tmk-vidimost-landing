# -*- coding: utf-8 -*-
"""Сборка общих частей сайта: подвал на всех страницах и юридические страницы.

Запуск из папки landing:  python3 tools/build.py
Реквизиты компании меняются ТОЛЬКО здесь, в REQUISITES, - потом снова запустить скрипт.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://tmk-vidimost.vercel.app"
EDITION = "9 ноября 2026 года"

# Заполнить, когда компания пришлёт реквизиты (пустые поля на сайте не выводятся)
REQUISITES = {
    "brand": "TMK Techno Horizon",
    "legal_name": "Частная компания «TMK TECHNOHORIZON LTD.»",
    "bin": "240140900168",
    "address": "юридический адрес: 010000, г. Астана, район Есиль, пр. Улы Дала, д. 41/3, кв. 3",
    "city": "г. Алматы, Республика Казахстан",
    "phone": "+7 747 907 16 22",
    "phone_href": "+77479071622",
    "email": "tmk.techno.horizon@gmail.com",
}


def operator_line():
    r = REQUISITES
    parts = [r["legal_name"] or r["brand"]]
    if r["legal_name"]:
        parts[0] += " (" + r["brand"] + ")"
    if r["bin"]:
        parts.append("БИН " + r["bin"])
    parts.append(r["address"] or r["city"])
    return ", ".join(parts)


def footer_html():
    r = REQUISITES
    req = ['<p class="footer-req">' + operator_line() + "</p>", '<p class="footer-req">Офис и работа с клиентами: г. Алматы, по всему Казахстану</p>']
    return """<!--FOOTER:start-->
<footer class="footer">
  <div class="wrap">
    <div>
      <a class="logo" href="/" aria-label="TMK Techno Horizon - на главную"><img src="/assets/logo.png" alt="TMK Techno Horizon" width="127" height="22" loading="lazy"></a>
      <p>Делаем так, чтобы бизнес находили в поиске и на картах, а ИИ рекомендовал ваш товар или услугу.</p>
      %s
    </div>
    <div>
      <p><a href="tel:%s" data-loc="footer">%s</a></p>
      <p><a href="https://wa.me/77479071622" target="_blank" rel="noopener" data-loc="footer">WhatsApp</a></p>
      <p><a href="mailto:%s" data-loc="footer">%s</a></p>
      <p><a href="https://tmk-technohorizon.kz/" target="_blank" rel="noopener">tmk-technohorizon.kz</a>, <a href="https://www.instagram.com/tmk.tech/" target="_blank" rel="noopener">Instagram</a></p>
    </div>
    <nav aria-label="Документы">
      <p><a href="/privacy">Политика конфиденциальности</a></p>
      <p><a href="/terms">Условия использования</a></p>
      <p><a href="/vozvrat">Политика возврата средств</a></p>
      <p><a href="/cookies">Использование cookie</a></p>
      <p><a href="/udalenie-dannyh">Удалить мои данные или отписаться</a></p>
      <p><a href="/licenses">Лицензии и источники</a></p>
      <p><button type="button" class="link-btn" data-cookie-settings>Настройки cookie</button></p>
    </nav>
    <div class="footer-bottom">
      <span>© 2026 %s. Сайт для лиц старше 18 лет.</span>
      <span>Цены на сайте - ориентир, не публичная оферта</span>
    </div>
  </div>
</footer>
<!--FOOTER:end-->""" % ("\n      ".join(req), r["phone_href"], r["phone"], r["email"], r["email"], r["brand"])


HEAD = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} | TMK Techno Horizon</title>
<meta name="description" content="{description}">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="{site}{path}">
<meta name="theme-color" content="#040916">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/assets/icon-512.png" type="image/png" sizes="512x512">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="stylesheet" href="/assets/fonts/fonts.css">
<link rel="stylesheet" href="/assets/styles.css">
<script src="/assets/analytics.js" defer></script>
{extra_head}</head>
<body>
<a class="skip-link" href="#main">Перейти к содержимому</a>
<header class="site-header is-solid">
  <div class="wrap">
    <a class="logo" href="/" aria-label="TMK Techno Horizon - на главную"><img src="/assets/logo-dark.png" alt="TMK Techno Horizon" width="139" height="24"></a>
    <div class="header-actions"><a class="btn header-cta" href="/#zayavka">Оставить заявку</a></div>
  </div>
</header>
<main id="main" class="wrap">
  <article class="legal">
    <h1 class="h2" style="max-width:none">{h1}</h1>
    <p class="small">Редакция от {edition}</p>
{body}
  </article>
</main>
{footer}
</body>
</html>
"""


def page(path, title, description, body, extra_head=""):
    html = HEAD.format(title=title, description=description, site=SITE, path=path, h1=title,
                       edition=EDITION, body=body, footer=footer_html(), extra_head=extra_head)
    fn = os.path.join(ROOT, path.strip("/") + ".html")
    with open(fn, "w", encoding="utf-8") as f:
        f.write(html)
    return fn


R = REQUISITES
CONTACT = '<a href="mailto:%s">%s</a>, <a href="tel:%s">%s</a>' % (R["email"], R["email"], R["phone_href"], R["phone"])

PRIVACY = """
    <h2>1. Кто обрабатывает данные</h2>
    <p>Оператор персональных данных - {operator} (далее - «мы»). Связаться с нами: {contact}.</p>
    <p>Политика написана в соответствии с Законом Республики Казахстан «О персональных данных и их защите» от 21 мая 2013 года № 94-V и действует для сайта {site}.</p>

    <h2>2. Какие данные мы получаем</h2>
    <ul>
      <li>Из формы заявки: имя, телефон, ссылка на сайт или страницу компании, сфера бизнеса, город, удобный способ связи, выбранный пакет, отметка о согласии на рассылку.</li>
      <li>Из формы удаления данных: имя, телефон и ваше сообщение.</li>
      <li>Технические данные о визите: адрес страницы, источник перехода и рекламные метки (UTM). Данные о действиях на сайте собирают счётчики - только если вы разрешили аналитические cookie.</li>
    </ul>
    <p>Мы не просим и не собираем ИИН, паспортные и банковские данные, сведения о здоровье и другие чувствительные данные.</p>

    <h2>3. Зачем мы их используем</h2>
    <ul>
      <li>Чтобы связаться с вами по заявке, подготовить бесплатный разбор и, если вы попросите, коммерческое предложение.</li>
      <li>Чтобы присылать полезные материалы и новости - только если вы отдельно отметили это в форме.</li>
      <li>Чтобы выполнить ваш запрос на удаление данных или отписку.</li>
      <li>Чтобы понимать, какие разделы сайта полезны, - по обезличенной статистике и только с вашего согласия на cookie.</li>
    </ul>

    <h2>4. Основания и согласие</h2>
    <p>Мы обрабатываем данные на основании вашего согласия. Согласие на обработку данных для ответа на заявку и согласие на рассылку - разные: второе необязательно, и флажок для него не отмечен заранее. Любое согласие можно отозвать - см. раздел 9.</p>

    <h2>5. Возраст и данные детей</h2>
    <p>Сайт предназначен для представителей бизнеса старше 18 лет. Отправляя форму, вы подтверждаете, что вам есть 18 лет. Мы сознательно не собираем данные детей. Если мы узнаем, что получили данные лица младше 18 лет, мы удалим их. Сообщить об этом можно по контактам из раздела 1.</p>

    <h2>6. Кому передаются данные</h2>
    <p>Мы не продаём данные и не передаём их для рекламы третьих лиц. Для работы сайта мы пользуемся сервисами, которые обрабатывают данные по нашему поручению:</p>
    <ul>
      <li>Vercel Inc. (США) - хостинг сайта и серверная функция, которая принимает заявки.</li>
      <li>Google LLC (США) - Google Таблицы и Gmail: хранение заявок и уведомления сотрудникам; Google Analytics - статистика посещений, только с согласия.</li>
      <li>Яндекс Метрика (Яндекс) - статистика посещений и Вебвизор, только с согласия.</li>
      <li>WhatsApp (Meta) - только если вы сами нажали кнопку WhatsApp и написали нам.</li>
    </ul>
    <p>Подробный список и описание cookie - на странице <a href="/cookies">«Использование cookie»</a>. Серверы этих сервисов могут находиться за пределами Казахстана, поэтому, отправляя форму, вы соглашаетесь на трансграничную передачу данных. Доступ к заявкам есть только у сотрудников, которые с ними работают.</p>

    <h2>7. Сколько мы храним данные</h2>
    <p>Пока это нужно для целей из раздела 3, но не дольше 3 лет с последнего общения с вами, либо до отзыва согласия. После этого данные удаляются.</p>

    <h2>8. Рассылки и отписка</h2>
    <p>Материалы и новости мы присылаем, только если вы отметили это в форме. Отписаться можно в любой момент: ответьте «Стоп» на наше сообщение, напишите на {email} или заполните <a href="/udalenie-dannyh">форму отписки</a>. Отписка не влияет на работу по вашей заявке.</p>

    <h2>9. Ваши права и удаление данных</h2>
    <p>Вы можете узнать, какие ваши данные у нас есть, попросить их исправить или удалить и отозвать согласие. Для этого заполните <a href="/udalenie-dannyh">форму удаления данных</a> или напишите на {email} с темой «Персональные данные». Мы ответим и выполним запрос в течение 10 рабочих дней.</p>

    <h2>10. Как мы защищаем данные</h2>
    <p>Сайт работает только по защищённому протоколу HTTPS. Заявки передаются в таблицу по защищённому каналу с секретным ключом, доступ к таблице ограничен.</p>

    <h2>11. Изменения политики</h2>
    <p>Мы можем обновлять политику. Новая редакция действует с момента публикации на этой странице, дата редакции указана вверху.</p>
""".format(operator=operator_line(), contact=CONTACT, site=SITE, email='<a href="mailto:%s">%s</a>' % (R["email"], R["email"]))

TERMS = """
    <h2>1. О чём эти условия</h2>
    <p>Условия регулируют использование сайта {site} (далее - «сайт»). Сайт принадлежит {operator}. Пользуясь сайтом, вы соглашаетесь с этими условиями.</p>

    <h2>2. Информация на сайте</h2>
    <p>Тексты, цены и сроки на сайте - справочная информация и ориентир, а не публичная оферта. Точный состав работ, цена, сроки и порядок оплаты фиксируются в договоре. Примеры и иллюстрации на сайте помечены как примеры и не являются результатами конкретных клиентов.</p>

    <h2>3. Бесплатный разбор</h2>
    <p>Разбор видимости бесплатен и ни к чему не обязывает. Мы готовим его в течение 3 рабочих дней после того, как уточним детали. Мы можем отказаться готовить разбор, если заявка оставлена не от имени бизнеса, содержит заведомо недостоверные данные или нарушает закон. Отчёт можно использовать в своём бизнесе, в том числе с другими подрядчиками.</p>

    <h2>4. Результаты и гарантии</h2>
    <p>Мы не гарантируем конкретные позиции в поиске, показы на картах и ответы ИИ-помощников: они зависят от решений Google, Яндекса, 2ГИС и разработчиков ИИ. Мы отвечаем за объём и качество работ, согласованных в договоре, и регулярно показываем результаты замеров.</p>

    <h2>5. Пользователь сайта</h2>
    <ul>
      <li>Сайт предназначен для лиц старше 18 лет, действующих в интересах бизнеса.</li>
      <li>Указывайте в формах достоверные данные и только свои или те, на передачу которых у вас есть согласие.</li>
      <li>Нельзя мешать работе сайта, отправлять спам и автоматические заявки.</li>
    </ul>

    <h2>6. Права на материалы</h2>
    <p>Тексты, дизайн, иллюстрации и логотип принадлежат TMK Techno Horizon. Копировать их можно только с нашего письменного разрешения. Шрифт и знаки третьих лиц используются по лицензиям - см. <a href="/licenses">«Лицензии и источники»</a>.</p>

    <h2>7. Ссылки на другие сервисы</h2>
    <p>На сайте есть ссылки на WhatsApp, Instagram и другие сервисы. За их работу и правила отвечают их владельцы.</p>

    <h2>8. Персональные данные и cookie</h2>
    <p>Как мы обрабатываем данные - в <a href="/privacy">политике конфиденциальности</a>, как используем cookie - на странице <a href="/cookies">«Использование cookie»</a>.</p>

    <h2>9. Применимое право</h2>
    <p>К условиям применяется право Республики Казахстан. Споры решаем переговорами, а если договориться не получилось - в суде по месту нахождения исполнителя.</p>

    <h2>10. Контакты</h2>
    <p>{contact}.</p>
""".format(site=SITE, operator=operator_line(), contact=CONTACT)

REFUND = """
    <p>Политика объясняет, когда и как мы возвращаем деньги. Если в подписанном договоре условия другие, действуют условия договора.</p>

    <h2>1. Бесплатный разбор</h2>
    <p>Разбор бесплатный, оплата за него не берётся, поэтому и возвращать нечего.</p>

    <h2>2. Аудит видимости (120 000 ₸ разово)</h2>
    <ul>
      <li>Если работа ещё не началась - возвращаем 100% оплаты.</li>
      <li>Если работа началась, но отчёт не сдан - возвращаем оплату за вычетом уже выполненной части по акту.</li>
      <li>После сдачи отчёта оплата не возвращается: услуга оказана полностью.</li>
    </ul>

    <h2>3. Ежемесячные пакеты</h2>
    <ul>
      <li>Пакеты оплачиваются помесячно, вперёд за следующий месяц.</li>
      <li>Если вы прекращаете работу раньше срока договора, мы возвращаем оплату за месяцы, к которым ещё не приступали. За текущий месяц возвращаем оплату за вычетом выполненных работ по акту.</li>
      <li>При оплате за год со скидкой 10% возврат за неиспользованные месяцы считаем так: уплаченная сумма минус уже прошедшие месяцы по обычной цене без скидки.</li>
      <li>Платные размещения на сторонних площадках (например, платный каталог), которые вы согласовали и которые уже оплачены площадке, возвращаются только по правилам этой площадки.</li>
    </ul>

    <h2>4. Как запросить возврат</h2>
    <p>Напишите на <a href="mailto:{email}">{email}</a> с темой «Возврат»: укажите название компании, номер договора и причину. Мы ответим в течение 10 рабочих дней. Деньги возвращаем тем же способом, которым была оплата, в течение 10 рабочих дней после подписания акта сверки.</p>

    <h2>5. Скрытые платежи</h2>
    <p>Скрытых платежей и комиссий нет. Всё, что оплачивается отдельно, называем заранее и только с вашего согласия.</p>
""".format(email=R["email"])

COOKIES = """
    <p>Cookie - небольшие файлы, которые сайт сохраняет в браузере. Похожим образом работает и хранилище браузера (localStorage, sessionStorage). Ниже - что именно использует этот сайт.</p>

    <h2>1. Необходимые - работают всегда</h2>
    <table class="legal-table">
      <thead><tr><th>Что</th><th>Зачем</th><th>Срок</th></tr></thead>
      <tbody>
        <tr><td>tmk_cookie_consent_v1 (хранилище браузера)</td><td>Запоминает ваш выбор в баннере cookie</td><td>Пока вы его не удалите</td></tr>
        <tr><td>tmk_utm, tmk_ref, tmk_lead (хранилище сессии)</td><td>Передают в заявку рекламную метку и источник перехода, засчитывают отправку формы один раз</td><td>До закрытия вкладки</td></tr>
      </tbody>
    </table>

    <h2>2. Аналитические - только с вашего согласия</h2>
    <table class="legal-table">
      <thead><tr><th>Сервис</th><th>Cookie</th><th>Зачем</th><th>Срок</th></tr></thead>
      <tbody>
        <tr><td>Яндекс Метрика (Яндекс), включая Вебвизор</td><td>_ym_uid, _ym_d и другие служебные _ym_*</td><td>Обезличенная статистика посещений, карта кликов, запись действий на странице. Вебвизор не записывает то, что вы вводите в поля формы</td><td>До 1 года</td></tr>
        <tr><td>Google Analytics 4 (Google LLC)</td><td>_ga, _ga_*</td><td>Обезличенная статистика посещений и действий на сайте</td><td>До 2 лет</td></tr>
      </tbody>
    </table>
    <p>Пока вы не нажали «Разрешить аналитику», код этих сервисов на сайте не загружается.</p>

    <h2>3. Сторонние сервисы (SDK) на сайте</h2>
    <ul>
      <li>Google Analytics 4 и Яндекс Метрика - только с согласия, см. выше.</li>
      <li>Vercel - хостинг и приём заявок. Cookie для посетителей не устанавливает.</li>
      <li>Google Таблицы и Gmail - хранение заявок на стороне сервера. В браузере посетителя не работают.</li>
      <li>WhatsApp - только ссылка: сервис открывается, если вы сами нажали кнопку.</li>
      <li>Шрифт Onest загружается с этого же сайта, без обращений к Google Fonts.</li>
      <li>Рекламных пикселей (Meta, TikTok и других) на сайте нет.</li>
    </ul>

    <h2>4. Как изменить выбор</h2>
    <p><button type="button" class="btn btn-dark" data-cookie-settings>Открыть настройки cookie</button></p>
    <p>Также cookie можно удалить или запретить в настройках браузера. Сайт продолжит работать.</p>
"""

DELETION = """
    <p>Здесь можно попросить удалить ваши персональные данные или отписаться от рассылки. Мы выполним запрос в течение 10 рабочих дней и сообщим об этом по указанному телефону.</p>

    <div class="form-card form-card-light">
      <div class="deletion-done" hidden>
        <h2 class="h3">Запрос получен</h2>
        <p>Мы выполним его в течение 10 рабочих дней и сообщим вам. Если появятся вопросы - напишите на <a href="mailto:{email}">{email}</a>.</p>
      </div>
      <form id="deletion-form" action="/api/lead" method="post" novalidate>
        <input type="hidden" name="request_type" value="deletion">
        <div class="form-grid">
          <div class="field" data-field="name">
            <label for="d-name">Ваше имя</label>
            <input id="d-name" name="name" type="text" autocomplete="name" maxlength="80" required>
            <p class="error-text" id="e-name">Напишите имя, как в заявке</p>
          </div>
          <div class="field" data-field="phone">
            <label for="d-phone">Телефон из заявки</label>
            <input id="d-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="18" required placeholder="+7 (___) ___-__-__">
            <p class="error-text" id="e-phone">Введите номер полностью: +7 и 10 цифр</p>
          </div>
          <div class="field full">
            <span class="label" id="what-label">Что сделать</span>
            <div class="radio-row" role="radiogroup" aria-labelledby="what-label">
              <label><input type="radio" name="what" value="Удалить все мои данные" checked>Удалить все мои данные</label>
              <label><input type="radio" name="what" value="Только отписать от рассылки">Только отписать от рассылки</label>
            </div>
          </div>
          <div class="field full">
            <label for="d-message">Комментарий <span class="opt">- по желанию</span></label>
            <input id="d-message" name="message" type="text" maxlength="500">
          </div>
        </div>
        <div class="hp-field" aria-hidden="true"><label for="d-company">Не заполняйте это поле</label><input id="d-company" name="company" type="text" tabindex="-1" autocomplete="off"></div>
        <div class="form-submit"><button class="btn btn-dark" type="submit">Отправить запрос</button></div>
        <p class="form-status" role="alert" aria-live="assertive"></p>
      </form>
    </div>
    <p style="margin-top:24px">Можно и без формы: напишите на <a href="mailto:{email}">{email}</a> с темой «Персональные данные» или ответьте «Стоп» на наше сообщение, чтобы отписаться.</p>
""".format(email=R["email"])

LICENSES = """
    <h2>Шрифт</h2>
    <ul>
      <li>Onest - © The Onest Project Authors, лицензия SIL Open Font License 1.1. <a href="/assets/fonts/Onest-OFL.txt">Текст лицензии</a>.</li>
    </ul>
    <p>Шрифт размещён на этом сайте; для ускорения загрузки из них оставлены только нужные знаки, что лицензия разрешает.</p>

    <h2>Изображения и значки</h2>
    <ul>
      <li>Логотип и значок TMK Techno Horizon - собственность TMK Techno Horizon.</li>
      <li>Иллюстрация «как клиент видит компанию», схема «Откуда приходят обращения», макет отчёта на первом экране, значки и картинка для соцсетей нарисованы для этого сайта. Цифры в макете отчёта условные. Иллюстрация - условный пример, «Ваша клиника» и «ваша-клиника.kz» - вымышленные названия.</li>
      <li>Значок WhatsApp - из набора Simple Icons (лицензия CC0 1.0). WhatsApp - товарный знак WhatsApp LLC; значок обозначает только ссылку для связи.</li>
      <li>Фотографий и стоковых изображений на сайте нет.</li>
    </ul>

    <h2>Товарные знаки</h2>
    <p>Google, Яндекс, Алиса, 2ГИС, ChatGPT, Gemini, Perplexity, Instagram и WhatsApp - товарные знаки их владельцев. Мы упоминаем их только чтобы описать, где клиенты ищут компании, и не связаны с этими компаниями. Их логотипы на сайте не используются.</p>

    <h2>Источники цифр</h2>
    <ul>
      <li>Доля поиска в Казахстане (Google 68%, Яндекс 30%): <a href="https://gs.statcounter.com/search-engine-market-share/all/kazakhstan" target="_blank" rel="noopener">StatCounter, октябрь 2026</a>.</li>
      <li>900 млн пользователей ChatGPT в неделю: заявление OpenAI от 27 февраля 2026 года, <a href="https://techcrunch.com/2026/02/27/chatgpt-reaches-900m-weekly-active-users" target="_blank" rel="noopener">TechCrunch</a>.</li>
    </ul>
"""


def put_footer(fn):
    with open(fn, encoding="utf-8") as f:
        s = f.read()
    block = footer_html()
    if "<!--FOOTER:start-->" in s:
        s = re.sub(r"<!--FOOTER:start-->.*?<!--FOOTER:end-->", lambda m: block, s, flags=re.S)
    elif "<!--FOOTER-->" in s:
        s = s.replace("<!--FOOTER-->", block)
    elif '<footer class="footer"' in s:
        s = re.sub(r"<footer class=\"footer\".*?</footer>", lambda m: block, s, flags=re.S)
    else:
        s = s.replace("</body>", block + "\n</body>")
    with open(fn, "w", encoding="utf-8") as f:
        f.write(s)


if __name__ == "__main__":
    out = [
        page("/privacy", "Политика конфиденциальности", "Как TMK Techno Horizon обрабатывает и защищает персональные данные с сайта.", PRIVACY),
        page("/terms", "Условия использования", "Условия использования сайта TMK Techno Horizon о продвижении бизнеса в поиске, на картах и в ИИ.", TERMS),
        page("/vozvrat", "Политика возврата средств", "Когда и как TMK Techno Horizon возвращает оплату за аудит и ежемесячные пакеты.", REFUND),
        page("/cookies", "Использование cookie", "Какие cookie и сторонние сервисы использует сайт и как изменить выбор.", COOKIES),
        page("/udalenie-dannyh", "Удаление данных и отписка", "Запрос на удаление персональных данных или отписку от рассылки.", DELETION,
             extra_head='<script src="/assets/deletion.js" defer></script>\n'),
        page("/licenses", "Лицензии и источники", "Лицензии шрифтов и изображений, товарные знаки и источники цифр на сайте.", LICENSES),
    ]
    for name in ("index.html", "spasibo.html", "404.html"):
        put_footer(os.path.join(ROOT, name))
        out.append(name)
    print("\n".join(os.path.relpath(p, ROOT) for p in out))
