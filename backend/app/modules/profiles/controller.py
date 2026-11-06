
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.modules.profiles.models import Profile
from app.modules.profiles.schema import ProfileCreate, ProfileUpdate


def extract_user_id(current_user: dict) -> str:
    # auth.py returns {"id": user_id, "email": ...}
    user_id = current_user.get("id")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )

    return user_id


# CREATE PROFILE
def create_profile(
    db: Session,
    current_user: dict,
    profile_data: ProfileCreate
):
    user_id = extract_user_id(current_user)

    existing_profile = db.query(Profile).filter(
        Profile.user_id == user_id
    ).first()

    if existing_profile:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Profile already exists"
        )

    new_profile = Profile(
        user_id=user_id,
        name=profile_data.name,
        year=profile_data.year,
        branch=profile_data.branch,
        semester=profile_data.semester,
        bio=profile_data.bio
    )

    try:
        db.add(new_profile)
        db.commit()
        db.refresh(new_profile)
        return new_profile

    except Exception:
        db.rollback()
        raise


# READ PROFILE
def get_my_profile(
    db: Session,
    current_user: dict
):
    user_id = extract_user_id(current_user)

    profile = db.query(Profile).filter(
        Profile.user_id == user_id
    ).first()

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found"
        )

    return profile


# UPDATE PROFILE
def update_my_profile(
    db: Session,
    current_user: dict,
    profile_data: ProfileUpdate
):
    user_id = extract_user_id(current_user)

    profile = db.query(Profile).filter(
        Profile.user_id == user_id
    ).first()

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found"
        )

    update_data = profile_data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(profile, field, value)

    try:
        db.commit()
        db.refresh(profile)
        return profile

    except Exception:
        db.rollback()
        raise


# DELETE PROFILE
def delete_my_profile(
    db: Session,
    current_user: dict
):
    user_id = extract_user_id(current_user)

    profile = db.query(Profile).filter(
        Profile.user_id == user_id
    ).first()

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found"
        )

    try:
        db.delete(profile)
        db.commit()

    except Exception:
        db.rollback()
        raise
