from fastapi import APIRouter

from app.modules.profiles.router import router as profile_router
from app.modules.bus_schedule.router import router as bus_schedule

from app.modules.google_classroom.router import (
    router as google_classroom_router
)


api_router = APIRouter()


api_router.include_router(profile_router)

api_router.include_router(bus_schedule)

api_router.include_router(google_classroom_router)