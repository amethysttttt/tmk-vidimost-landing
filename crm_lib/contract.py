# -*- coding: utf-8 -*-
import json
from functools import lru_cache
from pathlib import Path

_PATH = Path(__file__).resolve().parents[1] / "shared" / "crm.contract.json"


@lru_cache(maxsize=1)
def contract() -> dict:
    with _PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def source_label(source_id: str) -> str:
    for row in contract()["SOURCES"]:
        if row["id"] == source_id:
            return row["label"]
    return source_id or "—"


def is_seo_audit_lead(lead: dict) -> bool:
    """Только бесплатный SEO+GEO разбор — не пакеты и не другие IT-услуги."""
    if lead.get("source") != "site_seo":
        return False
    service = (lead.get("service") or "").strip()
    if service.startswith("Пакет "):
        return False
    if service == "Бесплатный SEO + GEO разбор":
        return True
    form = lead.get("form_name") or ""
    if "удаление" in form.lower():
        return False
    text = f"{service} {form}"
    return ("SEO" in text or "разбор" in text) and not service.startswith("Пакет ")
