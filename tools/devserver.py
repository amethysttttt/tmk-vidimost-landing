# -*- coding: utf-8 -*-
"""Локальная проверка сайта и CRM: статика как на Vercel (cleanUrls) + функции /api/*.

Хранилище - эмулятор Apps Script (tools/gas-emulator.js), его нужно запустить заранее:
    node tools/gas-emulator.js 8791
    python3 tools/devserver.py            → http://127.0.0.1:8790 и http://127.0.0.1:8790/crm
Логин и пароль для локальной CRM: dev / dev-password-123 (только для этой проверки).
"""
import importlib.util
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("PORT", "8790"))
GAS_PORT = int(os.environ.get("GAS_PORT", "8791"))

os.environ.update({
    "LEADS_WEBHOOK_URL": "http://127.0.0.1:%d/exec" % GAS_PORT,
    "LEADS_WEBHOOK_SECRET": "dev-secret",
    "CRM_DEV": "1",
    "CRM_SESSION_SECRET": "dev-session-secret",
    "CRM_LOGIN": "dev",
    "CORP_INTAKE_KEY": "dev-intake-key",
    # WhatsApp-провайдеры подменены эмулятором: настоящие сообщения не уходят
    "WA_META_BASE": "http://127.0.0.1:%d/__wa/meta" % GAS_PORT,
    "WA_CALLMEBOT_BASE": "http://127.0.0.1:%d/__wa/callmebot" % GAS_PORT,
    # Threads API подменён эмулятором
    "THREADS_API_BASE": "http://127.0.0.1:%d/__th" % GAS_PORT,
    "THREADS_AUTH_BASE": "http://127.0.0.1:%d/__th" % GAS_PORT,
    "THREADS_APP_ID": "dev-app",
    "THREADS_APP_SECRET": "dev-app-secret",
    "THREADS_REDIRECT_URI": "http://127.0.0.1:%d/api/threads_auth" % PORT,
    "CRON_SECRET": "dev-cron",
})


def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, "api", name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


crm = load("crm")
it, salt, h = crm.hash_password("dev-password-123", iterations=1000)
os.environ["CRM_INITIAL_HASH"] = "pbkdf2_sha256$%d$%s$%s" % (it, salt, h)
crm.INITIAL_HASH = os.environ["CRM_INITIAL_HASH"]
API = {"crm": crm, "lead": load("lead"), "intake": load("intake"), "threads_cron": load("threads_cron"),
       "threads_auth": load("threads_auth")}


class Dev(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def translate_path(self, path):
        p = path.split("?", 1)[0].split("#", 1)[0]
        if p != "/" and not os.path.splitext(p)[1] and os.path.exists(os.path.join(ROOT, p.lstrip("/") + ".html")):
            path = p + ".html"
        return super().translate_path(path)

    def _api(self, method):
        name = self.path.split("?", 1)[0].strip("/").split("/")[1] if self.path.startswith("/api/") else ""
        mod = API.get(name)
        if not mod:
            return self.send_error(404)
        # Обрабатываем запрос классом функции Vercel, как на сервере
        self.__class__ = mod.handler
        return getattr(self, method)()

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self._api("do_GET")
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            return self._api("do_POST")
        self.send_error(404)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print("dev server on http://127.0.0.1:%d (CRM: /crm)" % PORT, flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Dev).serve_forever()
