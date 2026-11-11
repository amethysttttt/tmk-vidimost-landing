# Лендинг «Вас найдут в Google, Яндексе, на картах и в ответах ИИ»

Сайт: https://ai.tmk-technohorizon.kz (Vercel, проект `tmk-vidimost`).

## CRM заявок (оба сайта)

Адрес: **https://ai.tmk-technohorizon.kz/crm**

Единый список лидов с SEO + GEO лендинга и корпоративного сайта Techno Horizon.

| Что | Как |
|---|---|
| Источник | `site_seo` / `site_corp` / WhatsApp / звонок / другое |
| Услуга | обязательна в списке и карточке |
| Срок 3 раб. дня SEO+GEO | только для «Бесплатный SEO + GEO разбор», не для пакетов и IT-услуг |
| Email-уведомления | `NOTIFY_EMAIL=kaelggbet@gmail.com` |
| WhatsApp +7 747 907 16 22 | блокер до `WHATSAPP_PROVIDER` |
| Публичная почта | не меняется (`tmk.techno.horizon@gmail.com` на сайтах) |

### Переменные (Vercel · лендинг)

См. `.env.example`. Минимум:

- `DATABASE_URL` — Postgres
- `CRM_LOGIN`, `CRM_PASSWORD` или `CRM_PASSWORD_HASH`
- `CRM_INGEST_SECRET`
- `SMTP_USER`, `SMTP_PASS`, `NOTIFY_EMAIL`
- `CRM_PUBLIC_URL=https://ai.tmk-technohorizon.kz`

Опционально: `LEADS_WEBHOOK_URL` / `LEADS_WEBHOOK_SECRET` — дубль SEO-заявок в Google Sheets.

### Корпоративный сайт (tmk-tech)

В env проекта:

```
CRM_INGEST_URL=https://ai.tmk-technohorizon.kz/api/crm/ingest
CRM_INGEST_SECRET=<тот же секрет>
```

Формы и `CONTACT_TO` / публичные контакты не меняются. CRM пишется до SMTP; сбой почты после записи в CRM не ломает успех для посетителя.

### Локально

```bash
export DATABASE_URL=postgresql://...
python3 tools/devserver.py
# http://127.0.0.1:8790/crm  · admin / qwerty
```

## Поддомен ai.tmk-technohorizon.kz

В DNS домена tmk-technohorizon.kz добавить (если ещё не добавлено):

| Тип | Имя | Значение |
|---|---|---|
| CNAME | `ai` | `a474e835ce245b3f.vercel-dns-017.com.` |
| TXT | `_vercel` | `vc-domain-verify=ai.tmk-technohorizon.kz,0b6c4fdd3ea91c53b1dd` |

## Из чего состоит

| Файл | Что это |
|---|---|
| `index.html` | Главная страница |
| `crm/` | UI CRM (логин, список, карточка) |
| `api/lead.py` | Форма лендинга → CRM (+ опционально Sheets) |
| `api/crm/*` | session, leads, ingest, export, attach, password |
| `crm_lib/` | БД, auth, уведомления, бизнес-логика |
| `shared/crm.js` + `crm.contract.json` | Общий контракт статусов/источников |
| `tools/devserver.py` | Локальная проверка |

## Как работают заявки SEO-лендинга

Форма → `POST /api/lead` → запись в Postgres CRM + email на `NOTIFY_EMAIL` → (опционально Sheets) → `/spasibo`.

## Частые задачи

**Опубликовать.** `vercel deploy --prod` в папке лендинга.

**Смена пароля CRM.** В интерфейсе «Пароль» → сгенерировать bcrypt → сохранить в `CRM_PASSWORD_HASH`, убрать `CRM_PASSWORD`.
