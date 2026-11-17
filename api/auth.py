"""Password hashing + opaque bearer tokens for Phase 2 user accounts.

Uses stdlib hashlib.pbkdf2_hmac rather than adding a third-party hashing
dependency (bcrypt/argon2) that this environment has no way to verify
installs cleanly. If you want bcrypt/argon2 instead, swap hash_password/
verify_password -- nothing else depends on the algorithm choice.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from api import deps
from api.db import get_db
from api.db_models import AccessToken, User

_PBKDF2_ITERATIONS = 390_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt_hex, digest_hex = password_hash.split("$", 1)
    except ValueError:
        return False
    salt = bytes.fromhex(salt_hex)
    expected = bytes.fromhex(digest_hex)
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return hmac.compare_digest(actual, expected)


def issue_token(db: Session, user: User) -> str:
    token = secrets.token_hex(32)
    db.add(AccessToken(token=token, user_id=user.id))
    db.commit()
    return token


class SystemPrincipal:
    """Returned by get_current_user when the legacy MLFORGE_API_KEY (FR-AUTH-01)
    is presented instead of a user token -- bypasses per-user ownership
    scoping, same as Phase 1 behavior. Kept for CI/service-account use;
    prefer per-user tokens for anything else."""

    id = "system"
    email = "system"


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    if deps.API_KEY is not None and x_api_key == deps.API_KEY:
        return SystemPrincipal()

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    access_token = db.get(AccessToken, token)
    if access_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user = db.get(User, access_token.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return user


def require_auth_if_configured(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    """Local-dev escape hatch: if no users exist yet and no API key is
    configured, auth is skipped entirely (same Phase 1 dev convenience).
    Otherwise defers to get_current_user."""
    if deps.API_KEY is None and db.query(User).first() is None:
        return SystemPrincipal()
    return get_current_user(db=db, authorization=authorization, x_api_key=x_api_key)
