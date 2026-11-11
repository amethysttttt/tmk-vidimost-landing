# -*- coding: utf-8 -*-
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import bcrypt

from crm_lib.auth import verify_password
from crm_lib.handlers import CrmHandler
from crm_lib.http_util import read_json


class handler(CrmHandler):
    def do_POST(self):
        if not self.require_user():
            return
        data, err = read_json(self, max_bytes=4096)
        if err:
            return self.send_json(400, {"ok": False, "error": err})
        current = str(data.get("current") or "")
        new_password = str(data.get("new_password") or "")
        if not verify_password(current):
            return self.send_json(401, {"ok": False, "error": "bad_current"})
        if len(new_password) < 8:
            return self.send_json(400, {"ok": False, "error": "too_short"})
        hashed = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")
        return self.send_json(200, {
            "ok": True,
            "password_hash": hashed,
            "hint": "Сохраните значение в CRM_PASSWORD_HASH на Vercel и удалите CRM_PASSWORD.",
        })
