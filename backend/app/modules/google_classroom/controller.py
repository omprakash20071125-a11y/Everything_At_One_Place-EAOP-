
import os
import uuid
import secrets
import logging
import requests

# Allow OAuth token exchange when Google returns a different scope set.
# We still validate the actual granted permissions below.
os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"

from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from google.auth.exceptions import GoogleAuthError, RefreshError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from google.oauth2.credentials import Credentials

from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.google_classroom.models import (
    GoogleClassroomConnection,
    GoogleOAuthState,
)

logger = logging.getLogger(__name__)


# ==========================================
# GOOGLE CONFIGURATION
# ==========================================

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
]

REQUIRED_CLASSROOM_SCOPES = {
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
}

GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/auth"

STATE_TTL_MINUTES = 10


# ==========================================
# SETTINGS
# ==========================================

def required_setting(name: str) -> str:
    value = getattr(settings, name, None)

    if not value:
        raise HTTPException(
            status_code=500,
            detail=f"Missing {name} in backend configuration.",
        )

    return str(value)


# ==========================================
# FERNET ENCRYPTION
# ==========================================

def get_fernet() -> Fernet:
    key = required_setting(
        "GOOGLE_TOKEN_ENCRYPTION_KEY"
    ).encode("utf-8")

    try:
        return Fernet(key)

    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=500,
            detail="Invalid Google token encryption key.",
        ) from exc


def encrypt_token(token: str) -> str:
    return get_fernet().encrypt(
        token.encode("utf-8")
    ).decode("utf-8")


def decrypt_token(encrypted_token: str) -> str:
    try:
        return get_fernet().decrypt(
            encrypted_token.encode("utf-8")
        ).decode("utf-8")

    except InvalidToken as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to decrypt Google refresh token. Check encryption key.",
        ) from exc


# ==========================================
# GOOGLE OAUTH FLOW
# ==========================================

def create_google_flow(
    state: str | None = None,
    code_verifier: str | None = None,
) -> Flow:

    client_config = {
        "web": {
            "client_id": required_setting("GOOGLE_CLIENT_ID"),
            "client_secret": required_setting("GOOGLE_CLIENT_SECRET"),
            "auth_uri": GOOGLE_AUTH_URI,
            "token_uri": GOOGLE_TOKEN_URI,
            "redirect_uris": [
                required_setting("GOOGLE_REDIRECT_URI")
            ],
        }
    }

    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        state=state,
        code_verifier=code_verifier,
        autogenerate_code_verifier=(code_verifier is None),
    )

    flow.redirect_uri = required_setting(
        "GOOGLE_REDIRECT_URI"
    )

    return flow


# ==========================================
# NORMALIZE GOOGLE SCOPES
# ==========================================

def normalize_scopes(scopes: Any) -> set[str]:

    if not scopes:
        return set()

    if isinstance(scopes, str):
        return set(scopes.split())

    return set(scopes)


# ==========================================
# 1. START GOOGLE CONNECTION
# ==========================================

def start_google_connect(
    db: Session,
    current_user: dict[str, Any],
):

    user_id = uuid.UUID(str(current_user["id"]))
    now = datetime.now(timezone.utc)

    try:
        # Remove expired OAuth states.
        db.query(GoogleOAuthState).filter(
            GoogleOAuthState.expires_at < now
        ).delete(synchronize_session=False)

        state = secrets.token_urlsafe(32)

        flow = create_google_flow(state=state)

        authorization_url, state = flow.authorization_url(
            access_type="offline",
            prompt="select_account consent",
        )

        if not flow.code_verifier:
            raise RuntimeError(
                "Google PKCE code verifier was not generated."
            )

        # Log requested scopes without logging tokens or authorization codes.
        from urllib.parse import urlparse, parse_qs

        requested_scopes = parse_qs(
            urlparse(authorization_url).query
        ).get("scope", [])

        logger.info(
            "Google OAuth requested scopes: %s",
            requested_scopes,
        )

        oauth_state = GoogleOAuthState(
            state=state,
            user_id=user_id,
            code_verifier=flow.code_verifier,
            expires_at=now + timedelta(
                minutes=STATE_TTL_MINUTES
            ),
        )

        db.add(oauth_state)
        db.commit()

        return {
            "authorization_url": authorization_url
        }

    except Exception:
        db.rollback()
        logger.exception("Failed to start Google OAuth")
        raise


