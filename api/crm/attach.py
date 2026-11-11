# -*- coding: utf-8 -*-
import base64
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from crm_lib.handlers import CrmHandler
from crm_lib.http_util import query_params, read_json
from crm_lib.service import add_attachment, get_attachment


class handler(CrmHandler):
    def do_GET(self):
        if not self.require_user():
            return
        try:
            file_id = int(query_params(self).get("file") or 0)
        except ValueError:
            file_id = 0
        row = get_attachment(file_id) if file_id else None
        if not row:
            return self.send_json(404, {"ok": False, "error": "not_found"})
        data = bytes(row["data"])
        self.send_response(200)
        self.send_header("Content-Type", row["content_type"] or "application/octet-stream")
        self.send_header("Content-Disposition", f'attachment; filename="{row["filename"]}"')
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if not self.require_user():
            return
        try:
            lead_id = int(query_params(self).get("id") or 0)
        except ValueError:
            lead_id = 0
        if lead_id <= 0:
            return self.send_json(400, {"ok": False, "error": "bad_id"})
        payload, err = read_json(self)
        if err:
            return self.send_json(400, {"ok": False, "error": err})
        try:
            raw = base64.b64decode(payload.get("content_base64") or "", validate=False)
            row = add_attachment(
                lead_id,
                kind=str(payload.get("kind") or "other"),
                filename=str(payload.get("filename") or "file"),
                content_type=str(payload.get("content_type") or "application/octet-stream"),
                data=raw,
            )
        except ValueError as exc:
            return self.send_json(400, {"ok": False, "error": str(exc)})
        except Exception as exc:
            return self.send_json(500, {"ok": False, "error": "server", "detail": str(exc)[:200]})
        return self.send_json(200, {"ok": True, "attachment": row})
