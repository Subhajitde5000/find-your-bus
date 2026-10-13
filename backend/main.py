"""FastAPI application entry point.

Run locally (from the backend folder):
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Interactive API docs: http://localhost:8000/docs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import api_router

app = FastAPI(
    title="Find Your Bus API",
    version="0.1.0",
    description="Kolkata bus stands, routes, buses and timetables.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(api_router)
