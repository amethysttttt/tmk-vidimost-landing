# -*- coding: utf-8 -*-
from __future__ import annotations

import csv
import io
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from crm_lib.auth import hash_idempotency
from crm_lib.contract import contract, is_seo_audit_lead
from crm_lib.db import connect, ensure_schema, next_number
from crm_lib.holidays_kz import add_business_days
from crm_lib.http_util import clean, normalize_phone
from crm_lib.notify import notify_all

ALMATY = ZoneInfo("Asia/Almaty")
COLS = [
    "id", "number", "created_at", "updated_at", "status", "source", "form_name", "service",
    "name", "phone", "company", "email", "link", "business_type", "city", "contact_method",
    "comment", "page_url", "referrer", "package", "consent", "marketing", "contact_at",
    "notes", "talk_result", "needs", "audit_due_at", "audit_search", "audit_maps", "audit_ai",
    "audit_notes", "proposal_sent_at", "proposal_package", "proposal_amount", "proposal_notes",
    "next_action", "next_action_at", "result", "closed_at", "refuse_reason",
    "gclid", "gbraid", "wbraid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
]
WRITABLE = {
    "status", "service", "name", "phone", "company", "email", "link", "business_type", "city",
    "contact_method", "comment", "package", "contact_at", "notes", "talk_result", "needs",
    "audit_due_at", "audit_search", "audit_maps", "audit_ai", "audit_notes",
    "proposal_sent_at", "proposal_package", "proposal_amount", "proposal_notes",
    "next_action", "next_action_at", "result", "closed_at", "refuse_reason",
}
DATE_FIELDS = {"audit_due_at", "proposal_sent_at", "next_action_at", "closed_at"}


def _sql_cols():
    return ", ".join(COLS)


def serialize(row: dict | None) -> dict:
    if not row:
        return {}
    out = dict(row)
    today = datetime.now(ALMATY).date()
    closed = out.get("status") in ("Успешно", "Отказ", "Отложено")
    na, ad = out.get("next_action_at"), out.get("audit_due_at")
    out["next_action_overdue"] = bool(na and na < today and not closed)
    out["audit_overdue"] = bool(ad and ad < today and not closed)
    return out


def add_event(conn, lead_id: int, kind: str, message: str):
    conn.execute(
        "INSERT INTO crm_lead_events (lead_id, kind, message) VALUES (%s,%s,%s)",
        (lead_id, kind, message[:2000]),
    )


def create_lead(payload: dict[str, Any], *, notify: bool = True) -> dict:
    ensure_schema()
    name = clean(payload.get("name"), 120)
    company = clean(payload.get("company"), 160)
    phone = normalize_phone(str(payload.get("phone", ""))) or clean(payload.get("phone"), 20)
    if not phone or (len(name) < 2 and len(company) < 2):
        raise ValueError("name_or_company_and_phone_required")

    source = clean(payload.get("source"), 40)
    form_name = clean(payload.get("form_name"), 120)
    service = clean(payload.get("service"), 160) or clean(payload.get("comment") or payload.get("message"), 160)
    comment = clean(payload.get("comment") or payload.get("message"), 4000)
    idem = clean(payload.get("idempotency_key"), 80) or hash_idempotency(
        phone, name, source, form_name, service, clean(payload.get("page_url"), 200),
        datetime.now(ALMATY).strftime("%Y-%m-%dT%H"),
    )

    audit_due = None
    probe = {"source": source, "service": service, "form_name": form_name}
    if is_seo_audit_lead(probe):
        audit_due = add_business_days(datetime.now(ALMATY).date(), 3)

    with connect() as conn:
        existing = conn.execute("SELECT id FROM crm_leads WHERE idempotency_key=%s", (idem,)).fetchone()
        if existing:
            row = conn.execute(f"SELECT {_sql_cols()} FROM crm_leads WHERE id=%s", (existing["id"],)).fetchone()
            return serialize(row) | {"duplicate": True}

        number = next_number(conn)
        row = conn.execute(
            f"""
            INSERT INTO crm_leads (
              number, status, source, form_name, service, name, phone, company, email, link,
              business_type, city, contact_method, comment, page_url, referrer, package,
              consent, marketing, audit_due_at,
              gclid, gbraid, wbraid, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
              idempotency_key
            ) VALUES (
              %s,'Новая',%s,%s,%s,%s,%s,%s,%s,%s,
              %s,%s,%s,%s,%s,%s,%s,
              %s,%s,%s,
              %s,%s,%s,%s,%s,%s,%s,%s,
              %s
            ) RETURNING {_sql_cols()}
            """,
            (
                number, source, form_name, service, name, phone, company,
                clean(payload.get("email"), 160), clean(payload.get("link"), 300),
                clean(payload.get("business_type"), 80), clean(payload.get("city"), 60),
                clean(payload.get("contact_method"), 40), comment,
                clean(payload.get("page_url") or payload.get("page"), 500),
                clean(payload.get("referrer"), 300), clean(payload.get("package"), 80),
                bool(payload.get("consent")), bool(payload.get("marketing")), audit_due,
                clean(payload.get("gclid"), 200), clean(payload.get("gbraid"), 200),
                clean(payload.get("wbraid"), 200), clean(payload.get("utm_source"), 200),
                clean(payload.get("utm_medium"), 200), clean(payload.get("utm_campaign"), 200),
                clean(payload.get("utm_content"), 200), clean(payload.get("utm_term"), 200),
                idem,
            ),
        ).fetchone()
        add_event(conn, row["id"], "created", f"Заявка создана · {source}")
        if audit_due:
            add_event(conn, row["id"], "audit_due", f"Срок бесплатного SEO+GEO разбора: {audit_due.isoformat()}")
        conn.commit()
        lead = serialize(row)

    if notify:
        try:
            notify_all(lead)
        except Exception:
            pass
    return lead


