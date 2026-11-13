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

**Если у кого-то сайт не открывается** (часть провайдеров блокирует адреса Vercel), надёжнее разместить лендинг на сервере компании: вместо CNAME - A-запись `ai` → `185.146.3.124`, nginx-конфиг и шаги - в [deploy/СЕРВЕР_инструкция.md](deploy/СЕРВЕР_инструкция.md).

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

## CRM заявок (/crm)

Закрытая CRM для заявок с лендинга и корпоративного сайта (ТЗ от 11.11.2026). Отдельной БД нет: данные лежат в Google Таблице, к ней обращается Apps Script.

```
браузер /crm ── crm.html + assets/crm.js
     │  (cookie-сессия, HMAC)
     ▼
Vercel: api/crm.py ─────┐        api/lead.py   ← форма лендинга
        api/intake.py ──┤        (Bearer CORP_INTAKE_KEY ← сервер tmk-technohorizon.kz)
        api/_wa.py      │  JSON + общий секрет
                        ▼
Apps Script (apps-script/Code.gs, веб-приложение)
        │ LockService, дедупликация, история, очередь писем (MailApp)
        ▼
Google Таблица: CRM_Заявки, CRM_История, CRM_Файлы, CRM_ФайлыДанные, CRM_Уведомления
```

- `api/crm.py` - вход (логин и пароль, PBKDF2, блокировка после 5 ошибок), сессии, список, карточка, файлы, настройки.
- `api/intake.py` - приём заявок с сервера корпоративного сайта.
- `api/lead.py` - форма лендинга. Заявки, пересланные сервером компании (`LEADS_TRUSTED_PROXIES`), не попадают под лимит «5 заявок за 10 минут с IP».
- `api/_wa.py` - WhatsApp-уведомления (Meta Cloud API или CallMeBot), настраиваются в CRM.
- Переменные Vercel:
  - `LEADS_WEBHOOK_URL`, `LEADS_WEBHOOK_SECRET`;
  - `CRM_SESSION_SECRET`, `CRM_LOGIN`, `CRM_INITIAL_HASH` (`pbkdf2_sha256$итерации$соль$хеш`);
  - `CORP_INTAKE_KEY`.

### Локальный запуск (без Google и Vercel)

Нужны Python 3.9+ и Node.js 18+. Сторонних пакетов нет. Вместо Apps Script работает эмулятор `tools/gas-emulator.js`: он выполняет настоящий `Code.gs` с таблицей в памяти, а WhatsApp и почту только записывает, ничего не отправляя.

```bash
node tools/gas-emulator.js 8791        # терминал 1: «хранилище»
python3 tools/devserver.py             # терминал 2: сайт и API на http://127.0.0.1:8790
python3 tools/test_crm.py              # терминал 3: 68 проверок по пунктам приёмки ТЗ
```

- CRM: http://127.0.0.1:8790/crm, логин `dev`, пароль `dev-password-123` (только для локальной проверки).
- Отправить заявку можно с формы лендинга http://127.0.0.1:8790/#zayavka.
- Заявку «как с корпоративного сайта» можно отправить запросом:
  ```bash
  curl -X POST http://127.0.0.1:8790/api/intake -H "Authorization: Bearer dev-intake-key" \
    -H "Content-Type: application/json" \
    -d '{"name":"ТЕСТ Иван","phone":"+77011234567","service":"Разработка сайта","source":"process"}'
  ```
- Что «ушло» из эмулятора: `http://127.0.0.1:8791/__state` (листы), `/__mail` (письма), `/__fetch` (WhatsApp).
- Тест очищает эмулятор (`/__reset`), поэтому после него перезапустите эмулятор, если хотите смотреть CRM с чистыми данными.

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
