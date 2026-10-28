# Pathsathi Community Desk API

FastAPI service for feature ideas and bus-network corrections. Submitted records are stored in MongoDB when `MONGODB_URI` is configured. If it is omitted, the app uses an in-memory store for local UI previews only; that data disappears when the process restarts.

## Run locally

```bash
cd user_input/backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Start MongoDB locally, then run:
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Interactive API docs: <http://localhost:8000/docs>

### Environment

- `MONGODB_URI`: Mongo connection string. Required for persistent submissions.
- `MONGODB_DATABASE`: database name (defaults to `pathsathi_user_input`).
- `ADMIN_SESSION_SECRET`: long random signing key; replace the example value before deployment.
- `ADMIN_COOKIE_SECURE`: set `true` behind HTTPS.

The requested simple admin credentials are hard-coded in `auth.py`: username `@subhajit de`, password `password1234!`. Replace them with a proper identity provider before exposing this service publicly.

## API

- `POST /api/submissions` — public feature idea or data report.
- `POST /api/admin/login` — sets an HTTP-only, signed session cookie.
- `GET /api/admin/me` — checks the admin session.
- `GET /api/admin/submissions` — read-only submissions list; accepts `kind=feature|data_report` and `limit`.
- `POST /api/admin/logout` — clears the admin cookie.
- `GET /api/health` — service and storage health.
