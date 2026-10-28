from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class Settings:
    mongo_uri: str
    mongo_database: str
    admin_session_secret: str
    admin_cookie_secure: bool
    admin_username: str
    admin_password: str
    admin_cookie_name: str
    allowed_origins: List[str]
    session_ttl_seconds: int = 8 * 60 * 60

    @classmethod
    def from_env(cls) -> "Settings":
        secure = os.getenv("ADMIN_COOKIE_SECURE", "false").strip().lower() in {"1", "true", "yes"}
        # Parse ALLOWED_ORIGINS as a comma-separated list
        raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").strip()
        origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
        return cls(
            mongo_uri=os.getenv("MONGODB_URI", "").strip(),
            mongo_database=os.getenv("MONGODB_DATABASE", "pathsathi_user_input").strip() or "pathsathi_user_input",
            admin_session_secret=os.getenv("ADMIN_SESSION_SECRET", "local-development-secret-change-before-deploy"),
            admin_cookie_secure=secure,
            admin_username=os.getenv("ADMIN_USERNAME", "").strip(),
            admin_password=os.getenv("ADMIN_PASSWORD", "").strip(),
            admin_cookie_name=os.getenv("ADMIN_COOKIE_NAME", "pathsathi_admin_session").strip(),
            allowed_origins=origins,
        )
