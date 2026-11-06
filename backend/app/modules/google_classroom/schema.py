from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# -----------------------------------------
# CONNECT GOOGLE CLASSROOM
# -----------------------------------------

class ClassroomConnectResponse(BaseModel):

    authorization_url: str


# -----------------------------------------
# GOOGLE CLASSROOM CONNECTION STATUS
# -----------------------------------------

class ClassroomStatusResponse(BaseModel):

    connected: bool

    google_email: str | None = None

    connected_at: datetime | None = None

    scopes: list[str] = Field(default_factory=list)


# -----------------------------------------
# GOOGLE CLASSROOM COURSE
# -----------------------------------------

class ClassroomCourseResponse(BaseModel):

    model_config = ConfigDict(extra="ignore")

    id: str

    name: str | None = None

    section: str | None = None

    description: str | None = None

    room: str | None = None

    owner_id: str | None = None

    course_state: str | None = None

    alternate_link: str | None = None


# -----------------------------------------
# GOOGLE CLASSROOM ASSIGNMENT
# -----------------------------------------

class ClassroomAssignmentResponse(BaseModel):

    model_config = ConfigDict(extra="ignore")

    id: str

    course_id: str

    title: str | None = None

    description: str | None = None

    state: str | None = None

    work_type: str | None = None

    due_date: str | None = None

    due_time: str | None = None

    max_points: float | None = None

    alternate_link: str | None = None

    creation_time: str | None = None

    update_time: str | None = None