# -*- coding: utf-8 -*-
"""Отправка WhatsApp-уведомлений о заявках (общий модуль функций /api/*).

Очередь, текст сообщения и настройки хранит Apps Script (CRM); отправляет сервер сайта:
Apps Script отдаёт задания (wa.due), здесь они уходят провайдеру, результат возвращается (wa.done).
Провайдеры: Meta WhatsApp Cloud API (официальный) или CallMeBot (личные уведомления).
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

TIMEOUT = 8
# Адреса провайдеров (переопределяются только для локальной проверки)
META_BASE = os.environ.get("WA_META_BASE", "https://graph.facebook.com")
CALLMEBOT_BASE = os.environ.get("WA_CALLMEBOT_BASE", "https://api.callmebot.com")


def send(config, text, params):
    """Возвращает ("sent", "") или ("error", "описание")."""
    provider = (config or {}).get("provider")
    to = "".join(ch for ch in str(config.get("to", "")) if ch.isdigit())
    try:
        if provider == "meta":
            url = META_BASE + "/%s/%s/messages" % (
                config.get("meta_api_version") or "v21.0", urllib.parse.quote(str(config.get("meta_phone_id", ""))))
            if config.get("meta_template"):
                payload = {
                    "messaging_product": "whatsapp", "to": to, "type": "template",
                    "template": {
                        "name": config["meta_template"], "language": {"code": config.get("meta_lang") or "ru"},
                        "components": [{"type": "body", "parameters": [
                            {"type": "text", "text": " ".join(str(p).split())[:300]} for p in params]}],
                    },
                }
            else:
                payload = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": text[:4000]}}
            req = urllib.request.Request(url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), method="POST",
                                         headers={"Content-Type": "application/json",
                                                  "Authorization": "Bearer " + str(config.get("meta_token", ""))})
        elif provider == "callmebot":
            query = urllib.parse.urlencode({"phone": to, "text": text[:2000], "apikey": config.get("callmebot_key", "")})
            req = urllib.request.Request(CALLMEBOT_BASE + "/whatsapp.php?" + query, method="GET")
        else:
            return "error", "провайдер WhatsApp не подключён"
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            body = resp.read(2000).decode("utf-8", "replace")
            if provider == "callmebot" and ("APIKey is invalid" in body or "need to get the apikey" in body.lower()):
                return "error", body[:200]
            return "sent", ""
    except urllib.error.HTTPError as exc:
        return "error", "HTTP %s: %s" % (exc.code, exc.read(300).decode("utf-8", "replace"))
    except (urllib.error.URLError, OSError, ValueError) as exc:
        return "error", repr(exc)[:200]


def process(due, report):
    """due - ответ Apps Script с полем wa; report(job_id, status, error) - вызов wa.done."""
    if not due or not due.get("configured"):
        return 0
    sent = 0
    for job in due.get("jobs", [])[:10]:
        status, error = send(due.get("config", {}), job.get("text", ""), job.get("params", []))
        try:
            report(job.get("job_id"), status, error)
        except Exception as exc:  # отчёт не должен ломать ответ клиенту
            print("WA_REPORT_FAILED", job.get("job_id"), repr(exc))
        sent += status == "sent"
    return sent
