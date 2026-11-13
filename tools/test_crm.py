# -*- coding: utf-8 -*-
"""Автопроверка CRM по пунктам приёмки ТЗ (локально: эмулятор Apps Script + devserver).

    node tools/gas-emulator.js 8791 &  python3 tools/devserver.py &  python3 tools/test_crm.py
"""
import http.cookiejar
import json
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8790"
GAS = "http://127.0.0.1:8791"
PASSED, FAILED = [], []


def check(name, cond, extra=""):
    (PASSED if cond else FAILED).append(name)
    print(("OK   " if cond else "FAIL ") + name + ("" if cond else "  -> " + str(extra)[:300]))


def req(method, url, body=None, headers=None, opener=None, raw=False):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    h.update(headers or {})
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        resp = (opener or urllib.request.build_opener()).open(r, timeout=30)
        status, payload, hdrs = resp.status, resp.read(), resp.headers
    except urllib.error.HTTPError as e:
        status, payload, hdrs = e.code, e.read(), e.headers
    if raw:
        return status, payload, hdrs
    try:
        return status, json.loads(payload or b"{}")
    except ValueError:
        return status, {"_raw": payload[:200]}


def gas(path):
    return req("GET" if path.startswith("/__state") or path.startswith("/__mail") or path.startswith("/__fetch") else "POST",
               GAS + path, None if path.startswith("/__state") or path.startswith("/__mail") or path.startswith("/__fetch") else {})[1]


def crm_session(password="dev-password-123", ip="10.0.0.1"):
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    st, d = req("POST", BASE + "/api/crm?a=login", {"login": "dev", "password": password},
                {"X-CRM-Request": "1", "X-Real-Ip": ip}, op)
    return op, st, d


H = {"X-CRM-Request": "1"}
CORP = {"Authorization": "Bearer dev-intake-key"}

gas("/__reset")

# ---------- 1. Лендинг ----------
landing = {"name": "ТЕСТ Лендинг", "phone": "+77011112233", "link": "example.kz", "business_type": "Медицина",
           "city": "Алматы", "contact_method": "Telegram", "consent": "yes", "marketing": "", "package": "Рост",
           "utm_source": "google", "utm_medium": "cpc", "utm_campaign": "seo", "page": "https://ai.tmk-technohorizon.kz/?utm_source=google",
           "referrer": "https://google.com/", "company": ""}
st, d = req("POST", BASE + "/api/lead", landing, {"X-Real-Ip": "5.5.5.5"})
check("Лендинг: заявка принята (ok -> /spasibo)", st == 200 and d.get("ok"), d)
st2, d2 = req("POST", BASE + "/api/lead", landing, {"X-Real-Ip": "5.5.5.5"})
rows = gas("/__state")["sheets"].get("CRM_Заявки", [])
check("Лендинг: повторная отправка не создаёт дубль", st2 == 200 and len(rows) == 2, len(rows))
hdr = rows[0]
lead1 = dict(zip(hdr, rows[1]))
check("Лендинг: источник «SEO + GEO - лендинг»", lead1["Источник"] == "SEO + GEO - лендинг", lead1["Источник"])
check("Лендинг: UTM и страница сохранены", lead1["utm_source"] == "google" and lead1["utm_campaign"] == "seo" and "ai.tmk" in lead1["Страница формы"])
check("Лендинг: согласия раздельно", lead1["Согласие с политикой"] == "да" and lead1["Согласие на материалы"] == "нет")
check("Лендинг: срок разбора 3 рабочих дня", bool(lead1["Срок разбора"]) and lead1["Нужен разбор 3 дня"] == "да", lead1["Срок разбора"])
check("Лендинг: телефон нормализован", lead1["Телефон"] == "+77011112233" and lead1["Телефон (цифры)"] == "77011112233")
st, d = req("POST", BASE + "/api/lead", dict(landing, consent=""), {"X-Real-Ip": "5.5.5.5"})
check("Лендинг: без согласия - отказ", st == 400)
st, d = req("POST", BASE + "/api/lead", dict(landing, company="bot"), {"X-Real-Ip": "5.5.5.5"})
check("Лендинг: ловушка для ботов не создаёт заявку", st == 200 and len(gas("/__state")["sheets"]["CRM_Заявки"]) == 2)

