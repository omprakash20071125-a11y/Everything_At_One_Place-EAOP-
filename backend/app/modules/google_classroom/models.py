
import uuid

from datetime import datetime

from sqlalchemy import (
    DateTime,
    String,
    Text,
    Uuid,
    func,
)

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class GoogleClassroomConnection(Base):

    __tablename__ = "google_classroom_connections"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Supabase authenticated user's UUID
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        unique=True,
        index=True,
    )

    # Google account details
    google_user_id: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    google_email: Mapped[str] = mapped_column(
        String(320),
        nullable=False,
    )

    # Encrypted Google refresh token
    encrypted_refresh_token: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    # Google OAuth permissions
    granted_scopes: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class GoogleOAuthState(Base):

    __tablename__ = "google_oauth_states"

    # Random one-time OAuth state
    state: Mapped[str] = mapped_column(
        String(128),
        primary_key=True,
    )

    # EAOP user who initiated Google connection
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        index=True,
    )

    # PKCE verifier used during token exchange
    code_verifier: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )