# -*- coding: utf-8 -*-
"""Приём заявок с лендинга (Vercel Python Function).

Путь: POST /api/lead
1. Проверяет поля (имя, телефон +7XXXXXXXXXX, согласие) и ловушку для ботов.
2. Передаёт заявку в Google Apps Script: он пишет строку в таблицу «Заявки с лендинга»
   и отправляет письмо на tmk.techno.horizon@gmail.com.
3. Отвечает {"ok": true} - после этого страница переводит человека на /spasibo.
   Если форма отправлена без JavaScript - сразу перенаправляет на /spasibo.

Настройки (переменные окружения Vercel имеют приоритет над значениями ниже):
  LEADS_WEBHOOK_URL    - адрес веб-приложения Apps Script (.../exec)
  LEADS_WEBHOOK_SECRET - общий секрет с Apps Script, чтобы таблицу не заспамили напрямую
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler

WEBHOOK_URL = os.environ.get("LEADS_WEBHOOK_URL", "")
WEBHOOK_SECRET = os.environ.get("LEADS_WEBHOOK_SECRET", "")

MAX_BODY = 20 * 1024
ALMATY = timezone(timedelta(hours=5))  # единый часовой пояс Казахстана с 01.03.2024
FIELDS = {
    "name": 80, "phone": 20, "link": 300, "business_type": 80, "city": 60,
    "contact_method": 20, "package": 80, "utm_source": 200, "utm_medium": 200,
    "utm_campaign": 200, "utm_content": 200, "utm_term": 200, "page": 500, "referrer": 300,
    "message": 1000,
}
REQUEST_TYPES = ("lead", "deletion")
PHONE_RE = re.compile(r"^\+7\d{10}$")


def clean(value, limit):
    if not isinstance(value, str):
        value = "" if value is None else str(value)
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value).strip()
    # Защита таблицы от формул: значение не должно начинаться с = + - @
    if value[:1] in ("=", "+", "-", "@") and not PHONE_RE.match(value):
        value = "'" + value
    return value[:limit]


def normalize_phone(raw):
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    return "+7" + digits if len(digits) == 10 else ""


def validate(data):
    lead = {k: clean(data.get(k, ""), n) for k, n in FIELDS.items()}
    lead["phone"] = normalize_phone(str(data.get("phone", "")))
    lead["request_type"] = data.get("request_type") if data.get("request_type") in REQUEST_TYPES else "lead"
    lead["marketing"] = "yes" if str(data.get("marketing", "")).lower() in ("yes", "on", "true", "1") else "no"
    errors = []
    if len(lead["name"]) < 2:
        errors.append("name")
    if not PHONE_RE.match(lead["phone"]):
        errors.append("phone")
    # Для заявки нужно согласие на обработку данных и подтверждение 18+;
    # запрос на удаление данных выполняем по закону и без согласия
    if lead["request_type"] == "lead" and str(data.get("consent", "")).lower() not in ("yes", "on", "true", "1"):
        errors.append("consent")
    lead["created_at"] = datetime.now(ALMATY).strftime("%d.%m.%Y %H:%M")
    return lead, errors


def send_to_sheet(lead):
    if not WEBHOOK_URL:
        raise RuntimeError("LEADS_WEBHOOK_URL is not set")
    payload = dict(lead)
    payload["secret"] = WEBHOOK_SECRET
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    # Apps Script отвечает редиректом 302 на страницу с результатом - urllib проходит его сам
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = resp.read(4096).decode("utf-8", "replace")
    try:
        result = json.loads(body)
    except ValueError:
        raise RuntimeError("unexpected webhook response: " + body[:200])
    if not result.get("ok"):
        raise RuntimeError("webhook error: " + str(result.get("error", ""))[:200])


class handler(BaseHTTPRequestHandler):
    def _wants_json(self):
        accept = self.headers.get("Accept", "")
        ctype = self.headers.get("Content-Type", "")
        return "application/json" in accept or "application/json" in ctype

    def _json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _redirect(self, location):
        self.send_response(303)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _html_error(self):
        body = (
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
            "<title>Заявка не отправлена</title><body style=\"font-family:Arial,sans-serif;padding:32px;max-width:560px\">"
            "<h1>Не получилось отправить заявку</h1>"
            "<p>Проверьте имя и телефон и попробуйте ещё раз или напишите нам в "
            '<a href="https://wa.me/77479071622">WhatsApp</a>.</p><p><a href="/#zayavka">Вернуться к форме</a></p>'
        ).encode("utf-8")
        self.send_response(400)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _fail(self, status, code):
        if self._wants_json():
            self._json(status, {"ok": False, "error": code})
        else:
            self._html_error()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            return self._fail(400, "validation")
        raw = self.rfile.read(length).decode("utf-8", "replace")

        if "application/json" in self.headers.get("Content-Type", ""):
            try:
                data = json.loads(raw)
                if not isinstance(data, dict):
                    raise ValueError
            except ValueError:
                return self._fail(400, "validation")
        else:
            data = {k: v[0] for k, v in urllib.parse.parse_qs(raw, keep_blank_values=True).items()}

        # Ловушка для ботов: человек это поле не видит и не заполняет
        if str(data.get("company", "")).strip():
            return self._json(200, {"ok": True}) if self._wants_json() else self._redirect("/spasibo")

        lead, errors = validate(data)
        if errors:
            return self._fail(400, "validation")

        try:
            send_to_sheet(lead)
        except (urllib.error.URLError, RuntimeError, OSError, ValueError) as exc:
            # Заявка не должна потеряться: пишем её в журнал функции Vercel, чтобы восстановить вручную
            print("LEAD_NOT_DELIVERED", json.dumps(lead, ensure_ascii=False), repr(exc), file=sys.stderr)
            return self._fail(502, "delivery")

        if self._wants_json():
            return self._json(200, {"ok": True})
        return self._redirect("/udalenie-dannyh?sent=1" if lead["request_type"] == "deletion" else "/spasibo")

    def do_GET(self):
        self._json(405, {"ok": False, "error": "method_not_allowed"})

    def log_message(self, format, *args):  # без лишних строк в журнале
        return
