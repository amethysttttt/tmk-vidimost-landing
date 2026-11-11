# -*- coding: utf-8 -*-
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from crm_lib.auth import (
    SESSION_COOKIE, SESSION_TTL, client_ip, create_session_token, expected_login,
    is_locked, register_fail, register_success, session_login, verify_password,
)
from crm_lib.handlers import CrmHandler
from crm_lib.http_util import clean, clear_cookie, cookie_value, read_json, set_cookie


class handler(CrmHandler):
    def do_GET(self):
        if not self.require_crm():
            return
        login = session_login(cookie_value(self, SESSION_COOKIE))
        if not login:
            return self.send_json(401, {"ok": False, "error": "unauthorized"})
        return self.send_json(200, {"ok": True, "login": login})

    def do_POST(self):
        if not self.require_crm():
            return
        data, err = read_json(self, max_bytes=8192)
        if err:
            return self.send_json(400, {"ok": False, "error": err})
        ip = client_ip(self.headers)
        locked, retry = is_locked(ip)
        if locked:
            return self.send_json(429, {"ok": False, "error": "locked", "retry_after": retry})
        login = clean(data.get("login"), 80) or expected_login()
        password = str(data.get("password") or "")
        if login != expected_login() or not verify_password(password):
            register_fail(ip)
            return self.send_json(401, {"ok": False, "error": "bad_credentials"})
        register_success(ip)
        token = create_session_token(login)
        self.send_response(200)
        set_cookie(self, SESSION_COOKIE, token, max_age=SESSION_TTL)
        body = b'{"ok":true}'
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_DELETE(self):
        self.send_response(200)
        clear_cookie(self, SESSION_COOKIE)
        body = b'{"ok":true}'
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