def get_lead(lead_id: int) -> dict | None:
    ensure_schema()
    with connect() as conn:
        row = conn.execute(f"SELECT {_sql_cols()} FROM crm_leads WHERE id=%s", (lead_id,)).fetchone()
        if not row:
            return None
        events = conn.execute(
            "SELECT id, created_at, kind, message FROM crm_lead_events WHERE lead_id=%s ORDER BY created_at, id",
            (lead_id,),
        ).fetchall()
        files = conn.execute(
            "SELECT id, created_at, kind, filename, content_type, size_bytes FROM crm_attachments WHERE lead_id=%s ORDER BY created_at DESC",
            (lead_id,),
        ).fetchall()
        notes = conn.execute(
            "SELECT id, created_at, channel, status, detail FROM crm_notification_log WHERE lead_id=%s ORDER BY created_at DESC LIMIT 20",
            (lead_id,),
        ).fetchall()
        dupes = conn.execute(
            "SELECT id, number, created_at, source, service, status FROM crm_leads WHERE phone=%s AND id<>%s ORDER BY created_at DESC LIMIT 5",
            (row["phone"], lead_id),
        ).fetchall()
    lead = serialize(row)
    lead["events"] = [dict(e) for e in events]
    lead["attachments"] = [dict(f) for f in files]
    lead["notifications"] = [dict(n) for n in notes]
    lead["phone_matches"] = [dict(d) for d in dupes]
    return lead


def _parse_date(raw):
    if raw in (None, ""):
        return None
    return date.fromisoformat(str(raw)[:10])


def update_lead(lead_id: int, patch: dict) -> dict:
    ensure_schema()
    with connect() as conn:
        current = conn.execute(f"SELECT {_sql_cols()} FROM crm_leads WHERE id=%s", (lead_id,)).fetchone()
        if not current:
            raise ValueError("not_found")
        merged = dict(current)
        events = []
        for key, val in patch.items():
            if key not in WRITABLE:
                continue
            if key == "status":
                val = clean(val, 40)
                if val not in contract()["STATUSES"]:
                    raise ValueError("bad_status")
                if val != current["status"]:
                    events.append(("status", f"Статус: {current['status']} → {val}"))
            elif key == "phone":
                val = normalize_phone(str(val)) or clean(val, 20)
            elif key in DATE_FIELDS:
                val = _parse_date(val)
            elif key == "contact_at":
                if val in (None, ""):
                    val = None
                else:
                    text = str(val)
                    val = datetime.fromisoformat(text.replace("Z", "+00:00")) if "T" in text else datetime.fromisoformat(text[:10]).replace(tzinfo=ALMATY)
            else:
                val = clean(val, 5000 if key in ("notes", "talk_result", "needs", "comment", "audit_notes", "audit_search", "audit_maps", "audit_ai", "proposal_notes") else 300)
                if key in ("notes", "talk_result", "needs") and val != (current.get(key) or ""):
                    events.append(("note", f"Обновлено «{key}»"))
            merged[key] = val

        sets, values = [], []
        for key in WRITABLE:
            sets.append(f"{key}=%s")
            values.append(merged.get(key))
        sets.append("updated_at=NOW()")
        values.append(lead_id)
        row = conn.execute(
            f"UPDATE crm_leads SET {', '.join(sets)} WHERE id=%s RETURNING {_sql_cols()}",
            tuple(values),
        ).fetchone()
        for kind, msg in events:
            add_event(conn, lead_id, kind, msg)
        conn.commit()
    return get_lead(lead_id) or serialize(row)


