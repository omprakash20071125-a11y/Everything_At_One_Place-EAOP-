from sqlalchemy import (
    Column,
    BigInteger,
    Integer,
    String,
    Text,
    Time,
    CheckConstraint,
    UniqueConstraint
)

from app.db.base import Base


class BusTrip(Base):

    __tablename__ = "bus_trips"

    __table_args__ = (

        CheckConstraint(
            "bus_number IN ('B1', 'B2', 'B3')",
            name="check_bus_number"
        ),

        CheckConstraint(
            "schedule_type IN ('regular', 'weekend_holiday')",
            name="check_schedule_type"
        ),

        UniqueConstraint(
            "bus_number",
            "schedule_type",
            "departure_time",
            "origin",
            "destination",
            name="unique_bus_trip"
        ),
    )

    id = Column(
        BigInteger,
        primary_key=True,
        autoincrement=True
    )

    bus_number = Column(
        String(2),
        nullable=False,
        index=True
    )

    schedule_type = Column(
        String(30),
        nullable=False,
        index=True
    )

    departure_time = Column(
        Time,
        nullable=False
    )

    origin = Column(
        String(150),
        nullable=False
    )

    arrival_time = Column(
        Time,
        nullable=False
    )

    destination = Column(
        String(150),
        nullable=False
    )

    route = Column(
        Text,
        nullable=False
    )

    source_page = Column(
        Integer,
        nullable=False
    )