# ---------- 2. Корпоративный сайт ----------
proc = {"name": "ТЕСТ Обсудить", "phone": "+7 (701) 222-33-44", "service": "Разработка сайта", "source": "process",
        "company": "", "renderedAt": 123, "page_url": "https://www.tmk-technohorizon.kz/?utm_source=ig&utm_medium=bio",
        "referrer": "https://instagram.com/", "client_ip": "7.7.7.7"}
st, d = req("POST", BASE + "/api/intake", proc, CORP)
check("Корп. «Обсудить задачу»: заявка создана", st == 200 and d.get("ok") and not d.get("duplicate"), d)
proc_id = d.get("id")
st, d = req("POST", BASE + "/api/intake", proc, CORP)
check("Корп.: повторная доставка не создаёт дубль", st == 200 and d.get("duplicate") and d.get("id") == proc_id, d)
contact = {"name": "ТЕСТ Проект", "phone": "87013334455", "message": "Нужна CRM для склада", "company": "",
           "page_url": "https://www.tmk-technohorizon.kz/en", "client_ip": "7.7.7.8"}
st, d = req("POST", BASE + "/api/intake", contact, CORP)
check("Корп. «Готовы обсудить проект?»: заявка создана", st == 200 and d.get("ok"), d)
kk = {"name": "ТЕСТ Қаз", "phone": "+77015556677", "service": "Сайт әзірлеу", "source": "process", "page_url": "https://www.tmk-technohorizon.kz/kk"}
st, d = req("POST", BASE + "/api/intake", kk, CORP)
check("Корп. KZ: услуга переведена на русский", st == 200 and d.get("ok"), d)
st, d = req("POST", BASE + "/api/intake", proc, {"Authorization": "Bearer wrong"})
check("Корп.: без ключа - 401", st == 401)
st, d = req("POST", BASE + "/api/intake", dict(proc, company="spam LLC", name="ТЕСТ Бот"), CORP)
check("Корп.: антиспам-поле не становится компанией, заявка не создаётся", d.get("skipped") == "spam")
st, d = req("POST", BASE + "/api/intake", dict(proc, service=""), CORP)
check("Корп.: «Обсудить задачу» без услуги - отказ как на сайте", st == 400)
rows = gas("/__state")["sheets"]["CRM_Заявки"]
leads = [dict(zip(rows[0], r)) for r in rows[1:]]
corp = [l for l in leads if l["Источник (код)"] == "corporate"]
check("Корп.: 3 заявки, источник «Techno Horizon - корпоративный сайт»", len(corp) == 3 and all(l["Источник"] == "Techno Horizon - корпоративный сайт" for l in corp), len(corp))
p = [l for l in corp if l["Форма"] == "Обсудить задачу" and l["Имя"] == "ТЕСТ Обсудить"][0]
check("Корп.: услуга и UTM из адреса страницы", p["Интересующая услуга"] == "Разработка сайта" and p["utm_source"] == "ig")
c = [l for l in corp if l["Форма"] == "Готовы обсудить проект?"][0]
check("Корп.: сообщение и язык EN", c["Сообщение клиента"] == "Нужна CRM для склада" and c["Язык"] == "en")
k = [l for l in corp if l["Имя"] == "ТЕСТ Қаз"][0]
check("Корп.: язык KZ и услуга", k["Язык"] == "kk" and k["Интересующая услуга"] == "Разработка сайта")
check("Корп.: нет автоматического срока 3 дня", all(not l["Срок разбора"] for l in corp))
check("Корп.: компания пустая", all(not l["Компания"] for l in corp))

# ---------- 3. Уведомления ----------
mail = gas("/__mail")
check("Email: письмо на каждую заявку (4 заявки)", len(mail) == 4, len(mail))
check("Email: лендинг -> личная + корпоративная копия", "kaelggbet@gmail.com" in mail[0]["to"] and "tmk.techno.horizon@gmail.com" in mail[0]["to"])
corp_mail = [m for m in mail if "корпоративный" in m["subject"]]
check("Email: корпоративные -> только личная почта, есть источник, услуга, CRM", corp_mail and all(m["to"] == "kaelggbet@gmail.com" for m in corp_mail)
      and "Разработка сайта" in corp_mail[0]["body"] and "ai.tmk-technohorizon.kz/crm#lead-" in corp_mail[0]["body"])
