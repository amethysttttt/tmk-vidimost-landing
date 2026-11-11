# -*- coding: utf-8 -*-
import hashlib
import hmac
import json
import os
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode

import bcrypt

SESSION_COOKIE = "tmk_crm_session"
SESSION_TTL = 14 * 24 * 3600
MAX_FAILS = 8
LOCK_SECONDS = 1800
_FAILS: dict[str, tuple[int, float]] = {}


def expected_login() -> str:
    return (os.environ.get("CRM_LOGIN") or "admin").strip()


def verify_password(password: str) -> bool:
    env_hash = (os.environ.get("CRM_PASSWORD_HASH") or "").strip()
    if env_hash:
        try:
            return bcrypt.checkpw(password.encode("utf-8"), env_hash.encode("utf-8"))
        except Exception:
            return False
    plain = (os.environ.get("CRM_PASSWORD") or "").strip()
    return bool(plain) and hmac.compare_digest(password, plain)


def session_secret() -> str:
    explicit = (os.environ.get("CRM_SESSION_SECRET") or "").strip()
    if explicit:
        return explicit
    material = (os.environ.get("CRM_PASSWORD_HASH") or os.environ.get("CRM_PASSWORD") or "").strip()
    return hashlib.sha256(("tmk-crm|" + material).encode("utf-8")).hexdigest() if material else ""


def auth_ready() -> bool:
    return bool(session_secret() and (
        (os.environ.get("CRM_PASSWORD") or "").strip() or (os.environ.get("CRM_PASSWORD_HASH") or "").strip()
    ))


def client_ip(headers) -> str:
    fwd = headers.get("X-Forwarded-For") or headers.get("x-forwarded-for") or ""
    if fwd:
        return fwd.split(",")[0].strip()[:80]
    return (headers.get("X-Real-IP") or headers.get("x-real-ip") or "unknown")[:80]


def is_locked(ip: str):
    row = _FAILS.get(ip)
    if not row:
        return False, 0
    fails, until = row
    now = time.time()
    if until > now:
        return True, int(until - now)
    if fails >= MAX_FAILS and until <= now:
        _FAILS.pop(ip, None)
    return False, 0


def register_fail(ip: str):
    fails, until = _FAILS.get(ip, (0, 0.0))
    now = time.time()
    if until > now:
        return
    fails += 1
    _FAILS[ip] = (0, now + LOCK_SECONDS) if fails >= MAX_FAILS else (fails, 0.0)


def register_success(ip: str):
    _FAILS.pop(ip, None)


def _sign(raw: str) -> str:
    return hmac.new(session_secret().encode("utf-8"), raw.encode("utf-8"), hashlib.sha256).hexdigest()


def create_session_token(login: str) -> str:
    payload = {"exp": int(time.time()) + SESSION_TTL, "login": login, "v": 1}
    raw = urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode("ascii")
    return f"{raw}.{_sign(raw)}"


def session_login(token: str):
    if not token or "." not in token or not auth_ready():
        return None
    raw, sig = token.rsplit(".", 1)
    if not hmac.compare_digest(_sign(raw), sig):
        return None
    try:
        pad = "=" * (-len(raw) % 4)
        payload = json.loads(urlsafe_b64decode(raw + pad).decode("utf-8"))
    except Exception:
        return None
    if int(payload.get("exp") or 0) < int(time.time()):
        return None
    return payload.get("login") or expected_login()


def ingest_secret_ok(provided: str) -> bool:
    expected = (os.environ.get("CRM_INGEST_SECRET") or "").strip()
    return bool(expected and provided and hmac.compare_digest(provided, expected))


def hash_idempotency(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