# ==========================================
# 2. COMPLETE GOOGLE OAUTH CONNECTION
# ==========================================

def complete_google_connect(
    db: Session,
    code: str,
    state: str,
    oauth_error: str | None = None,
):

    state_row = db.query(
        GoogleOAuthState
    ).filter(
        GoogleOAuthState.state == state
    ).first()

    if not state_row:
        raise HTTPException(
            status_code=400,
            detail="Invalid or already-used OAuth state.",
        )

    now = datetime.now(timezone.utc)
    expires_at = state_row.expires_at

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(
            tzinfo=timezone.utc
        )

    if expires_at < now:
        db.delete(state_row)
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="OAuth state expired. Please connect again.",
        )

    user_id = state_row.user_id
    code_verifier = state_row.code_verifier

    # Consume one-time OAuth state.
    db.delete(state_row)
    db.commit()

    if oauth_error:
        raise HTTPException(
            status_code=400,
            detail=f"Google authorization failed: {oauth_error}",
        )

    if not code:
        raise HTTPException(
            status_code=400,
            detail="Google did not return an authorization code.",
        )

    if not code_verifier:
        raise HTTPException(
            status_code=400,
            detail="Missing PKCE verifier. Please reconnect.",
        )

    try:
        flow = create_google_flow(
            state=state,
            code_verifier=code_verifier,
        )

        # Exchange authorization code for tokens.
        flow.fetch_token(code=code)

        credentials = flow.credentials

        if not credentials.id_token:
            raise HTTPException(
                status_code=400,
                detail="Google did not return an ID token.",
            )

        # Verify Google identity.
        google_identity = id_token.verify_oauth2_token(
            credentials.id_token,
            GoogleRequest(),
            required_setting("GOOGLE_CLIENT_ID"),
        )

        google_user_id = google_identity.get("sub")
        google_email = google_identity.get("email")

        if not google_user_id or not google_email:
            raise HTTPException(
                status_code=400,
                detail="Google account identity is missing.",
            )

        if not google_identity.get("email_verified", False):
            raise HTTPException(
                status_code=400,
                detail="Google email is not verified.",
            )

        # Validate actual granted permissions.
        granted_scopes = normalize_scopes(
            getattr(credentials, "granted_scopes", None)
            or credentials.scopes
        )

        missing_scopes = (
            REQUIRED_CLASSROOM_SCOPES - granted_scopes
        )

        if missing_scopes:
            logger.error(
                "Google did not grant required scopes. "
                "Granted: %s | Missing: %s",
                sorted(granted_scopes),
                sorted(missing_scopes),
            )

            raise HTTPException(
                status_code=403,
                detail=(
                    "Google connected without the required Classroom "
                    "permissions. The assignments feature requires "
                    "classroom.coursework.me.readonly."
                ),
            )

        # Find existing EAOP connection.
        existing = db.query(
            GoogleClassroomConnection
        ).filter(
            GoogleClassroomConnection.user_id == user_id
        ).first()

        refresh_token = credentials.refresh_token

        if not refresh_token and existing:
            refresh_token = decrypt_token(
                existing.encrypted_refresh_token
            )

        if not refresh_token:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Google did not return a refresh token. "
                    "Please reconnect and approve offline access."
                ),
            )

        encrypted_refresh_token = encrypt_token(
            refresh_token
        )

        if existing:
            existing.google_user_id = str(google_user_id)
            existing.google_email = str(google_email)

            existing.encrypted_refresh_token = (
                encrypted_refresh_token
            )

            existing.granted_scopes = sorted(
                granted_scopes
            )

            existing.updated_at = datetime.now(
                timezone.utc
            )

        else:
            connection = GoogleClassroomConnection(
                user_id=user_id,
                google_user_id=str(google_user_id),
                google_email=str(google_email),
                encrypted_refresh_token=encrypted_refresh_token,
                granted_scopes=sorted(granted_scopes),
            )

            db.add(connection)

        db.commit()

        logger.info(
            "Google Classroom connected for EAOP user %s",
            user_id,
        )

        return {
            "connected": True,
            "google_email": str(google_email),
        }

    except HTTPException:
        db.rollback()
        raise

    except (GoogleAuthError, ValueError, TypeError) as exc:
        db.rollback()

        logger.exception(
            "Google OAuth verification or token exchange failed"
        )

        raise HTTPException(
            status_code=400,
            detail="Google OAuth verification failed. Please reconnect.",
        ) from exc

    except Exception as exc:
        db.rollback()

        logger.exception(
            "Google Classroom OAuth callback failed"
        )

        raise HTTPException(
            status_code=502,
            detail="Unable to complete Google Classroom connection.",
        ) from exc


