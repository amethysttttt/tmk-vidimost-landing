# -*- coding: utf-8 -*-
"""Threads-бот: ежедневная публикация (Vercel Cron, будни ~11:00 по Алматы).

GET /api/threads_cron  с заголовком  Authorization: Bearer <CRON_SECRET>  (Vercel Cron добавляет его сам).
1. Берёт из таблицы самый ранний одобренный неопубликованный пост с датой не позже сегодняшней (Алматы).
2. Если ключу Threads больше 30 дней - продлевает его (он живёт 60 дней).
3. Проверяет, что такой текст ещё не выходил (защита от повтора), публикует, пишет ссылку в таблицу.
Ошибка - статус «Ошибка» в таблице и письмо; на следующий рабочий день бот попробует снова.
"""
import hmac
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _threads as th  # noqa: E402

CRON_SECRET = os.environ.get("CRON_SECRET", "")
ALMATY = timezone(timedelta(hours=5))
REFRESH_AFTER_DAYS = 30


def parse_iso(s):
    try:
        return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def report(row, ok, **kw):
    for attempt in range(3):
        try:
            return th.gas("threads.done", row=row, ok=ok, **kw)
        except th.ThreadsError as exc:
            print("THREADS_REPORT_RETRY", attempt, repr(exc))
    print("THREADS_REPORT_FAILED", row, ok, json.dumps(kw, ensure_ascii=False)[:300])


def run():
    today = datetime.now(ALMATY).strftime("%Y-%m-%d")
    due = th.gas("threads.due", today=today)
    tok = due.get("token") or {}
    post = due.get("post")
    result = {"today": today, "post_row": post and post.get("row"), "published": False}
    token, user_id = tok.get("token"), tok.get("user_id")

    if token:
        saved = parse_iso(tok.get("saved_at"))
        if saved and datetime.now(timezone.utc) - saved > timedelta(days=REFRESH_AFTER_DAYS):
            try:
                fresh = th.refresh_token(token)
                token = fresh["access_token"]
                th.gas("threads.token.set", token=token, user_id=user_id, username=tok.get("username", ""),
                       expires_in=fresh.get("expires_in"))
                result["token_refreshed"] = True
            except th.ThreadsError as exc:
                result["token_refresh_error"] = str(exc)

    if not post:
        result["note"] = "нет одобренных постов на сегодня"
        return result
    if not token or not user_id:
        report(post["row"], False, error="Аккаунт Threads не подключён: нужно пройти вход заново")
        result["error"] = "not_connected"
        return result

    text = post["text"].strip()
    if th.threads_length(text) > th.MAX_CHARS:
        report(post["row"], False, error="Текст длиннее %d знаков по правилам Threads (%d). Сократите пост."
               % (th.MAX_CHARS, th.threads_length(text)))
        result["error"] = "too_long"
        return result
    try:
        for item in th.recent_texts(user_id, token):
            if (item.get("text") or "").strip() == text:
                report(post["row"], True, permalink=item.get("permalink", ""), media_id=item.get("id", ""))
                result.update(published=True, duplicate_skipped=True, permalink=item.get("permalink"))
                return result
        media_id, link = th.publish_text(user_id, token, text)
        report(post["row"], True, permalink=link, media_id=media_id)
        result.update(published=True, permalink=link)
    except th.ThreadsError as exc:
        report(post["row"], False, error=str(exc))
        result["error"] = str(exc)
    return result


class handler(BaseHTTPRequestHandler):
    def _json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        auth = self.headers.get("Authorization", "")
        if not CRON_SECRET or not hmac.compare_digest(auth.encode(), ("Bearer " + CRON_SECRET).encode()):
            return self._json(401, {"ok": False, "error": "unauthorized"})
        try:
            res = run()
        except th.ThreadsError as exc:
            print("THREADS_CRON_FAILED", repr(exc))
            return self._json(502, {"ok": False, "error": str(exc)})
        print("THREADS_CRON", json.dumps(res, ensure_ascii=False))
        return self._json(200, {"ok": True, **res})

    def do_POST(self):
        """Служебные команды (тот же ключ CRON_SECRET): {"op": "setup" | "import" | "status", "posts": [...]}"""
        auth = self.headers.get("Authorization", "")
        if not CRON_SECRET or not hmac.compare_digest(auth.encode(), ("Bearer " + CRON_SECRET).encode()):
            return self._json(401, {"ok": False, "error": "unauthorized"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(length).decode("utf-8")) if 0 < length <= 200_000 else {}
        except ValueError:
            data = {}
        op = data.get("op")
        try:
            if op == "setup":
                return self._json(200, th.gas("threads.setup"))
            if op == "import":
                return self._json(200, th.gas("threads.import", posts=data.get("posts") or []))
            if op == "status":
                return self._json(200, th.gas("threads.status"))
        except th.ThreadsError as exc:
            return self._json(502, {"ok": False, "error": str(exc)})
        return self._json(400, {"ok": False, "error": "unknown_op"})

    def log_message(self, format, *args):
        return
