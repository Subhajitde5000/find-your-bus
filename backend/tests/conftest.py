"""Test setup.

Tests run against a dedicated PostgreSQL database (TEST_DATABASE_URL, default
`find_your_bus_test`). The schema is rebuilt and the Excel files are imported once per session.
"""

import os
from pathlib import Path

import pytest

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/find_your_bus_test",
)
# Must be set before `app` is imported, because the engine is created at import time.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR.parent / "data"


@pytest.fixture(scope="session")
def client():
    from sqlalchemy.exc import OperationalError
    from fastapi.testclient import TestClient

    from app import models  # noqa: F401
    from app.db import Base, SessionLocal, engine
    from app.importer import import_all
    from main import app

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