req("POST", GAS + "/__mailfail?on=1", {})
st, d = req("POST", BASE + "/api/intake", dict(contact, name="ТЕСТ Сбой почты", phone="+77019998877"), CORP)
check("Сбой почты: заявка всё равно сохранена", st == 200 and d.get("ok"), d)
fail_id = d.get("id")
req("POST", GAS + "/__mailfail?on=0", {})
req("POST", GAS + "/__age?min=2", {})
req("POST", GAS + "/__run?fn=retryNotifications", {})
jobs = gas("/__state")["sheets"]["CRM_Уведомления"]
ej = [j for j in jobs[1:] if str(j[1]) == str(fail_id) and j[2] == "email"][0]
n_leads_before = len(gas("/__state")["sheets"]["CRM_Заявки"])
check("Повтор: письмо ушло со 2-й попытки", ej[3] == "sent" and str(ej[4]) == "2", ej)
check("Повтор: новая заявка не создана (5 заявок)", n_leads_before == 6, n_leads_before)

# ---------- 4. Доступ ----------
st, d = req("GET", BASE + "/api/crm?a=leads")
check("Без входа список закрыт (401)", st == 401)
st, b, _ = req("GET", BASE + "/api/crm?a=file&id=x", raw=True)
check("Без входа файлы закрыты (401)", st == 401)
op, st, d = crm_session("wrong-pass", ip="9.9.9.9")
check("Неверный пароль - 401", st == 401 and d.get("error") == "bad_credentials")
for _ in range(4):
    crm_session("wrong-pass", ip="9.9.9.9")
op, st, d = crm_session(ip="9.9.9.9")
check("После 5 неудачных попыток вход заблокирован даже с верным паролем", st == 429 and d.get("error") == "locked", (st, d))
op, st, d = crm_session(ip="10.0.0.1")
check("Вход с верным паролем", st == 200 and d.get("ok"), d)
st, d = req("POST", BASE + "/api/crm?a=update", {"id": 1, "patch": {"status": "В работе"}}, {}, op)
check("Без заголовка X-CRM-Request изменение запрещено", st == 403)
st, d = req("POST", BASE + "/api/crm?a=update", {"id": 1, "patch": {"status": "В работе"}}, dict(H, Origin="https://evil.example"), op)
check("Чужой Origin - запрещено", st == 403)

# ---------- 5. Работа с заявкой ----------
st, d = req("GET", BASE + "/api/crm?a=leads", opener=op)
check("Список: все 5 заявок, сначала новые", st == 200 and len(d["leads"]) == 5 and d["leads"][0]["id"] == 5, (st, len(d.get("leads", []))))
st, d = req("GET", BASE + "/api/crm?a=lead&id=1", opener=op)
v = d["lead"]["version"]
st, d = req("POST", BASE + "/api/crm?a=update", {"id": 1, "version": v, "patch": {"status": "Готовится разбор", "notes": "Позвонили",
            "next_action": "Отправить разбор", "next_action_date": "2026-11-01", "razbor_search": "Нет в топ-10"}}, H, op)
check("Изменение статуса, заметок и следующего действия", st == 200 and d.get("changed") == 5, d)
st, d = req("POST", BASE + "/api/crm?a=update", {"id": 1, "version": v, "patch": {"status": "Отказ"}}, H, op)
check("Конфликт версий (две вкладки) - 409", st == 409)
st, d = req("GET", BASE + "/api/crm?a=lead&id=1", opener=op)
texts = [h["text"] for h in d["history"]]
check("История: создание, статус, заметки, действие", any("Заявка создана" in t for t in texts) and any("Статус: Новая → Готовится разбор" in t for t in texts)
      and any("Заметки" in t for t in texts) and any("Следующее действие" in t for t in texts), texts)
st, d = req("POST", BASE + "/api/crm?a=update", {"id": 1, "version": d["lead"]["version"], "patch": {"status": "Ракета"}}, H, op)
check("Неизвестный статус отклоняется", st == 400)
st, d = req("GET", BASE + "/api/crm?a=lead&id=1", opener=op)
st, d = req("POST", BASE + "/api/crm?a=update", {"id": 1, "version": d["lead"]["version"], "patch": {"next_action_date": "01.11.2026"}}, H, op)
check("Неверный формат даты отклоняется", st == 400 and d.get("error") == "bad_date", d)
st, d = req("POST", BASE + "/api/crm?a=update", {"id": 1, "patch": {"status": "Отказ"}}, H, op)
check("Изменение без версии карточки отклоняется", st == 400)
import base64
import os as _os
pdf = b"%PDF-1.4 " + _os.urandom(200 * 1024)  # 200 КБ: файл хранится в таблице частями
st, d = req("POST", BASE + "/api/crm?a=upload", {"lead_id": 1, "kind": "kp", "name": "КП Рост.pdf", "mime": "application/pdf",
            "b64": base64.b64encode(pdf).decode(), "comment": "версия 1"}, H, op)
