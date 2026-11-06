from typing import Literal

from fastapi import (
    APIRouter,
    Depends,
    Query
)

from sqlalchemy.orm import Session

from app.dependencies.database import get_db

from app.modules.bus_schedule import controller

from app.modules.bus_schedule.schema import BusTripResponse


router = APIRouter(
    prefix="/bus-schedule",
    tags=["Bus Schedule"]
)


@router.get(
    "/trips",
    response_model=list[BusTripResponse]
)
def get_bus_trips(

    bus_number: Literal["B1", "B2", "B3"] | None = None,

    schedule_type: Literal[
        "regular",
        "weekend_holiday"
    ] | None = None,

    stop: str | None = Query(
        default=None,
        min_length=1,
        max_length=100
    ),

    db: Session = Depends(get_db)

):

    return controller.get_bus_trips(
        db=db,
        bus_number=bus_number,
        schedule_type=schedule_type,
        stop=stop
    )


@router.get(
    "/trips/{trip_id}",
    response_model=BusTripResponse
)
def get_bus_trip(

    trip_id: int,

    db: Session = Depends(get_db)

):

    return controller.get_bus_trip(
        db=db,
        trip_id=trip_id
    )

@router.get(
    "/day/{day}",
    response_model=list[BusTripResponse]
)
def get_schedule_for_day(

    day: Literal[
        "MON", "TUE", "WED",
        "THU", "FRI", "SAT", "SUN"
    ],

    holiday: bool = False,

    db: Session = Depends(get_db)

):

    return controller.get_schedule_for_day(
        db=db,
        day=day,
        holiday=holiday
    )