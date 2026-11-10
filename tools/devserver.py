# -*- coding: utf-8 -*-
"""Локальная проверка лендинга: статика как на Vercel (cleanUrls) + /api/lead + заглушка таблицы."""
import importlib.util, json, os, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("PORT", "8790"))
os.environ["LEADS_WEBHOOK_URL"] = "http://127.0.0.1:%d/__mock_webhook" % PORT
os.environ["LEADS_WEBHOOK_SECRET"] = "dev-secret"
spec = importlib.util.spec_from_file_location("lead", os.path.join(ROOT, "api", "lead.py"))
lead = importlib.util.module_from_spec(spec); spec.loader.exec_module(lead)
RECEIVED = []
STATE = {"fail": False}

class Dev(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def translate_path(self, path):
        p = path.split("?", 1)[0].split("#", 1)[0]
        if p != "/" and not os.path.splitext(p)[1] and os.path.exists(os.path.join(ROOT, p.lstrip("/") + ".html")):
            path = p + ".html"
        return super().translate_path(path)
    def send_error(self, code, message=None, explain=None):
        if code == 404:
            body = open(os.path.join(ROOT, "404.html"), "rb").read()
            self.send_response(404); self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        super().send_error(code, message, explain)
    def do_GET(self):
        if self.path.startswith("/__received"):
            b = json.dumps(RECEIVED, ensure_ascii=False).encode(); self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b); return
        if self.path.startswith("/__fail"):
            STATE["fail"] = self.path.endswith("on"); self.send_response(204); self.end_headers(); return
        if self.path.startswith("/api/"):
            return lead.handler.do_GET(self)
        return super().do_GET()
    def do_POST(self):
        if self.path.startswith("/__mock_webhook"):
            n = int(self.headers.get("Content-Length") or 0); data = json.loads(self.rfile.read(n) or b"{}")
            ok = data.get("secret") == "dev-secret" and not STATE["fail"]
            if ok: RECEIVED.append(data)
            b = json.dumps({"ok": ok, "error": None if ok else "mock_fail"}).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b); return
        if self.path.split("?")[0] == "/api/lead":
            return lead.handler.do_POST(self)
        self.send_error(404)
    def log_message(self, *a): pass

for _n in ("_wants_json", "_json", "_redirect", "_html_error", "_fail"):
    setattr(Dev, _n, getattr(lead.handler, _n))

if __name__ == "__main__":
    print("dev server on http://127.0.0.1:%d" % PORT, flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Dev).serve_forever()
