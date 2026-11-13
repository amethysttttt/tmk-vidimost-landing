# -*- coding: utf-8 -*-
"""API закрытой CRM заявок (Vercel Python Function): /api/crm?a=<действие>.

Вход по логину и паролю (одна учётная запись), сессия в cookie HttpOnly + подпись HMAC.
Данные хранятся в Google Таблице через Apps Script (apps-script/Code.gs), секрет - только на сервере.

Переменные окружения Vercel:
  LEADS_WEBHOOK_URL, LEADS_WEBHOOK_SECRET - адрес и секрет Apps Script (общие с /api/lead)
  CRM_SESSION_SECRET  - случайная строка для подписи сессий
  CRM_LOGIN           - логин
  CRM_INITIAL_HASH    - хеш первого пароля (pbkdf2_sha256$итерации$соль$хеш); после смены пароля
                        действующий хеш хранится в Apps Script, а этот больше не используется
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _wa  # noqa: E402  отправка WhatsApp (общий модуль)

WEBHOOK_URL = os.environ.get("LEADS_WEBHOOK_URL", "")
WEBHOOK_SECRET = os.environ.get("LEADS_WEBHOOK_SECRET", "")
SESSION_SECRET = os.environ.get("CRM_SESSION_SECRET", "")
CRM_LOGIN = os.environ.get("CRM_LOGIN", "")
INITIAL_HASH = os.environ.get("CRM_INITIAL_HASH", "")
DEV = os.environ.get("CRM_DEV") == "1"

COOKIE = "tmkcrm_dev" if DEV else "__Host-tmkcrm"
SESSION_TTL = 12 * 3600
PBKDF2_ITER = 600000
MAX_BODY = 4_400_000  # лимит запроса Vercel 4,5 МБ
MAX_FILE = 3 * 1024 * 1024
SAFE_INLINE = {"application/pdf", "image/png", "image/jpeg", "image/webp"}

EDITABLE = {
    "name", "company", "phone", "link", "business_type", "city", "contact_method", "service", "message",
    "status", "contact_date", "notes", "call_result", "needs", "razbor_search", "razbor_maps", "razbor_ai",
    "diag_notes", "kp_sent_date", "kp_package", "kp_amount", "kp_comment", "next_action", "next_action_date",
    "closed_date", "refusal_reason", "result_comment", "razbor_required",
}
MANUAL_FIELDS = EDITABLE | {"manual_channel"}
SETTINGS_KEYS = {
    "NOTIFY_EMAILS", "LANDING_COPY_EMAILS", "WA_PROVIDER", "WA_TO", "WA_META_PHONE_ID", "WA_META_TEMPLATE",
    "WA_META_LANG", "WA_META_API_VERSION", "HOLIDAYS", "WA_META_TOKEN", "WA_CALLMEBOT_KEY",
}


class GasError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def gas(action, **payload):
    if not WEBHOOK_URL:
        raise GasError("not_configured")
    payload["action"] = action
    payload["secret"] = WEBHOOK_SECRET
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            body = resp.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError) as exc:
        print("CRM_GAS_UNAVAILABLE", action, repr(exc))
        raise GasError("storage_unavailable")
    try:
        result = json.loads(body)
    except ValueError:
        print("CRM_GAS_BAD_RESPONSE", action, body[:200])
        raise GasError("storage_unavailable")
    if not result.get("ok"):
        raise GasError(str(result.get("error") or "storage_error")[:100])
    return result


# ---------- Пароли и сессии ----------
def hash_password(password, salt=None, iterations=PBKDF2_ITER):
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return iterations, base64.b64encode(salt).decode(), base64.b64encode(dk).decode()


def verify_password(password, iterations, salt_b64, hash_b64):
    try:
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
    except (ValueError, TypeError):
        return False
    if not iterations or not salt or not expected:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
    return hmac.compare_digest(dk, expected)


def b64u(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def b64u_dec(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_token(version):
    now = int(time.time())
    body = b64u(json.dumps({"v": str(version), "iat": now, "exp": now + SESSION_TTL}).encode())
    sig = b64u(hmac.new(SESSION_SECRET.encode(), body.encode(), hashlib.sha256).digest())
    return body + "." + sig


def read_token(token):
    if not SESSION_SECRET or not token or "." not in token:
        return None
    body, sig = token.rsplit(".", 1)
    good = b64u(hmac.new(SESSION_SECRET.encode(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, good):
        return None
    try:
        data = json.loads(b64u_dec(body))
    except ValueError:
        return None
    if int(data.get("exp", 0)) < time.time():
        return None
    return data


def parse_initial_hash():
    parts = INITIAL_HASH.split("$")
    if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
        return None
    return {"iter": int(parts[1]), "salt": parts[2], "hash": parts[3]}


def wa_report(job_id, status, error):
    gas("wa.done", job_id=job_id, status=status, error=error)


def with_wa(result):
    """Отправить WhatsApp-задания из ответа Apps Script и убрать настройки провайдера из ответа браузеру."""
    due = result.pop("wa", None)
    try:
        _wa.process(due, wa_report)
    except Exception as exc:
        print("WA_FAILED", repr(exc))
    return result


class handler(BaseHTTPRequestHandler):
    # ---------- ответы ----------
    def _send(self, status, body, ctype, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or []):
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status, obj, extra=None):
        self._send(status, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8", extra)

    def _cookie(self, token, max_age):
        attrs = ["%s=%s" % (COOKIE, token), "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=%d" % max_age]
        if not DEV:
            attrs.append("Secure")
        return ("Set-Cookie", "; ".join(attrs))

    def _err(self, status, code, clear=False):
        extra = [self._cookie("", 0)] if clear else None
        self._json(status, {"ok": False, "error": code}, extra)

    # ---------- запрос ----------
    def _ip(self):
        ip = self.headers.get("X-Real-Ip") or (self.headers.get("X-Forwarded-For") or "").split(",")[0]
        return (ip or self.client_address[0] or "unknown").strip()[:64]

    def _session(self):
        raw = self.headers.get("Cookie") or ""
        for part in raw.split(";"):
            k, _, v = part.strip().partition("=")
            if k == COOKIE:
                return read_token(v)
        return None

    def _query(self):
        return dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(self.path).query))

    def _body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            return None
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError:
            return None
        return data if isinstance(data, dict) else None

    def _same_origin(self):
        # Защита от подделки запросов: свой заголовок + совпадение Origin с адресом сайта
        if self.headers.get("X-CRM-Request") != "1":
            return False
        origin = self.headers.get("Origin")
        if origin:
            host = self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or ""
            return urllib.parse.urlsplit(origin).netloc == host
        return True

    # ---------- маршруты ----------
    def do_GET(self):
        q = self._query()
        action = q.get("a", "")
        if action == "session":
            s = self._session()
            return self._json(200, {"ok": True, "auth": bool(s), "login": CRM_LOGIN if s else ""})
        s = self._session()
        if not s:
            return self._err(401, "auth_required")
        try:
            if action == "leads":
                return self._json(200, with_wa(gas("leads.list", session_version=s["v"])))
            if action == "lead":
                return self._json(200, gas("lead.get", id=int(q.get("id", "0")), session_version=s["v"]))
            if action == "settings":
                return self._json(200, gas("settings.get", session_version=s["v"]))
            if action == "file":
                res = gas("file.get", file_id=q.get("id", "")[:64], session_version=s["v"])
                data = base64.b64decode(res.get("b64", ""))
                mime = res.get("mime") if res.get("mime") in SAFE_INLINE else "application/octet-stream"
                name = res.get("name") or "file"
                ascii_name = re.sub(r"[^A-Za-z0-9._-]", "_", name) or "file"
                disp = "attachment; filename=\"%s\"; filename*=UTF-8''%s" % (ascii_name, urllib.parse.quote(name))
                return self._send(200, data, mime, [("Content-Disposition", disp), ("X-Content-Type-Options", "nosniff"),
                                                     ("Content-Security-Policy", "sandbox")])
        except (ValueError, TypeError):
            return self._err(400, "validation")
        except GasError as e:
            return self._gas_error(e)
        return self._err(404, "unknown_action")

    def do_POST(self):
        q = self._query()
        action = q.get("a", "")
        if not self._same_origin():
            return self._err(403, "forbidden")
        data = self._body()
        if data is None:
            return self._err(400, "validation")
        try:
            if action == "login":
                return self._login(data)
            if action == "logout":
                return self._json(200, {"ok": True}, [self._cookie("", 0)])
            s = self._session()
            if not s:
                return self._err(401, "auth_required")
            v = s["v"]
            if action == "password":
                return self._password(data)
            if action == "update":
                if data.get("version") in (None, ""):
                    return self._err(400, "validation")
                patch = {k: data["patch"][k] for k in data.get("patch", {}) if k in EDITABLE}
                return self._json(200, gas("lead.update", id=int(data.get("id")), version=data.get("version"),
                                           patch=patch, session_version=v))
            if action == "create":
                # ответ ручного создания: WhatsApp о ручных заявках тоже уходит
                lead = {k: data["lead"][k] for k in data.get("lead", {}) if k in MANUAL_FIELDS}
                digits = re.sub(r"\D", "", str(lead.get("phone", "")))
                if not (str(lead.get("name", "")).strip() or str(lead.get("company", "")).strip()):
                    return self._err(400, "name_required")
                if len(digits) < 10 or len(digits) > 15:
                    return self._err(400, "phone_required")
                return self._json(200, with_wa(gas("lead.manual", lead=lead, session_version=v)))
            if action == "renotify":
                return self._json(200, with_wa(gas("lead.renotify", id=int(data.get("id")), session_version=v)))
            if action == "upload":
                b64 = str(data.get("b64", ""))
                if len(b64) * 3 // 4 > MAX_FILE:
                    return self._err(413, "file_too_large")
                return self._json(200, gas("file.upload", lead_id=int(data.get("lead_id")), kind=data.get("kind"),
                                           name=str(data.get("name", ""))[:150], mime=str(data.get("mime", ""))[:100],
                                           b64=b64, comment=str(data.get("comment", ""))[:500], session_version=v))
            if action == "settings":
                settings = {k: data["settings"][k] for k in data.get("settings", {}) if k in SETTINGS_KEYS}
                return self._json(200, gas("settings.set", settings=settings, session_version=v))
            if action == "notify_test":
                ch = "whatsapp" if data.get("channel") == "whatsapp" else "email"
                res = gas("notify.test", channel=ch, session_version=v)
                test = res.pop("wa_test", None)
                if test:
                    status, error = _wa.send(test.get("config", {}), test.get("text", ""), test.get("params", []))
                    res["result"] = {"status": status, "error": error}
                return self._json(200, {"ok": True, "result": res.get("result")})
        except (ValueError, TypeError, KeyError, AttributeError):
            return self._err(400, "validation")
        except GasError as e:
            return self._gas_error(e)
        return self._err(404, "unknown_action")

    def _gas_error(self, e):
        if e.code == "session_expired":
            return self._err(401, "session_expired", clear=True)
        if e.code in ("not_found",):
            return self._err(404, e.code)
        if e.code == "conflict":
            return self._err(409, e.code)
        if e.code in ("storage_unavailable", "not_configured"):
            return self._err(503, e.code)
        return self._err(400, e.code)

    def _login(self, data):
        login = str(data.get("login", ""))[:100]
        password = str(data.get("password", ""))[:200]
        ip = self._ip()
        if not SESSION_SECRET or not CRM_LOGIN:
            return self._err(503, "not_configured")
        st = gas("auth.get", ip=ip)
        if st.get("locked"):
            return self._err(429, "locked")
        if not st.get("hash"):
            init = parse_initial_hash()
            if not init:
                return self._err(503, "not_configured")
            st = gas("auth.init", ip=ip, login=CRM_LOGIN, **init)
        ok_login = hmac.compare_digest(login.strip().lower().encode(), (st.get("login") or CRM_LOGIN).lower().encode())
        ok_pass = verify_password(password, st.get("iter"), st.get("salt"), st.get("hash"))
        if not (ok_login and ok_pass):
            gas("auth.fail", ip=ip)
            time.sleep(0.5)
            return self._err(401, "bad_credentials")
        gas("auth.ok", ip=ip)
        return self._json(200, {"ok": True, "login": CRM_LOGIN}, [self._cookie(make_token(st.get("version")), SESSION_TTL)])

    def _password(self, data):
        current = str(data.get("current", ""))[:200]
        new = str(data.get("new", ""))[:200]
        if len(new) < 10:
            return self._err(400, "weak_password")
        ip = self._ip()
        st = gas("auth.get", ip=ip)
        if st.get("locked"):
            return self._err(429, "locked")
        if not verify_password(current, st.get("iter"), st.get("salt"), st.get("hash")):
            gas("auth.fail", ip=ip)
            return self._err(401, "bad_credentials")
        it, salt, h = hash_password(new)
        res = gas("auth.set", iter=it, salt=salt, hash=h)
        return self._json(200, {"ok": True}, [self._cookie(make_token(res.get("version")), SESSION_TTL)])

    def log_message(self, format, *args):
        return
