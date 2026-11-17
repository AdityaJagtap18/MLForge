from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from api.auth import hash_password, issue_token, revoke_token, verify_password
from api.db import get_db
from api.db_models import User
from api.schemas import LoginRequest, LogoutResponse, RegisterRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first() is not None:
        raise HTTPException(status_code=400, detail="An account with that email already exists.")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    user = User(email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token = issue_token(db, user)
    return TokenResponse(access_token=token, user_id=user.id, email=user.email)


@router.post("/logout", response_model=LogoutResponse)
def logout(db: Session = Depends(get_db), authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=400, detail="Provide the token to revoke as a Bearer Authorization header.")
    token = authorization.removeprefix("Bearer ").strip()
    revoked = revoke_token(db, token)
    return LogoutResponse(revoked=revoked)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = issue_token(db, user)
    return TokenResponse(access_token=token, user_id=user.id, email=user.email)
