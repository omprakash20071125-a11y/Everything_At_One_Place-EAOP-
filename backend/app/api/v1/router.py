from fastapi import APIRouter

from app.modules.profiles.router import router as profile_router
from app.modules.bus_schedule.router import router as bus_schedule


api_router = APIRouter()

api_router.include_router(profile_router)
api_router.include_router(bus_schedule)
