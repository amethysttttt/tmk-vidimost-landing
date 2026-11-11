# -*- coding: utf-8 -*-
from http.server import BaseHTTPRequestHandler

from crm_lib.auth import SESSION_COOKIE, auth_ready, session_login
from crm_lib.db import crm_configured
from crm_lib.http_util import cookie_value, send_json


class CrmHandler(BaseHTTPRequestHandler):
    def send_json(self, status: int, obj: dict):
        send_json(self, status, obj)

    def require_crm(self) -> bool:
        if not crm_configured() or not auth_ready():
            self.send_json(503, {"ok": False, "error": "crm_unavailable", "detail": "DATABASE_URL и CRM_PASSWORD обязательны"})
            return False
        return True

    def require_user(self):
        if not self.require_crm():
            return None
        login = session_login(cookie_value(self, SESSION_COOKIE))
        if not login:
            self.send_json(401, {"ok": False, "error": "unauthorized"})
            return None
        return login

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-CRM-Secret")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, format, *args):
        return