# ==========================================
# FIND CONNECTED GOOGLE ACCOUNT
# ==========================================

def get_connection(
    db: Session,
    user_id: str,
) -> GoogleClassroomConnection:

    try:
        parsed_user_id = uuid.UUID(str(user_id))

    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid EAOP user identity.",
        ) from exc

    connection = db.query(
        GoogleClassroomConnection
    ).filter(
        GoogleClassroomConnection.user_id == parsed_user_id
    ).first()

    if not connection:
        raise HTTPException(
            status_code=404,
            detail="Google Classroom is not connected.",
        )

    return connection


# ==========================================
# 3. CHECK CONNECTION STATUS
# ==========================================

def classroom_status(
    db: Session,
    user_id: str,
):

    try:
        connection = get_connection(
            db,
            user_id,
        )

        return {
            "connected": True,
            "google_email": connection.google_email,
            "connected_at": connection.created_at,
            "scopes": connection.granted_scopes or [],
        }

    except HTTPException as exc:
        if exc.status_code == 404:
            return {
                "connected": False,
                "google_email": None,
                "connected_at": None,
                "scopes": [],
            }

        raise


# ==========================================
# CREATE AUTHENTICATED CLASSROOM SERVICE
# ==========================================

def get_classroom_service(
    db: Session,
    user_id: str,
):

    connection = get_connection(
        db,
        user_id,
    )

    refresh_token = decrypt_token(
        connection.encrypted_refresh_token
    )

    credentials = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri=GOOGLE_TOKEN_URI,
        client_id=required_setting("GOOGLE_CLIENT_ID"),
        client_secret=required_setting("GOOGLE_CLIENT_SECRET"),
        scopes=connection.granted_scopes or SCOPES,
    )

    try:
        credentials.refresh(GoogleRequest())

    except RefreshError as exc:
        logger.exception(
            "Google refresh token was rejected"
        )

        raise HTTPException(
            status_code=401,
            detail=(
                "Google authorization expired or was revoked. "
                "Disconnect and reconnect Google Classroom."
            ),
        ) from exc

    except GoogleAuthError as exc:
        logger.exception(
            "Google credential refresh failed"
        )

        raise HTTPException(
            status_code=502,
            detail="Could not refresh Google authorization.",
        ) from exc

    return build(
        "classroom",
        "v1",
        credentials=credentials,
        cache_discovery=False,
    )


# ==========================================
# GOOGLE API ERROR HANDLING
# ==========================================

def handle_google_api_error(exc: HttpError):

    code = getattr(
        exc.resp,
        "status",
        0,
    )

    logger.error(
        "Google Classroom API request failed with HTTP %s: %s",
        code,
        exc,
    )

    if code == 401:
        raise HTTPException(
            status_code=401,
            detail="Google authorization expired. Reconnect Classroom.",
        ) from exc

    if code == 403:
        raise HTTPException(
            status_code=403,
            detail=(
                "Google Classroom denied access. "
                "Check account membership, API enablement and OAuth scopes."
            ),
        ) from exc

    if code == 404:
        raise HTTPException(
            status_code=404,
            detail="Classroom course was not found or is not accessible.",
        ) from exc

    raise HTTPException(
        status_code=502,
        detail=f"Google Classroom API request failed (HTTP {code}).",
    ) from exc


