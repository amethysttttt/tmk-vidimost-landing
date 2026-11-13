# -*- coding: utf-8 -*-
"""Приём заявок с корпоративного сайта tmk-technohorizon.kz в CRM (Vercel Python Function).

POST /api/intake  - вызывает ТОЛЬКО сервер корпоративного сайта (из своего /api/contact),
заголовок  Authorization: Bearer <CORP_INTAKE_KEY>.  Браузер сюда не обращается.

Тело (JSON) - то же, что форма отправляет в /api/contact, плюс служебные поля сервера:
  name, phone, service, message, source ("process" = «Обсудить задачу», иначе «Готовы обсудить проект?»),
  company (скрытое антиспам-поле - не компания клиента), page_url, referrer, locale, client_ip, user_agent
Ответ: {"ok": true, "id": 12, "duplicate": false}
"""
import hashlib
import hmac
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _wa  # noqa: E402  отправка WhatsApp (общий модуль)

WEBHOOK_URL = os.environ.get("LEADS_WEBHOOK_URL", "")
WEBHOOK_SECRET = os.environ.get("LEADS_WEBHOOK_SECRET", "")
INTAKE_KEY = os.environ.get("CORP_INTAKE_KEY", "")
MAX_BODY = 20 * 1024

SERVICES_RU = ["Аудит сайта / системы", "Разработка сайта", "Автоматизация процессов", "Система под бизнес",
               "Мобильное приложение", "AI-решение", "Не знаю — нужна консультация"]
SERVICES_EN = ["Website / system audit", "Website development", "Process automation", "Custom business system",
               "Mobile app", "AI solution", "I need a consultation"]
SERVICES_KK = ["Сайт / жүйе аудиті", "Сайт әзірлеу", "Процестерді автоматтандыру", "Бизнеске арналған жүйе",
               "Мобильді қосымша", "AI-шешім", "Кеңес керек"]
# В CRM услуги показываем по-русски и с коротким тире
SERVICE_CRM = ["Аудит сайта / системы", "Разработка сайта", "Автоматизация процессов", "Система под бизнес",
               "Мобильное приложение", "AI-решение", "Не знаю - нужна консультация"]
FORMS = {"process": ("corp_process", "Обсудить задачу"), "contact": ("corp_contact", "Готовы обсудить проект?")}
UTM = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")


def clean(value, limit):
    value = "" if value is None else str(value)
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value).strip()[:limit]


def map_service(raw):
    raw = clean(raw, 120)
    for table in (SERVICES_RU, SERVICES_EN, SERVICES_KK):
        if raw in table:
            return SERVICE_CRM[table.index(raw)]
    return ""


def detect_locale(page_url, given):
    if given in ("ru", "en", "kk"):
        return given
    path = urllib.parse.urlsplit(page_url).path
    m = re.match(r"^/(en|kk|kz)(/|$)", path)
    if m:
        return "kk" if m.group(1) in ("kk", "kz") else "en"
    return "ru"


def build_lead(data):
    errors = []
    name = clean(data.get("name"), 80)
    digits = re.sub(r"\D", "", str(data.get("phone") or ""))
    if len(name) < 2:
        errors.append("name")
    if not 10 <= len(digits) <= 15:
        errors.append("phone")
    form_key = "process" if data.get("source") == "process" else "contact"
    service = map_service(data.get("service"))
    if form_key == "process" and not service:
        errors.append("service")
    page_url = clean(data.get("page_url"), 500)
    query = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(page_url).query))
    form_id, form_label = FORMS[form_key]
    lead = {
        "source": "corporate", "form_id": form_id, "form_label": form_label, "service": service,
        "name": name, "phone": clean(data.get("phone"), 30), "message": clean(data.get("message"), 2000),
        "page_url": page_url, "referrer": clean(data.get("referrer"), 300),
        "locale": detect_locale(page_url, clean(data.get("locale"), 5)),
    }
    for k in UTM:
        lead[k] = clean(data.get(k) or query.get(k), 200)
    key_src = "|".join(["corporate", form_key, digits, name.lower(), service, lead["message"]])
    lead["dedupe_key"] = hashlib.sha256(key_src.encode("utf-8")).hexdigest()
    return lead, errors


def send(lead, client_ip):
    if not WEBHOOK_URL:
        raise RuntimeError("LEADS_WEBHOOK_URL is not set")
    payload = {"secret": WEBHOOK_SECRET, "action": "lead.create", "lead": lead,
               "client_ip": client_ip, "rate_limit": False}
    req = urllib.request.Request(WEBHOOK_URL, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                                 headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
    with urllib.request.urlopen(req, timeout=25) as resp:
        result = json.loads(resp.read().decode("utf-8", "replace"))
    if not result.get("ok"):
        raise RuntimeError("crm error: " + str(result.get("error"))[:100])
    return result


def wa_report(job_id, status, error):
    """Результат отправки WhatsApp - обратно в CRM (wa.done)."""
    payload = {"secret": WEBHOOK_SECRET, "action": "wa.done", "job_id": job_id, "status": status, "error": error}
    req = urllib.request.Request(WEBHOOK_URL, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                                 headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
    with urllib.request.urlopen(req, timeout=15) as resp:
        resp.read(1000)


class handler(BaseHTTPRequestHandler):
    def _json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        auth = self.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else ""
        if not INTAKE_KEY:
            return self._json(503, {"ok": False, "error": "not_configured"})
        if not token or not hmac.compare_digest(token.encode(), INTAKE_KEY.encode()):
            return self._json(401, {"ok": False, "error": "unauthorized"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            return self._json(400, {"ok": False, "error": "validation"})
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(data, dict):
                raise ValueError
        except ValueError:
            return self._json(400, {"ok": False, "error": "validation"})
        # Скрытое поле-ловушка заполнено - это бот; заявку не создаём, но и не подсказываем ему
        if clean(data.get("company"), 200):
            return self._json(200, {"ok": True, "skipped": "spam"})
        lead, errors = build_lead(data)
        if errors:
            return self._json(400, {"ok": False, "error": "validation", "fields": errors})
        try:
            result = send(lead, clean(data.get("client_ip"), 64))
        except (urllib.error.URLError, RuntimeError, OSError, ValueError) as exc:
            safe = {k: lead[k] for k in ("form_label", "service", "name", "phone")}
            print("CORP_LEAD_NOT_DELIVERED", json.dumps(safe, ensure_ascii=False), repr(exc))
            return self._json(502, {"ok": False, "error": "delivery"})
        try:
            _wa.process(result.get("wa"), wa_report)
        except Exception as exc:
            print("WA_FAILED", repr(exc))
        return self._json(200, {"ok": True, "id": result.get("id"), "duplicate": bool(result.get("duplicate"))})

    def do_GET(self):
        self._json(405, {"ok": False, "error": "method_not_allowed"})

    def log_message(self, format, *args):
        return
