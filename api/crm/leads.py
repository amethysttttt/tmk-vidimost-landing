# -*- coding: utf-8 -*-
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from crm_lib.handlers import CrmHandler
from crm_lib.http_util import query_params, read_json
from crm_lib.notify import notify_all
from crm_lib.service import create_lead, get_lead, list_leads, update_lead


class handler(CrmHandler):
    def do_GET(self):
        if not self.require_user():
            return
        params = query_params(self)
        if params.get("id"):
            try:
                lead = get_lead(int(params["id"]))
            except Exception as exc:
                return self.send_json(500, {"ok": False, "error": "server", "detail": str(exc)[:200]})
            if not lead:
                return self.send_json(404, {"ok": False, "error": "not_found"})
            return self.send_json(200, {"ok": True, "lead": lead})
        try:
            data = list_leads(params)
        except Exception as exc:
            return self.send_json(500, {"ok": False, "error": "server", "detail": str(exc)[:200]})
        return self.send_json(200, {"ok": True, **data})

    def do_POST(self):
        if not self.require_user():
            return
        params = query_params(self)
        # retry notify
        if params.get("retry_notify"):
            lead = get_lead(int(params["retry_notify"]))
            if not lead:
                return self.send_json(404, {"ok": False, "error": "not_found"})
            return self.send_json(200, {"ok": True, "result": notify_all(lead)})

        data, err = read_json(self)
        if err:
            return self.send_json(400, {"ok": False, "error": err})

        # update via POST?id=
        if params.get("id"):
            try:
                lead = update_lead(int(params["id"]), data)
            except ValueError as exc:
                return self.send_json(400 if str(exc) != "not_found" else 404, {"ok": False, "error": str(exc)})
            except Exception as exc:
                return self.send_json(500, {"ok": False, "error": "server", "detail": str(exc)[:200]})
            return self.send_json(200, {"ok": True, "lead": lead})

        data.setdefault("source", "whatsapp")
        data.setdefault("form_name", "Ручной ввод")
        try:
            lead = create_lead(data, notify=bool(data.get("notify", True)))
        except ValueError as exc:
            return self.send_json(400, {"ok": False, "error": str(exc)})
        except Exception as exc:
            return self.send_json(500, {"ok": False, "error": "server", "detail": str(exc)[:200]})
        return self.send_json(200, {"ok": True, "lead": lead})

    def do_PATCH(self):
        return self.do_POST()
