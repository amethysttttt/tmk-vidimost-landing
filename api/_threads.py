# -*- coding: utf-8 -*-
"""Клиент официального Threads API (Meta) и общие функции бота (модуль, не отдельная функция Vercel).

Документация: developers.facebook.com/documentation/threads - посты (контейнер, затем публикация),
ключи доступа (короткий, затем долгий на 60 дней, продление), лимит 250 постов за 24 часа, до 500 знаков.
"""
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get("THREADS_API_BASE", "https://graph.threads.com")
AUTH = os.environ.get("THREADS_AUTH_BASE", "https://threads.com")
APP_ID = os.environ.get("THREADS_APP_ID", "")
APP_SECRET = os.environ.get("THREADS_APP_SECRET", "")
REDIRECT_URI = os.environ.get("THREADS_REDIRECT_URI", "https://tmk-vidimost.vercel.app/api/threads_auth")
WEBHOOK_URL = os.environ.get("LEADS_WEBHOOK_URL", "")
WEBHOOK_SECRET = os.environ.get("LEADS_WEBHOOK_SECRET", "")
SCOPES = "threads_basic,threads_content_publish"
MAX_CHARS = 500
TIMEOUT = 20


class ThreadsError(Exception):
    pass


def _request(method, url, params=None):
    data = None
    if method == "GET" and params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    elif params:
        data = urllib.parse.urlencode(params).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/x-www-form-urlencoded"} if data else {})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        body = exc.read(600).decode("utf-8", "replace")
        try:
            err = json.loads(body).get("error", {})
            msg = err.get("error_user_msg") or err.get("message") or body
        except ValueError:
            msg = body
        raise ThreadsError("Threads API %s: %s" % (exc.code, msg[:300]))
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise ThreadsError("Threads API недоступен: %r" % (exc,))


def gas(action, **payload):
    """Вызов Apps Script (таблица постов и хранение ключа)."""
    if not WEBHOOK_URL:
        raise ThreadsError("LEADS_WEBHOOK_URL is not set")
    payload.update({"action": action, "secret": WEBHOOK_SECRET})
    req = urllib.request.Request(WEBHOOK_URL, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                                 headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            result = json.loads(resp.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise ThreadsError("Таблица недоступна: %r" % (exc,))
    if not result.get("ok"):
        raise ThreadsError("Таблица: %s" % str(result.get("error"))[:200])
    return result


# ---------- длина текста по правилам Threads ----------
def threads_length(text):
    """Знаки по правилам Threads: эмодзи считаются по длине в байтах UTF-8, остальные символы - по одному."""
    n = 0
    for ch in text:
        cp = ord(ch)
        is_emoji = cp >= 0x1F000 or 0x2600 <= cp <= 0x27BF or 0xFE00 <= cp <= 0xFE0F or cp == 0x200D
        n += len(ch.encode("utf-8")) if is_emoji else 1
    return n


# ---------- вход (OAuth) ----------
def make_state():
    return make_state_for(str(int(time.time())))


def check_state(state, max_age=1800):
    try:
        ts, sig = state.split(".", 1)
        good = make_state_for(ts).split(".", 1)[1]
        return hmac.compare_digest(sig, good) and 0 <= time.time() - int(ts) <= max_age
    except (ValueError, AttributeError):
        return False


def make_state_for(ts):
    sig = hmac.new(APP_SECRET.encode(), ("threads-oauth:" + ts).encode(), hashlib.sha256).digest()
    return ts + "." + base64.urlsafe_b64encode(sig[:18]).decode().rstrip("=")


def authorize_url():
    return AUTH + "/oauth/authorize?" + urllib.parse.urlencode({
        "client_id": APP_ID, "redirect_uri": REDIRECT_URI, "scope": SCOPES, "response_type": "code",
        "state": make_state()})


def exchange_code(code):
    """Код из окна входа -> долгий ключ (60 дней) + id и имя аккаунта."""
    short = _request("POST", API + "/oauth/access_token", {
        "client_id": APP_ID, "client_secret": APP_SECRET, "code": code.split("#")[0],
        "grant_type": "authorization_code", "redirect_uri": REDIRECT_URI})
    if not short.get("access_token"):
        raise ThreadsError("не получен короткий ключ")
    long = _request("GET", API + "/access_token", {
        "grant_type": "th_exchange_token", "client_secret": APP_SECRET, "access_token": short["access_token"]})
    token = long.get("access_token")
    if not token:
        raise ThreadsError("не получен долгий ключ")
    me = _request("GET", API + "/v1.0/me", {"fields": "id,username", "access_token": token})
    return {"token": token, "expires_in": long.get("expires_in"), "user_id": me.get("id") or short.get("user_id"),
            "username": me.get("username", "")}


def refresh_token(token):
    res = _request("GET", API + "/refresh_access_token", {"grant_type": "th_refresh_token", "access_token": token})
    if not res.get("access_token"):
        raise ThreadsError("ключ не продлён")
    return res


# ---------- публикация ----------
def recent_texts(user_id, token, limit=10):
    res = _request("GET", API + "/v1.0/%s/threads" % user_id,
                   {"fields": "id,text,permalink,timestamp", "limit": limit, "access_token": token})
    return res.get("data", [])


def publish_text(user_id, token, text, wait_limit=40):
    """Контейнер -> дождаться FINISHED -> опубликовать -> ссылка. Возвращает (media_id, permalink)."""
    created = _request("POST", API + "/v1.0/%s/threads" % user_id,
                       {"media_type": "TEXT", "text": text, "access_token": token})
    container = created.get("id")
    if not container:
        raise ThreadsError("контейнер не создан")
    waited = 0
    while True:
        st = _request("GET", API + "/v1.0/%s" % container, {"fields": "status,error_message", "access_token": token})
        status = st.get("status")
        if status == "FINISHED":
            break
        if status in ("ERROR", "EXPIRED"):
            raise ThreadsError("контейнер: %s %s" % (status, st.get("error_message", "")))
        if waited >= wait_limit:
            raise ThreadsError("контейнер не готов за %d с (статус %s)" % (wait_limit, status))
        time.sleep(3)
        waited += 3
    pub = _request("POST", API + "/v1.0/%s/threads_publish" % user_id, {"creation_id": container, "access_token": token})
    media_id = pub.get("id")
    if not media_id:
        raise ThreadsError("пост не опубликован")
    link = ""
    try:
        link = _request("GET", API + "/v1.0/%s" % media_id, {"fields": "permalink", "access_token": token}).get("permalink", "")
    except ThreadsError:
        pass
    return media_id, link
