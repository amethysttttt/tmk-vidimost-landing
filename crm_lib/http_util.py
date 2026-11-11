# -*- coding: utf-8 -*-
import json
import re
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

MAX_JSON = 12 * 1024 * 1024
PHONE_RE = re.compile(r"^\+7\d{10}$")
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def read_json(handler: BaseHTTPRequestHandler, max_bytes: int = MAX_JSON):
    try:
        length = int(handler.headers.get("Content-Length") or 0)
    except ValueError:
        length = 0
    if length <= 0 or length > max_bytes:
        return None, "validation"
    raw = handler.rfile.read(length).decode("utf-8", "replace")
    try:
        data = json.loads(raw)
    except ValueError:
        return None, "validation"
    if not isinstance(data, dict):
        return None, "validation"
    return data, None


def send_json(handler: BaseHTTPRequestHandler, status: int, obj: dict):
    body = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def query_params(handler: BaseHTTPRequestHandler):
    return {k: v[0] for k, v in parse_qs(urlparse(handler.path).query).items()}


def cookie_value(handler: BaseHTTPRequestHandler, name: str) -> str:
    raw = handler.headers.get("Cookie") or ""
    for part in raw.split(";"):
        part = part.strip()
        if part.startswith(name + "="):
            return part[len(name) + 1 :]
    return ""


def _secure(handler: BaseHTTPRequestHandler) -> bool:
    host = (handler.headers.get("Host") or "").lower()
    return not (host.startswith("127.0.0.1") or host.startswith("localhost"))


def set_cookie(handler, name, value, max_age, http_only=True):
    flags = [f"{name}={value}", "Path=/", f"Max-Age={max_age}", "SameSite=Lax"]
    if _secure(handler):
        flags.append("Secure")
    if http_only:
        flags.append("HttpOnly")
    handler.send_header("Set-Cookie", "; ".join(flags))


def clear_cookie(handler, name):
    flags = [f"{name}=", "Path=/", "Max-Age=0", "SameSite=Lax", "HttpOnly"]
    if _secure(handler):
        flags.append("Secure")
    handler.send_header("Set-Cookie", "; ".join(flags))


def clean(value, limit: int) -> str:
    if not isinstance(value, str):
        value = "" if value is None else str(value)
    return _CTRL.sub("", value).strip()[:limit]


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    return "+7" + digits if len(digits) == 10 else ""
