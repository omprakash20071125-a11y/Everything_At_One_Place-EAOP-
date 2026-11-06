from uuid import UUID
from pydantic import BaseModel, Field, model_validator


class ProfileCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    year: int = Field(ge=1, le=4)
    branch: str = Field(min_length=2, max_length=100)
    semester: int = Field(ge=1, le=8)
    bio: str | None = None


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    year: int | None = Field(default=None, ge=1, le=4)
    branch: str | None = Field(default=None, min_length=2, max_length=100)
    semester: int | None = Field(default=None, ge=1, le=8)
    bio: str | None = None

    @model_validator(mode="after")
    def check_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self

class ProfileResponse(BaseModel):
    id: int
    user_id: UUID  # Correct
    name: str
    year: int
    branch: str
    semester: int
    bio: str | None

    model_config = {"from_attributes": True}