check("Файл КП загружен", st == 200 and d.get("ok"), d)
fid = d.get("file", {}).get("file_id")
st, body, hdrs = req("GET", BASE + "/api/crm?a=file&id=" + str(fid), opener=op, raw=True)
check("Файл скачивается после входа, как вложение", st == 200 and body == pdf and "attachment" in hdrs.get("Content-Disposition", ""))
st, d = req("POST", BASE + "/api/crm?a=upload", {"lead_id": 1, "kind": "kp", "name": "big.pdf", "mime": "application/pdf",
            "b64": base64.b64encode(b"0" * (3 * 1024 * 1024 + 10)).decode()}, H, op)
check("Файл больше 3 МБ отклоняется", st == 413, st)
st, d = req("POST", BASE + "/api/crm?a=create", {"lead": {"name": "ТЕСТ WhatsApp", "phone": "+7 701 111 22 33", "manual_channel": "WhatsApp",
            "service": "Бесплатный разбор SEO + GEO", "message": "Написал в WA"}}, H, op)
check("Ручная заявка из WhatsApp создана", st == 200 and d.get("ok"), d)
st, d = req("POST", BASE + "/api/crm?a=create", {"lead": {"name": "ТЕСТ Звонок", "phone": "+7 701 111 22 33", "manual_channel": "Звонок",
            "service": "Разработка сайта"}}, H, op)
check("Повторный клиент: отдельная заявка + предупреждение о телефоне", st == 200 and d.get("same_phone"), d)
st, d = req("GET", BASE + "/api/crm?a=lead&id=" + str(d["id"]), opener=op)
check("Ручная (корп. услуга): без срока разбора, источник «Вручную»", d["lead"]["source_label"] == "Вручную" and not d["lead"]["razbor_due"]
      and d["lead"]["manual_channel"] == "Звонок" and len(d["same_phone"]) >= 1)
st, d = req("GET", BASE + "/api/crm?a=leads", opener=op)
wa = [l for l in d["leads"] if l["name"] == "ТЕСТ WhatsApp"][0]
check("Ручная заявка на разбор: срок 3 рабочих дня", bool(wa["razbor_due"]))
st, d = req("POST", BASE + "/api/crm?a=create", {"lead": {"name": "", "company": "", "phone": "123"}}, H, op)
check("Ручная заявка без имени и телефона отклоняется", st == 400)

# ---------- 6. Настройки ----------
st, d = req("GET", BASE + "/api/crm?a=settings", opener=op)
check("Настройки: личная почта видна только в закрытых настройках", st == 200 and d["settings"]["NOTIFY_EMAILS"] == "kaelggbet@gmail.com")
st, d = req("POST", BASE + "/api/crm?a=settings", {"settings": {"WA_PROVIDER": "meta", "WA_META_PHONE_ID": "123", "WA_META_TOKEN": "tok-test",
            "WA_META_TEMPLATE": "new_lead"}}, H, op)
check("Настройки WhatsApp сохранены, токен не возвращается", st == 200 and d["settings"].get("WA_META_TOKEN_SET") is True and "WA_META_TOKEN" not in d["settings"], d)
st, d = req("POST", BASE + "/api/crm?a=notify_test", {"channel": "whatsapp"}, H, op)
fetched = gas("/__fetch")
check("Проверка WhatsApp: запрос в Meta Cloud API с шаблоном, токен не уходит в браузер", st == 200 and d["result"]["status"] == "sent"
      and fetched and "/__wa/meta/v21.0/123/messages" in fetched[-1]["url"] and fetched[-1]["auth"] == "Bearer tok-test"
      and json.loads(fetched[-1]["body"])["template"]["name"] == "new_lead" and "tok-test" not in json.dumps(d), (d, fetched[-1:] if fetched else None))
