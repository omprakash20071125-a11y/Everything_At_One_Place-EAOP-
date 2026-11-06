from pydantic import BaseModel, ConfigDict
from datetime import time
from typing import Literal


class BusTripImport(BaseModel):

    bus_number: Literal["B1", "B2", "B3"]

    schedule_type: Literal[
        "regular",
        "weekend_holiday"
    ]

    departure_time: str
    origin: str

    arrival_time: str
    destination: str

    route: str

    source_page: int

    needs_review: bool = True
    review_notes: str | None = None


class BusScheduleImport(BaseModel):

    trips: list[BusTripImport]


class BusTripResponse(BaseModel):

    id: int

    bus_number: str
    schedule_type: str

    departure_time: time
    origin: str

    arrival_time: time
    destination: str

    route: str

    source_page: int

    model_config = ConfigDict(
        from_attributes=True
    )