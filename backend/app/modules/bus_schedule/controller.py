from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.modules.bus_schedule.models import BusTrip


def get_bus_trips(
    db: Session,
    bus_number: str | None = None,
    schedule_type: str | None = None,
    stop: str | None = None
):

    query = db.query(BusTrip)

    # Filter by bus number.

    if bus_number:

        query = query.filter(
            BusTrip.bus_number == bus_number
        )

    # Filter by schedule type.

    if schedule_type:

        query = query.filter(
            BusTrip.schedule_type == schedule_type
        )

    # Search for a stop in origin, destination or route.

    if stop:

        search = f"%{stop.strip()}%"

        query = query.filter(
            or_(
                BusTrip.origin.ilike(search),
                BusTrip.destination.ilike(search),
                BusTrip.route.ilike(search)
            )
        )

    return query.order_by(
        BusTrip.departure_time.asc(),
        BusTrip.bus_number.asc()
    ).all()


def get_bus_trip(
    db: Session,
    trip_id: int
):

    trip = db.query(BusTrip).filter(
        BusTrip.id == trip_id
    ).first()

    if not trip:

        raise HTTPException(
            status_code=404,
            detail="Bus trip not found"
        )

    return trip

def get_schedule_for_day(
    db: Session,
    day: str,
    holiday: bool = False
):

    day = day.upper()

    valid_days = {
        "MON", "TUE", "WED",
        "THU", "FRI", "SAT", "SUN"
    }

    if day not in valid_days:
        raise HTTPException(
            status_code=400,
            detail="Invalid day"
        )

    if day in {"SAT", "SUN"} or holiday:
        schedule_type = "weekend_holiday"
    else:
        schedule_type = "regular"

    return db.query(BusTrip).filter(
        BusTrip.schedule_type == schedule_type
    ).order_by(
        BusTrip.departure_time.asc(),
        BusTrip.bus_number.asc()
    ).all()