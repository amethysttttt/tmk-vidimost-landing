# -*- coding: utf-8 -*-
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from crm_lib.contract import contract
from crm_lib.handlers import CrmHandler
from crm_lib.http_util import query_params
from crm_lib.service import export_csv


class handler(CrmHandler):
    def do_GET(self):
        if not self.require_user():
            return
        try:
            text = export_csv(query_params(self))
        except Exception as exc:
            return self.send_json(500, {"ok": False, "error": "server", "detail": str(exc)[:200]})
        data = ("\ufeff" + text).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{contract()["CSV_PREFIX"]}.csv"')
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
