# -*- coding: utf-8 -*-
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from crm_lib.auth import ingest_secret_ok
from crm_lib.handlers import CrmHandler
from crm_lib.http_util import read_json
from crm_lib.service import create_lead


class handler(CrmHandler):
    def do_POST(self):
        data, err = read_json(self)
        if err:
            return self.send_json(400, {"ok": False, "error": err})
        secret = self.headers.get("X-CRM-Secret") or self.headers.get("x-crm-secret") or data.get("secret") or ""
        if not ingest_secret_ok(str(secret)):
            return self.send_json(403, {"ok": False, "error": "forbidden"})
        payload = {
            "name": data.get("name"),
            "phone": data.get("phone"),
            "email": data.get("email") or "",
            "company": data.get("company") if data.get("allow_company") else "",
            "comment": data.get("message") or data.get("comment") or "",
            "service": data.get("service") or "",
            "page_url": data.get("page_url") or data.get("page") or "",
            "referrer": data.get("referrer") or "",
            "form_name": data.get("form_name") or "",
            "source": data.get("source") or "site_corp",
            "link": data.get("link") or "",
            "business_type": data.get("business_type") or "",
            "city": data.get("city") or "",
            "contact_method": data.get("contact_method") or "",
            "package": data.get("package") or "",
            "consent": True,
            "marketing": bool(data.get("marketing")),
            "utm_source": data.get("utm_source") or "",
            "utm_medium": data.get("utm_medium") or "",
            "utm_campaign": data.get("utm_campaign") or "",
            "utm_content": data.get("utm_content") or "",
            "utm_term": data.get("utm_term") or "",
            "gclid": data.get("gclid") or "",
            "gbraid": data.get("gbraid") or "",
            "wbraid": data.get("wbraid") or "",
            "idempotency_key": data.get("idempotency_key") or "",
        }
        try:
            lead = create_lead(payload, notify=True)
        except ValueError as exc:
            return self.send_json(400, {"ok": False, "error": str(exc)})
        except Exception as exc:
            return self.send_json(500, {"ok": False, "error": "server", "detail": str(exc)[:200]})
        return self.send_json(200, {"ok": True, "lead": {"id": lead["id"], "number": lead["number"], "duplicate": bool(lead.get("duplicate"))}})
