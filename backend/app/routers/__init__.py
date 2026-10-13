from fastapi import APIRouter

from app.routers import buses, health, journeys, operators, routes, stands, stops

api_router = APIRouter(prefix="/api/v1")
for module in (health, operators, stands, stops, routes, buses, journeys):
    api_router.include_router(module.router)