# ==========================================
# 4. FETCH GOOGLE CLASSROOM COURSES
# ==========================================

def list_courses(
    db: Session,
    user_id: str,
):

    service = get_classroom_service(
        db,
        user_id,
    )

    courses = []
    page_token = None

    try:
        while True:
            response = service.courses().list(
                pageSize=100,
                pageToken=page_token,
            ).execute()

            courses.extend(
                response.get("courses", [])
            )

            page_token = response.get("nextPageToken")

            if not page_token:
                break

    except HttpError as exc:
        handle_google_api_error(exc)

    return [
        {
            "id": str(course.get("id", "")),
            "name": course.get("name"),
            "section": course.get("section"),
            "description": course.get("description"),
            "room": course.get("room"),
            "owner_id": course.get("ownerId"),
            "course_state": course.get("courseState"),
            "alternate_link": course.get("alternateLink"),
        }
        for course in courses
    ]


# ==========================================
# 5. FETCH COURSE ASSIGNMENTS
# ==========================================

def list_course_assignments(
    db: Session,
    user_id: str,
    course_id: str,
):

    service = get_classroom_service(
        db,
        user_id,
    )

    assignments = []
    page_token = None

    try:
        while True:
            response = service.courses().courseWork().list(
                courseId=course_id,
                pageSize=100,
                pageToken=page_token,
            ).execute()

            assignments.extend(
                response.get("courseWork", [])
            )

            page_token = response.get("nextPageToken")

            if not page_token:
                break

    except HttpError as exc:
        handle_google_api_error(exc)

    normalized_assignments = []

    for assignment in assignments:
        due_date = assignment.get("dueDate") or {}
        due_time = assignment.get("dueTime") or {}

        due_date_value = None
        due_time_value = None

        if due_date:
            due_date_value = (
                f"{int(due_date['year']):04d}-"
                f"{int(due_date['month']):02d}-"
                f"{int(due_date['day']):02d}"
            )

        if due_time:
            due_time_value = (
                f"{int(due_time.get('hours', 0)):02d}:"
                f"{int(due_time.get('minutes', 0)):02d}:"
                f"{int(due_time.get('seconds', 0)):02d}"
            )

        normalized_assignments.append(
            {
                "id": str(assignment.get("id", "")),
                "course_id": course_id,
                "title": assignment.get("title"),
                "description": assignment.get("description"),
                "state": assignment.get("state"),
                "work_type": assignment.get("workType"),
                "due_date": due_date_value,
                "due_time": due_time_value,
                "max_points": assignment.get("maxPoints"),
                "alternate_link": assignment.get("alternateLink"),
                "creation_time": assignment.get("creationTime"),
                "update_time": assignment.get("updateTime"),
            }
        )

    return normalized_assignments


# ==========================================
# 6. DISCONNECT GOOGLE CLASSROOM
# ==========================================

def disconnect_google_classroom(
    db: Session,
    user_id: str,
):

    connection = get_connection(
        db,
        user_id,
    )

    refresh_token = decrypt_token(
        connection.encrypted_refresh_token
    )

    # Best-effort Google token revocation.
    try:
        response = requests.post(
            "https://oauth2.googleapis.com/revoke",
            params={
                "token": refresh_token,
            },
            headers={
                "content-type": "application/x-www-form-urlencoded",
            },
            timeout=10,
        )

        if response.status_code not in (200, 400):
            logger.warning(
                "Google token revocation returned HTTP %s",
                response.status_code,
            )

    except requests.RequestException:
        logger.exception(
            "Google token revocation request failed"
        )

    # Delete local connection.
    try:
        db.delete(connection)
        db.commit()

    except Exception:
        db.rollback()

        logger.exception(
            "Failed to delete Google Classroom connection"
        )

        raise

    return {
        "disconnected": True,
    }