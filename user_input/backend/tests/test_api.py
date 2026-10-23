from fastapi.testclient import TestClient

from config import Settings
from main import create_app
from store import SubmissionStore


TEST_SETTINGS = Settings(
    mongo_uri="",
    mongo_database="test",
    admin_session_secret="test-session-key",
    admin_cookie_secure=False,
)


def make_client() -> TestClient:
    return TestClient(create_app(store=SubmissionStore(), settings=TEST_SETTINGS))


def test_feature_suggestion_can_be_submitted_and_reviewed_by_admin() -> None:
    with make_client() as client:
        response = client.post(
            "/api/submissions",
            json={
                "kind": "feature",
                "feature_area": "journey_planning",
                "title": "Add nearby stop suggestions",
                "details": "When I type my origin, it would help to see nearby stops before I choose one.",
                "email": "rider@example.com",
            },
        )
        assert response.status_code == 201
        assert response.json()["id"]
        assert client.get("/api/admin/submissions").status_code == 401

        login = client.post("/api/admin/login", json={"username": "@subhajit de", "password": "password1234!"})
        assert login.status_code == 200
        assert login.json() == {"authenticated": True}
        reviewed = client.get("/api/admin/submissions")
        assert reviewed.status_code == 200
        assert reviewed.json()["count"] == 1
        assert reviewed.json()["items"][0]["title"] == "Add nearby stop suggestions"
        assert reviewed.json()["items"][0]["kind"] == "feature"

        assert client.post("/api/admin/logout").status_code == 200
        assert client.get("/api/admin/submissions").status_code == 401


def test_data_report_requires_category_and_accepts_missing_stop_report() -> None:
    with make_client() as client:
        payload = {
            "kind": "data_report",
            "title": "Missing stop on route 12C",
            "details": "The bus stops at this location, but it is not listed in the route details.",
        }
        response = client.post("/api/submissions", json=payload)
        assert response.status_code == 422

        accepted = client.post(
            "/api/submissions",
            json={**payload, "category": "missing_stop", "route_number": "12C", "stop_name": "Market Road"},
        )
        assert accepted.status_code == 201

        client.post("/api/admin/login", json={"username": "@subhajit de", "password": "password1234!"})
        reviewed = client.get("/api/admin/submissions")
        assert reviewed.status_code == 200
        assert reviewed.json()["items"][0]["category"] == "missing_stop"


def test_admin_rejects_incorrect_credentials() -> None:
    with make_client() as client:
        response = client.post("/api/admin/login", json={"username": "admin", "password": "not-it"})
        assert response.status_code == 401
