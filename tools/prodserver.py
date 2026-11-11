# -*- coding: utf-8 -*-
"""Прод-сервер лендинга + CRM для PS.kz (nginx → 127.0.0.1:8790)."""
import importlib.util
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(os.environ.get("APP_ROOT") or Path(__file__).resolve().parents[1])
PORT = int(os.environ.get("PORT", "8790"))
BIND = os.environ.get("BIND", "127.0.0.1")

# Загрузить .env / .env.local
for name in (".env", ".env.local"):
    path = ROOT / name
    if not path.exists():
        continue
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip("'").strip('"'))

sys.path.insert(0, str(ROOT))


def _load(name: str, rel: str):
    path = ROOT / rel
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


from crm_lib.handlers import CrmHandler

lead = _load("lead", "api/lead.py")
crm_session = _load("crm_session", "api/crm/session.py")
crm_leads = _load("crm_leads", "api/crm/leads.py")
crm_export = _load("crm_export", "api/crm/export.py")
crm_ingest = _load("crm_ingest", "api/crm/ingest.py")
crm_attach = _load("crm_attach", "api/crm/attach.py")
crm_password = _load("crm_password", "api/crm/password.py")

ROUTES = {
    "/api/lead": lead.handler,
    "/api/crm/session": crm_session.handler,
    "/api/crm/leads": crm_leads.handler,
    "/api/crm/export": crm_export.handler,
    "/api/crm/ingest": crm_ingest.handler,
    "/api/crm/attach": crm_attach.handler,
    "/api/crm/password": crm_password.handler,
}


class App(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def translate_path(self, path):
        p = path.split("?", 1)[0].split("#", 1)[0]
        if p in ("/crm", "/crm/"):
            path = "/crm/index.html"
        elif p != "/" and not os.path.splitext(p)[1]:
            html = ROOT / (p.lstrip("/") + ".html")
            if html.exists():
                path = p + ".html"
        return super().translate_path(path)

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            body = (ROOT / "404.html").read_bytes() if (ROOT / "404.html").exists() else b"Not found"
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
        h = self._route()
        if h:
            return h.do_GET(self)
        return super().do_GET()

    def do_POST(self):
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

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


for _n in ("_wants_json", "_json", "_redirect", "_html_error", "_fail"):
    setattr(App, _n, getattr(lead.handler, _n))

# CRM handlers вызываются как h.do_GET(self) — self должен иметь методы CrmHandler
for _n in ("send_json", "require_crm", "require_user", "do_OPTIONS"):
    setattr(App, _n, getattr(CrmHandler, _n))


if __name__ == "__main__":
    missing = [k for k in ("DATABASE_URL", "CRM_PASSWORD", "CRM_INGEST_SECRET") if not os.environ.get(k) and not (k == "CRM_PASSWORD" and os.environ.get("CRM_PASSWORD_HASH"))]
    if missing and not os.environ.get("CRM_PASSWORD_HASH"):
        # CRM_PASSWORD или HASH
        need = []
        if not os.environ.get("DATABASE_URL"):
            need.append("DATABASE_URL")
        if not (os.environ.get("CRM_PASSWORD") or os.environ.get("CRM_PASSWORD_HASH")):
            need.append("CRM_PASSWORD")
        if not os.environ.get("CRM_INGEST_SECRET"):
            need.append("CRM_INGEST_SECRET")
        if need:
            print("Missing env:", ", ".join(need), file=sys.stderr)
            sys.exit(1)
    print(f"tmk landing+crm on http://{BIND}:{PORT} root={ROOT}", flush=True)
    ThreadingHTTPServer((BIND, PORT), App).serve_forever()
