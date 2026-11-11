# -*- coding: utf-8 -*-
"""Локальная проверка: статика + /api/lead + /api/crm/* + /crm."""
import importlib.util
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
PORT = int(os.environ.get("PORT", "8790"))

os.environ.setdefault("LEADS_WEBHOOK_URL", f"http://127.0.0.1:{PORT}/__mock_webhook")
os.environ.setdefault("LEADS_WEBHOOK_SECRET", "dev-secret")
os.environ.setdefault("CRM_INGEST_SECRET", "dev-crm-secret")
os.environ.setdefault("CRM_LOGIN", "admin")
os.environ.setdefault("CRM_PASSWORD", os.environ.get("CRM_PASSWORD") or "qwerty")
os.environ.setdefault("CRM_PUBLIC_URL", f"http://127.0.0.1:{PORT}")
os.environ.setdefault("NOTIFY_EMAIL", "kaelggbet@gmail.com")

sys.path.insert(0, str(ROOT))


def _load(name: str, rel: str):
    path = ROOT / rel
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


lead = _load("lead", "api/lead.py")
crm_session = _load("crm_session", "api/crm/session.py")
crm_leads = _load("crm_leads", "api/crm/leads.py")
crm_export = _load("crm_export", "api/crm/export.py")
crm_ingest = _load("crm_ingest", "api/crm/ingest.py")
crm_attach = _load("crm_attach", "api/crm/attach.py")
crm_password = _load("crm_password", "api/crm/password.py")

RECEIVED = []
STATE = {"fail": False}

ROUTES = {
    "/api/lead": lead.handler,
    "/api/crm/session": crm_session.handler,
    "/api/crm/leads": crm_leads.handler,
    "/api/crm/export": crm_export.handler,
    "/api/crm/ingest": crm_ingest.handler,
    "/api/crm/attach": crm_attach.handler,
    "/api/crm/password": crm_password.handler,
}


class Dev(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def translate_path(self, path):
        p = path.split("?", 1)[0].split("#", 1)[0]
        if p in ("/crm", "/crm/"):
            path = "/crm/index.html"
        elif p != "/" and not os.path.splitext(p)[1] and os.path.exists(ROOT / (p.lstrip("/") + ".html")):
            path = p + ".html"
        return super().translate_path(path)

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            body = (ROOT / "404.html").read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def _route(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        return ROUTES.get(path)

    def do_GET(self):
        if self.path.startswith("/__received"):
            b = json.dumps(RECEIVED, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
            return
        if self.path.startswith("/__fail"):
            STATE["fail"] = self.path.endswith("on")
            self.send_response(204)
            self.end_headers()
            return
        h = self._route()
        if h:
            return h.do_GET(self)
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/__mock_webhook"):
            n = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(n) or b"{}")
            ok = data.get("secret") == "dev-secret" and not STATE["fail"]
            if ok:
                RECEIVED.append(data)
            b = json.dumps({"ok": ok, "error": None if ok else "mock_fail"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
            return
        h = self._route()
        if h:
            return h.do_POST(self)
        self.send_error(404)

    def do_DELETE(self):
        h = self._route()
        if h and hasattr(h, "do_DELETE"):
            return h.do_DELETE(self)
        self.send_error(405)

    def do_PATCH(self):
        h = self._route()
        if h and hasattr(h, "do_PATCH"):
            return h.do_PATCH(self)
        self.send_error(405)

    def do_OPTIONS(self):
        h = self._route()
        if h and hasattr(h, "do_OPTIONS"):
            return h.do_OPTIONS(self)
        self.send_response(204)
        self.end_headers()

    def log_message(self, *a):
        pass


# lead.handler helpers for HTML/JSON errors on Dev when needed
for _n in ("_wants_json", "_json", "_redirect", "_html_error", "_fail"):
    setattr(Dev, _n, getattr(lead.handler, _n))

if __name__ == "__main__":
    print(f"dev server on http://127.0.0.1:{PORT}  CRM: /crm  (login admin / qwerty)", flush=True)
    if not os.environ.get("DATABASE_URL"):
        print("WARN: DATABASE_URL не задан — CRM API вернёт 503. Экспортируйте URL Postgres.", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Dev).serve_forever()
