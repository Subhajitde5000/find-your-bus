from __future__ import annotations

import base64
import hashlib
import hmac
import time


def credentials_are_valid(username: str, password: str, expected_username: str, expected_password: str) -> bool:
    """Compare submitted credentials against the values stored in the database/config."""
    return hmac.compare_digest(username, expected_username) and hmac.compare_digest(password, expected_password)


def create_session_token(secret: str, ttl_seconds: int, now: int | None = None) -> str:
    expires_at = (int(time.time()) if now is None else now) + ttl_seconds
    payload = str(expires_at)
    signature = hmac.new(secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()
    encoded = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{payload}.{encoded}"


def verify_session_token(token: str | None, secret: str, now: int | None = None) -> bool:
    if not token:
        return False
    try:
        expires_text, signature = token.split(".", 1)
        expires_at = int(expires_text)
    except (ValueError, TypeError):
        return False

    current_time = int(time.time()) if now is None else now
    if expires_at <= current_time:
        return False

    expected = create_signature(expires_text, secret)
    return hmac.compare_digest(signature, expected)


def create_signature(payload: str, secret: str) -> str:
    signature = hmac.new(secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
