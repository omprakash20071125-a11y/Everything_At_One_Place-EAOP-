from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies.database import get_db
from app.dependencies.auth import get_current_user

from app.modules.google_classroom import controller

from app.modules.google_classroom.schema import (
    ClassroomAssignmentResponse,
    ClassroomConnectResponse,
    ClassroomCourseResponse,
    ClassroomStatusResponse,
)


router = APIRouter(
    prefix="/classroom",
    tags=["Google Classroom"],
)


# ==========================================
# 1. CONNECT GOOGLE CLASSROOM
# ==========================================

@router.post(
    "/connect",
    response_model=ClassroomConnectResponse,
)
def connect_google_classroom(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):

    return controller.start_google_connect(
        db,
        current_user,
    )


# ==========================================
# 2. GOOGLE OAUTH CALLBACK
# ==========================================

@router.get("/callback")
def google_classroom_callback(
    code: str | None = Query(default=None),
    state: str = Query(...),
    error: str | None = Query(default=None),
    db: Session = Depends(get_db),
):

    return controller.complete_google_connect(
        db=db,
        code=code or "",
        state=state,
        oauth_error=error,
    )


# ==========================================
# 3. CONNECTION STATUS
# ==========================================

@router.get(
    "/status",
    response_model=ClassroomStatusResponse,
)
def get_google_classroom_status(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):

    return controller.classroom_status(
        db,
        current_user["id"],
    )


# ==========================================
# 4. GET ALL COURSES
# ==========================================

@router.get(
    "/courses",
    response_model=list[ClassroomCourseResponse],
)
def get_classroom_courses(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):

    return controller.list_courses(
        db,
        current_user["id"],
    )


# ==========================================
# 5. GET COURSE ASSIGNMENTS
# ==========================================

@router.get(
    "/courses/{course_id}/assignments",
    response_model=list[ClassroomAssignmentResponse],
)
def get_course_assignments(
    course_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):

    return controller.list_course_assignments(
        db,
        current_user["id"],
        course_id,
    )


# ==========================================
# 6. DISCONNECT GOOGLE CLASSROOM
# ==========================================

@router.delete("/disconnect")
def disconnect_google_classroom(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):

    return controller.disconnect_google_classroom(
        db,
        current_user["id"],
    )