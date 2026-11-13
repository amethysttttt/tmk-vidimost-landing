# -*- coding: utf-8 -*-
"""Threads-бот: подключение аккаунта (OAuth Threads).

GET /api/threads_auth?start=1   - перенаправляет в окно входа Threads (вход делает владелец аккаунта)
GET /api/threads_auth?code=...  - Threads возвращает сюда: получаем долгий ключ (60 дней) и сохраняем его в Apps Script
"""
import html
import os
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _threads as th  # noqa: E402

PAGE = ('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
        '<meta name="robots" content="noindex"><title>%s</title>'
        '<body style="font-family:Arial,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.5">'
        '<h1 style="font-size:22px">%s</h1><p>%s</p></body>')


class handler(BaseHTTPRequestHandler):
    def _page(self, status, title, text):
        body = (PAGE % (html.escape(title), html.escape(title), html.escape(text))).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Robots-Tag", "noindex")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        q = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(self.path).query))
        if not th.APP_ID or not th.APP_SECRET:
            return self._page(503, "Бот не настроен", "На сервере не заданы THREADS_APP_ID и THREADS_APP_SECRET.")
        if q.get("start"):
            self.send_response(302)
            self.send_header("Location", th.authorize_url())
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if q.get("error"):
            return self._page(400, "Подключение отменено", q.get("error_description") or q.get("error"))
        if not q.get("code"):
            return self._page(400, "Нет кода", "Откройте ссылку подключения ещё раз.")
        if not th.check_state(q.get("state", "")):
            return self._page(400, "Ссылка устарела", "Начните подключение заново: ссылка действует 30 минут.")
        try:
            info = th.exchange_code(q["code"])
            th.gas("threads.token.set", token=info["token"], user_id=info["user_id"], username=info["username"],
                   expires_in=info.get("expires_in"))
        except th.ThreadsError as exc:
            print("THREADS_AUTH_FAILED", repr(exc))
            return self._page(502, "Не удалось подключить", str(exc))
        return self._page(200, "Готово: Threads подключён",
                          "Аккаунт @%s подключён к боту. Ключ действует 60 дней и продлевается автоматически. "
                          "Это окно можно закрыть." % info["username"])

    def log_message(self, format, *args):
        return
