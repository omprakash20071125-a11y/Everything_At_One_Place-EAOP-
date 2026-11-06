import uuid

from sqlalchemy import Column, BigInteger, String, Integer, Text
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(BigInteger, primary_key=True, index=True)

    user_id = Column(
        UUID(as_uuid=True),
        unique=True,
        nullable=False,
        index=True
    )

    name = Column(String(100), nullable=False)
    year = Column(Integer, nullable=False)
    branch = Column(String(100), nullable=False)
    semester = Column(Integer, nullable=False)
    bio = Column(Text, nullable=True)