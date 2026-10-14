"""Test setup.

Tests run against a dedicated PostgreSQL database (TEST_DATABASE_URL, default
`find_your_bus_test`). The schema is rebuilt and the Excel files are imported once per session.
"""

import os
from pathlib import Path

import pytest

import re
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR.parent / "data"

env_file = BACKEND_DIR / ".env"
base_url = "postgresql+psycopg://postgres:1234@127.0.0.1:5432/find_your_bus"
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^DATABASE_URL\s*=\s*[\"']?(.*?)[\"']?\s*$", line.strip())
        if m:
            base_url = m.group(1)
            break

default_test_url = base_url.rsplit("/", 1)[0] + "/find_your_bus_test"
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", default_test_url)
# Must be set before any app modules are imported
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

@pytest.fixture(scope="session")
def client():
    from sqlalchemy.exc import OperationalError
    from fastapi.testclient import TestClient

    from app import models  # noqa: F401
    from app.db import Base, SessionLocal, engine
    from app.importer import import_all
    from main import app

    assert "test" in str(engine.url).lower(), f"Safety check: refusing to run tests on non-test DB: {engine.url}"

    try:
        engine.connect().close()
    except OperationalError as exc:  # pragma: no cover - environment specific
        pytest.skip(f"PostgreSQL not reachable at {TEST_DATABASE_URL}: {exc.orig}")

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as session:
        import_all(
            session,
            stands_path=DATA_DIR / "Kolkata_Bus_Stands_v2.xlsx",
            routes_path=DATA_DIR / "Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory.xlsx",
        )

    with TestClient(app) as test_client:
        yield test_client

    Base.metadata.drop_all(engine)
    engine.dispose()
