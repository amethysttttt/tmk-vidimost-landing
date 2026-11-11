# -*- coding: utf-8 -*-
"""Проверка DATABASE_URL и создание таблиц CRM."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Подхватить .env.local / .env если есть (без внешних зависимостей)
for name in (".env.local", ".env"):
    path = ROOT / name
    if not path.exists():
        continue
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip("'").strip('"')
        os.environ.setdefault(key, val)

from crm_lib.db import database_url, ensure_schema  # noqa: E402


def main():
    url = database_url()
    # не печатаем пароль
    safe = url.split("@")[-1] if "@" in url else "(hidden)"
    print("Connecting to:", safe)
    ensure_schema()
    print("OK: CRM tables ready")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("FAIL:", exc, file=sys.stderr)
        sys.exit(1)
