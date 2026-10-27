# KonBus Community Desk

A standalone suggestion portal for the KonBus Kolkata bus guide. It has two public submission pages (feature ideas and bus-network corrections) and a private read-only admin area.

- `frontend/` — Next.js app. Browser requests use relative `/api` URLs; Next rewrites them to FastAPI.
- `backend/` — FastAPI API with MongoDB storage (in-memory development fallback when `MONGODB_URI` is unset).

See [frontend/README.md](frontend/README.md) and [backend/README.md](backend/README.md) for local setup. The requested admin username/password are documented in the backend README and hard-coded in `backend/auth.py`.