def list_leads(params: dict[str, str]) -> dict:
    ensure_schema()
    where, args = ["1=1"], []
    q = clean(params.get("q"), 120)
    if q:
        where.append("(name ILIKE %s OR phone ILIKE %s OR company ILIKE %s OR link ILIKE %s OR service ILIKE %s)")
        like = f"%{q}%"
        args.extend([like] * 5)
    for key in ("status", "source"):
        val = clean(params.get(key), 80)
        if val and val != "Все":
            where.append(f"{key}=%s")
            args.append(val)
    svc = clean(params.get("service"), 160)
    if svc and svc != "Все":
        where.append("service ILIKE %s")
        args.append(f"%{svc}%")
    if clean(params.get("from"), 12):
        where.append("created_at::date >= %s::date")
        args.append(params["from"])
    if clean(params.get("to"), 12):
        where.append("created_at::date <= %s::date")
        args.append(params["to"])
    if clean(params.get("overdue"), 8) == "1":
        where.append(
            "((next_action_at IS NOT NULL AND next_action_at < CURRENT_DATE) OR (audit_due_at IS NOT NULL AND audit_due_at < CURRENT_DATE))"
            " AND status NOT IN ('Успешно','Отказ','Отложено')"
        )
    where_sql = " AND ".join(where)
    try:
        page = max(int(params.get("page") or 1), 1)
    except ValueError:
        page = 1
    try:
        per = min(max(int(params.get("per_page") or 25), 1), 100)
    except ValueError:
        per = 25
    with connect() as conn:
        total = conn.execute(f"SELECT COUNT(*) AS c FROM crm_leads WHERE {where_sql}", tuple(args)).fetchone()["c"]
        rows = conn.execute(
            f"SELECT {_sql_cols()} FROM crm_leads WHERE {where_sql} ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s",
            tuple(args + [per, (page - 1) * per]),
        ).fetchall()
        counters = conn.execute(
            """
            SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status='Новая') AS new_count,
              COUNT(*) FILTER (WHERE status IN ('Готовится разбор','В работе','КП отправлено','Переговоры')) AS in_work,
              COUNT(*) FILTER (
                WHERE ((next_action_at IS NOT NULL AND next_action_at < CURRENT_DATE)
                   OR (audit_due_at IS NOT NULL AND audit_due_at < CURRENT_DATE))
                  AND status NOT IN ('Успешно','Отказ','Отложено')
              ) AS overdue
            FROM crm_leads
            """
        ).fetchone()
    return {
        "items": [serialize(r) for r in rows],
        "page": page,
        "per_page": per,
        "total": int(total),
        "counters": {
            "total": int(counters["total"]),
            "new": int(counters["new_count"]),
            "in_work": int(counters["in_work"]),
            "overdue": int(counters["overdue"]),
        },
    }


def export_csv(params: dict[str, str]) -> str:
    data = list_leads({**params, "page": "1", "per_page": "10000"})
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=COLS, extrasaction="ignore")
    w.writeheader()
    for item in data["items"]:
        w.writerow({k: item.get(k, "") for k in COLS})
    return buf.getvalue()


def add_attachment(lead_id: int, *, kind: str, filename: str, content_type: str, data: bytes) -> dict:
    ensure_schema()
    if len(data) > 8 * 1024 * 1024:
        raise ValueError("file_too_large")
    with connect() as conn:
        if not conn.execute("SELECT id FROM crm_leads WHERE id=%s", (lead_id,)).fetchone():
            raise ValueError("not_found")
        row = conn.execute(
            """INSERT INTO crm_attachments (lead_id, kind, filename, content_type, size_bytes, data)
               VALUES (%s,%s,%s,%s,%s,%s)
               RETURNING id, created_at, kind, filename, content_type, size_bytes""",
            (lead_id, clean(kind, 40) or "other", clean(filename, 200) or "file",
             clean(content_type, 120) or "application/octet-stream", len(data), data),
        ).fetchone()
        add_event(conn, lead_id, "file", f"Файл «{row['filename']}»")
        conn.commit()
    return dict(row)


def get_attachment(file_id: int) -> dict | None:
    ensure_schema()
    with connect() as conn:
        row = conn.execute(
            "SELECT id, lead_id, filename, content_type, size_bytes, data FROM crm_attachments WHERE id=%s",
            (file_id,),
        ).fetchone()
    return dict(row) if row else None
