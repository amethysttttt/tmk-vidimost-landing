# -*- coding: utf-8 -*-
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Any

from crm_lib.contract import source_label
from crm_lib.db import connect, ensure_schema


def notify_to() -> str:
    return (os.environ.get("NOTIFY_EMAIL") or os.environ.get("LEAD_TO_EMAIL") or "kaelggbet@gmail.com").strip()


def public_url() -> str:
    return (os.environ.get("CRM_PUBLIC_URL") or "https://ai.tmk-technohorizon.kz").rstrip("/")


def log_notification(lead_id: int, channel: str, status: str, detail: str):
    try:
        ensure_schema()
        with connect() as conn:
            conn.execute(
                "INSERT INTO crm_notification_log (lead_id, channel, status, detail) VALUES (%s,%s,%s,%s)",
                (lead_id, channel, status, detail[:1000]),
            )
            conn.commit()
    except Exception:
        pass


def send_email(lead: dict[str, Any]) -> tuple[bool, str]:
    to = notify_to()
    subject = f"Заявка #{lead.get('number')}: {lead.get('name') or lead.get('company') or 'без имени'}, {lead.get('phone')}"
    link = f"{public_url()}/crm?lead={lead.get('id')}"
    body = "\n".join([
        f"Новая заявка #{lead.get('number')}",
        "",
        f"Источник: {source_label(str(lead.get('source') or ''))}",
        f"Форма: {lead.get('form_name') or '—'}",
        f"Услуга / запрос: {lead.get('service') or lead.get('comment') or '—'}",
        f"Имя: {lead.get('name') or '—'}",
        f"Компания: {lead.get('company') or '—'}",
        f"Телефон: {lead.get('phone') or '—'}",
        f"Ссылка клиента: {lead.get('link') or '—'}",
        "",
        f"CRM: {link}",
    ])
    resend = (os.environ.get("RESEND_API_KEY") or "").strip()
    if resend:
        import json
        import urllib.request
        payload = {
            "from": (os.environ.get("LEAD_FROM_EMAIL") or os.environ.get("SMTP_USER") or "onboarding@resend.dev"),
            "to": [to],
            "subject": subject,
            "text": body,
        }
        try:
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=json.dumps(payload).encode(),
                headers={"Authorization": f"Bearer {resend}", "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp.read(2048)
            return True, "sent_resend"
        except Exception as exc:
            return False, str(exc)[:400]

    user = (os.environ.get("SMTP_USER") or "").strip()
    password = (os.environ.get("SMTP_PASS") or "").strip()
    if not user or not password:
        return False, "SMTP not configured"
    host = (os.environ.get("SMTP_HOST") or "smtp.gmail.com").strip()
    port = int(os.environ.get("SMTP_PORT") or "465")
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"TMK CRM <{user}>"
    msg["To"] = to
    msg.set_content(body)
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=20, context=ssl.create_default_context()) as smtp:
                smtp.login(user, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=20) as smtp:
                smtp.starttls(context=ssl.create_default_context())
                smtp.login(user, password)
                smtp.send_message(msg)
        return True, "sent_smtp"
    except Exception as exc:
        return False, str(exc)[:400]


def notify_whatsapp(lead: dict[str, Any]) -> tuple[bool, str]:
    # Blocker until WhatsApp Business / Green API credentials exist.
    if not (os.environ.get("WHATSAPP_PROVIDER") or "").strip():
        return False, "WhatsApp provider not configured (blocker); target +77479071622"
    return False, "provider not implemented"


def notify_all(lead: dict[str, Any]):
    lead_id = int(lead["id"])
    ok, detail = send_email(lead)
    log_notification(lead_id, "email", "ok" if ok else "error", detail)
    wa_ok, wa_detail = notify_whatsapp(lead)
    log_notification(lead_id, "whatsapp", "ok" if wa_ok else "skipped", wa_detail)
    return {"email": ok, "whatsapp": wa_ok}
