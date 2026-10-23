from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse

from auth import (
    ADMIN_COOKIE_NAME,
    ADMIN_USERNAME,
    credentials_are_valid,
    create_session_token,
    verify_session_token,
)
from config import Settings
from schemas import AdminLogin, SubmissionCreate
from store import StorageUnavailable, SubmissionStore

load_dotenv()


def create_app(store: SubmissionStore | None = None, settings: Settings | None = None) -> FastAPI:
    app_settings = settings or Settings.from_env()
    submission_store = store or SubmissionStore(app_settings.mongo_uri, app_settings.mongo_database)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = app_settings
        app.state.store = submission_store
        yield
        submission_store.close()

    app = FastAPI(
        title="Cholo Community Desk API",
        description="Collects feature ideas and bus data corrections for the Cholo Kolkata bus guide.",
        version="1.0.0",
        lifespan=lifespan,
    )
    # Set state immediately as well, so TestClient and ASGI callers can use the app
    # without relying on a startup hook.
    app.state.settings = app_settings
    app.state.store = submission_store

    @app.exception_handler(StorageUnavailable)
    async def storage_unavailable_handler(_: Request, __: StorageUnavailable) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Submission storage is temporarily unavailable. Please try again shortly."},
        )

    def require_admin(request: Request) -> None:
        token = request.cookies.get(ADMIN_COOKIE_NAME)
        if not verify_session_token(token, request.app.state.settings.admin_session_secret):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin sign-in required.")

    @app.get("/api/health")
    def health(request: Request) -> dict[str, str]:
        request.app.state.store.ping()
        return {"status": "ok", "storage": request.app.state.store.mode}

    @app.post("/api/submissions", status_code=status.HTTP_201_CREATED)
    def create_submission(submission: SubmissionCreate, request: Request) -> dict[str, str]:
        stored = request.app.state.store.create(submission.model_dump(exclude_none=True))
        return {"id": stored["id"], "message": "Thanks — your suggestion has been received."}

    @app.post("/api/admin/login")
    def admin_login(payload: AdminLogin, request: Request, response: Response) -> dict[str, bool]:
        if not credentials_are_valid(payload.username, payload.password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Those sign-in details did not match.")
        settings: Settings = request.app.state.settings
        token = create_session_token(settings.admin_session_secret, settings.session_ttl_seconds)
        response.set_cookie(
            key=ADMIN_COOKIE_NAME,
            value=token,
            max_age=settings.session_ttl_seconds,
            httponly=True,
            secure=settings.admin_cookie_secure,
            samesite="strict",
            path="/",
        )
        return {"authenticated": True}

    @app.get("/api/admin/me")
    def admin_me(_: None = Depends(require_admin)) -> dict[str, str | bool]:
        return {"authenticated": True, "username": ADMIN_USERNAME}

    @app.get("/api/admin/submissions")
    def admin_submissions(
        request: Request,
        _: None = Depends(require_admin),
        kind: Literal["feature", "data_report"] | None = Query(default=None),
        limit: int = Query(default=200, ge=1, le=500),
    ) -> dict[str, object]:
        items = request.app.state.store.list(kind=kind, limit=limit)
        return {"items": items, "count": len(items), "storage": request.app.state.store.mode}

    @app.post("/api/admin/logout")
    def admin_logout(response: Response) -> dict[str, bool]:
        response.delete_cookie(key=ADMIN_COOKIE_NAME, path="/", httponly=True, samesite="strict")
        return {"authenticated": False}

    return app


app = create_app()
