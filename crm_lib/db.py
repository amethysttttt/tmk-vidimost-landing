# -*- coding: utf-8 -*-
import os
import threading
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

_LOCK = threading.Lock()
_READY = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS crm_leads (
  id BIGSERIAL PRIMARY KEY,
  number INT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'Новая',
  source TEXT NOT NULL,
  form_name TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  business_type TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  contact_method TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  page_url TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  package TEXT NOT NULL DEFAULT '',
  consent BOOLEAN NOT NULL DEFAULT FALSE,
  marketing BOOLEAN NOT NULL DEFAULT FALSE,
  contact_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  talk_result TEXT NOT NULL DEFAULT '',
  needs TEXT NOT NULL DEFAULT '',
  audit_due_at DATE,
  audit_search TEXT NOT NULL DEFAULT '',
  audit_maps TEXT NOT NULL DEFAULT '',
  audit_ai TEXT NOT NULL DEFAULT '',
  audit_notes TEXT NOT NULL DEFAULT '',
  proposal_sent_at DATE,
  proposal_package TEXT NOT NULL DEFAULT '',
  proposal_amount TEXT NOT NULL DEFAULT '',
  proposal_notes TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  next_action_at DATE,
  result TEXT NOT NULL DEFAULT '',
  closed_at DATE,
  refuse_reason TEXT NOT NULL DEFAULT '',
  gclid TEXT NOT NULL DEFAULT '',
  gbraid TEXT NOT NULL DEFAULT '',
  wbraid TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  utm_content TEXT NOT NULL DEFAULT '',
  utm_term TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT UNIQUE
);
CREATE SEQUENCE IF NOT EXISTS crm_lead_number_seq START 1;
CREATE TABLE IF NOT EXISTS crm_lead_events (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS crm_attachments (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind TEXT NOT NULL DEFAULT 'other',
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INT NOT NULL DEFAULT 0,
  data BYTEA NOT NULL
);
CREATE TABLE IF NOT EXISTS crm_notification_log (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS crm_leads_created_idx ON crm_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS crm_leads_phone_idx ON crm_leads(phone);
CREATE INDEX IF NOT EXISTS crm_leads_status_idx ON crm_leads(status);
CREATE INDEX IF NOT EXISTS crm_leads_source_idx ON crm_leads(source);
"""


def database_url() -> str:
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def crm_configured() -> bool:
    return bool((os.environ.get("DATABASE_URL") or "").strip() and (
        (os.environ.get("CRM_PASSWORD") or "").strip() or (os.environ.get("CRM_PASSWORD_HASH") or "").strip()
    ))


@contextmanager
def connect():
    with psycopg.connect(database_url(), row_factory=dict_row) as conn:
        yield conn


def ensure_schema():
    global _READY
    if _READY:
        return
    with _LOCK:
        if _READY:
            return
        with connect() as conn:
            conn.execute(SCHEMA)
            conn.commit()
        _READY = True


def next_number(conn) -> int:
    return int(conn.execute("SELECT nextval('crm_lead_number_seq') AS n").fetchone()["n"])