st, d = req("POST", BASE + "/api/intake", dict(proc, name="ТЕСТ С WhatsApp", phone="+77010001122"), CORP)
st2, d2 = req("GET", BASE + "/api/crm?a=lead&id=" + str(d["id"]), opener=op)
check("Новая заявка уходит и в WhatsApp", d2["lead"]["notify_wa"].startswith("отправлено"), d2["lead"]["notify_wa"])
n_wa = len([f for f in gas("/__fetch") if "/__wa/" in f["url"]])
req("POST", GAS + "/__fetchstatus?code=500", {})
st, d = req("POST", BASE + "/api/intake", dict(proc, name="ТЕСТ WA сбой", phone="+77010003344"), CORP)
wa_fail_id = d["id"]
st2, d2 = req("GET", BASE + "/api/crm?a=lead&id=" + str(wa_fail_id), opener=op)
check("Сбой WhatsApp: заявка сохранена, в карточке видна ошибка", st == 200 and d2["lead"]["notify_wa"].startswith("ошибка"), d2["lead"]["notify_wa"])
req("POST", GAS + "/__fetchstatus?code=200", {})
req("POST", GAS + "/__age?min=3", {})
st, d = req("GET", BASE + "/api/crm?a=leads", opener=op)
check("Список заявок не отдаёт браузеру настройки WhatsApp", "wa" not in d and "tok-test" not in json.dumps(d))
st2, d2 = req("GET", BASE + "/api/crm?a=lead&id=" + str(wa_fail_id), opener=op)
check("Повтор WhatsApp при открытии CRM: отправлено", d2["lead"]["notify_wa"].startswith("отправлено"), d2["lead"]["notify_wa"])
st, d = req("POST", BASE + "/api/crm?a=settings", {"settings": {"NOTIFY_EMAILS": "не почта"}}, H, op)
check("Неверная почта в настройках отклоняется", st == 400)
st, d = req("POST", BASE + "/api/crm?a=settings", {"settings": {"WA_PROVIDER": "none", "WA_META_TOKEN": None}}, H, op)

# ---------- 7. Удаление данных (старый путь) ----------
before = len(gas("/__state")["sheets"]["CRM_Заявки"])
st, d = req("POST", BASE + "/api/lead", {"request_type": "deletion", "name": "ТЕСТ Удаление", "phone": "+77012223344", "message": "удалите"})
state = gas("/__state")["sheets"]
check("Запрос на удаление данных - в старый лист, не в CRM", st == 200 and len(state["CRM_Заявки"]) == before and len(state.get("Заявки", [])) == 2)

# ---------- 8. Смена пароля ----------
op2, st, d = crm_session(ip="10.0.0.2")
st, d = req("POST", BASE + "/api/crm?a=password", {"current": "dev-password-123", "new": "short"}, H, op)
check("Короткий новый пароль отклоняется", st == 400 and d.get("error") == "weak_password")
st, d = req("POST", BASE + "/api/crm?a=password", {"current": "dev-password-123", "new": "new-dev-password-456"}, H, op)
check("Пароль сменён", st == 200 and d.get("ok"))
st, d = req("GET", BASE + "/api/crm?a=leads", opener=op)
check("После смены пароля текущая сессия работает", st == 200)
st, d = req("GET", BASE + "/api/crm?a=leads", opener=op2)
check("Старая сессия на другом устройстве закрыта", st == 401 and d.get("error") == "session_expired")
op3, st, d = crm_session(password="dev-password-123", ip="10.0.0.3")
check("Старый пароль больше не подходит", st == 401)
op3, st, d = crm_session(password="new-dev-password-456", ip="10.0.0.3")
check("Новый пароль подходит", st == 200)

# ---------- 9. Ограничение частоты с лендинга ----------
codes = []
for i in range(7):
    st, d = req("POST", BASE + "/api/lead", dict(landing, name="ТЕСТ Частота %d" % i), {"X-Real-Ip": "6.6.6.6"})
    codes.append(st)
check("Лендинг: больше 5 заявок за 10 минут с одного IP - 429", codes[:5] == [200] * 5 and codes[5] == 429, codes)
codes = []
for i in range(8):
    st, d = req("POST", BASE + "/api/lead", dict(landing, name="ТЕСТ Через сервер %d" % i, phone="+7701555%04d" % i), {"X-Real-Ip": "185.146.3.124"})
    codes.append(st)
check("Заявки через сервер компании (общий IP) не упираются в лимит", codes == [200] * 8, codes)

# ---------- 10. Очистка тестовых ----------
req("POST", GAS + "/__run?fn=purgeTestLeads", {})
check("Тестовые заявки удаляются функцией purgeTestLeads", len(gas("/__state")["sheets"]["CRM_Заявки"]) == 1)

print("\nИтого: %d OK, %d FAIL" % (len(PASSED), len(FAILED)))
sys.exit(1 if FAILED else 0)
