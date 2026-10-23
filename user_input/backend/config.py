from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    mongo_uri: str
    mongo_database: str
    admin_session_secret: str
    admin_cookie_secure: bool
    session_ttl_seconds: int = 8 * 60 * 60

    @classmethod
    def from_env(cls) -> "Settings":
        secure = os.getenv("ADMIN_COOKIE_SECURE", "false").strip().lower() in {"1", "true", "yes"}
        return cls(
            mongo_uri=os.getenv("MONGODB_URI", "").strip(),
            mongo_database=os.getenv("MONGODB_DATABASE", "cholo_user_input").strip() or "cholo_user_input",
            admin_session_secret=os.getenv("ADMIN_SESSION_SECRET", "local-development-secret-change-before-deploy"),
            admin_cookie_secure=secure,
        )
