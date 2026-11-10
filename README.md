# Лендинг «Вас найдут в Google, Яндексе, на картах и в ответах ИИ»

Сайт: https://tmk-vidimost.vercel.app (Vercel, проект `tmk-vidimost`).

## Поддомен ai.tmk-technohorizon.kz (сделать сейчас)

Сайт размещён на Vercel (проект `tmk-vidimost`), поддомен уже добавлен в проект и ждёт DNS. Код менять не нужно.
В DNS домена tmk-technohorizon.kz (PS.kz, ns1-ns3.ps.kz) добавить 2 записи, существующие записи не трогать:

| Тип | Имя (хост) | Значение |
|---|---|---|
| CNAME | `ai` | `a474e835ce245b3f.vercel-dns-017.com.` |
| TXT | `_vercel` | `vc-domain-verify=ai.tmk-technohorizon.kz,0b6c4fdd3ea91c53b1dd` |

TXT нужен, потому что домен уже привязан к другому аккаунту Vercel; после подтверждения его можно удалить. HTTPS Vercel выпустит сам (10-60 минут). Основной сайт tmk-technohorizon.kz на своём сервере не меняется.

## Из чего состоит

| Файл | Что это |
|---|---|
| `index.html` | Главная страница |
| `spasibo.html` | Страница «Спасибо за заявку» (`/spasibo`, закрыта от индексации) |
| `privacy.html`, `terms.html`, `vozvrat.html`, `cookies.html`, `udalenie-dannyh.html`, `licenses.html` | Документы. Собираются скриптом `tools/build.py` - правьте текст там, а не в HTML |
| `assets/styles.css` | Все стили |
| `assets/app.js` | Цены по сфере, маска телефона, отправка формы, события аналитики |
| `assets/analytics.js` | Баннер cookie и счётчики GA4 / Метрики (включаются только после согласия) |
| `assets/thanks.js` | Засчитывает заявку (generate_lead / lead_form) один раз на странице «Спасибо» |
| `assets/deletion.js` | Форма удаления данных и отписки |
| `api/lead.py` | Серверная функция Vercel: проверяет форму и передаёт заявку в Google Apps Script |
| `apps-script/Code.gs` | Копия скрипта «Приём заявок с лендинга TMK» (аккаунт tmk.techno.horizon@gmail.com) - на сайт не выкладывается |
| `tools/devserver.py` | Локальная проверка: `python3 tools/devserver.py` → http://127.0.0.1:8790 |

## Как работают заявки

Форма → `POST /api/lead` → Apps Script (адрес и секрет - в переменных окружения Vercel `LEADS_WEBHOOK_URL`, `LEADS_WEBHOOK_SECRET`) → строка в Google Таблице «Заявки с лендинга TMK (видимость бизнеса)» + письмо на tmk.techno.horizon@gmail.com → переход на `/spasibo`.
Если таблица недоступна, посетитель видит ошибку с кнопкой WhatsApp, а заявка пишется в журнал функции Vercel (`LEAD_NOT_DELIVERED`).

## Частые задачи

**Вписать реквизиты компании.** Открыть `tools/build.py`, заполнить `REQUISITES` (legal_name, bin, address), выполнить `python3 tools/build.py`, опубликовать.

**Яндекс Метрика.** Счётчик 114152302 на корпоративном Яндекс ID «TMK Limited» (`assets/analytics.js` → `YM_ID`), 7 целей «JavaScript-событие»: `lead_form`, `click_whatsapp`, `click_phone`, `click_email`, `cta_click`, `package_click`, `form_start`.

**Яндекс Вебмастер.** Метатег `yandex-verification` уже в `index.html`. Чтобы подтвердить сайт под другим аккаунтом, добавьте сайт там и вставьте его метатег рядом.

**Опубликовать изменения.** В папке `landing`: `vercel deploy --prod` (нужен вход в аккаунт Vercel). Файл `.env.local`, если CLI его создаст, не публикуется (`.vercelignore`) - удалите его.

**Свой домен.** Vercel → проект → Settings → Domains → добавить домен, затем запись DNS у регистратора. После этого заменить `tmk-vidimost.vercel.app` во всех файлах (`grep -rl tmk-vidimost.vercel.app .`) и добавить новый адрес в GA4 и Search Console.

## Аналитика

- GA4: аккаунт «TMK Limited» → ресурс «Лендинг tmk-vidimost.vercel.app», поток `G-KHNE6V8072`. Ключевые события отметить: `generate_lead`, `click_whatsapp`, `click_phone`.
- Search Console: ресурс `https://tmk-vidimost.vercel.app/`, подтверждён метатегом, sitemap отправлен.
- Яндекс Метрика: счётчик 114152302; Яндекс Вебмастер: сайт подтверждён под «TMK Limited» (метатег на странице).
- Персональные данные (имя, телефон) в счётчики не передаются.

## Важно

- Тариф Vercel Hobby по правилам Vercel - только для некоммерческого использования. Для рабочего сайта нужен Pro или перенос на хостинг компании (сайт статический + одна функция на Python, переносится без переделок).
- Во всех текстах - короткое тире «-».
