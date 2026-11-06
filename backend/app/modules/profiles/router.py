from fastapi import APIRouter, Depends, status, Response
from sqlalchemy.orm import Session

from app.dependencies.database import get_db
from app.dependencies.auth import get_current_user

from app.modules.profiles import controller

from app.modules.profiles.schema import (
    ProfileCreate,
    ProfileUpdate,
    ProfileResponse
)


router = APIRouter(
    prefix="/profiles",
    tags=["Profiles"]
)


# Create Profile
@router.post(
    "/",
    response_model=ProfileResponse,
    status_code=status.HTTP_201_CREATED
)
def create_profile(
    profile_data: ProfileCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):

    return controller.create_profile(
        db=db,
        current_user=current_user,
        profile_data=profile_data
    )


# Get Logged-in User's Profile
@router.get(
    "/me",
    response_model=ProfileResponse
)
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):

    return controller.get_my_profile(
        db=db,
        current_user=current_user
    )


# Update Logged-in User's Profile
@router.patch(
    "/me",
    response_model=ProfileResponse
)
def update_my_profile(
    profile_data: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):

    return controller.update_my_profile(
        db=db,
        current_user=current_user,
        profile_data=profile_data
    )


# Delete Logged-in User's Profile
@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_my_profile(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):

    controller.delete_my_profile(
        db=db,
        current_user=current_user
    )

    return Response(status_code=status.HTTP_204_NO_CONTENT)