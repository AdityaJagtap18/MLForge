"""Password hashing + opaque bearer tokens for Phase 2 user accounts.

Uses stdlib hashlib.pbkdf2_hmac rather than adding a third-party hashing
dependency (bcrypt/argon2) that this environment has no way to verify
installs cleanly. If you want bcrypt/argon2 instead, swap hash_password/
verify_password -- nothing else depends on the algorithm choice.

Tokens are opaque random strings; only their SHA-256 hash is ever stored
(AccessToken.token_hash) -- see api/db_models.py for why. Default lifetime
is MLFORGE_TOKEN_TTL_DAYS (30), enforced in get_current_user alongside
explicit revocation (logout).
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from api import deps
from api.db import get_db
from api.db_models import AccessToken, User

_PBKDF2_ITERATIONS = 390_000
_TOKEN_TTL = timedelta(days=int(os.environ.get("MLFORGE_TOKEN_TTL_DAYS", "30")))


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


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_token(db: Session, user: User) -> str:
    token = secrets.token_hex(32)
    now = datetime.now(timezone.utc)
    db.add(
        AccessToken(
            token_hash=_hash_token(token),
            user_id=user.id,
            created_at=now,
            expires_at=now + _TOKEN_TTL,
        )
    )
    db.commit()
    return token  # returned to the caller exactly once; never stored raw


def revoke_token(db: Session, token: str) -> bool:
    access_token = db.query(AccessToken).filter(AccessToken.token_hash == _hash_token(token)).first()
    if access_token is None or access_token.revoked_at is not None:
        return False
    access_token.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return True


class SystemPrincipal:
    """Returned by get_current_user when the legacy MLFORGE_API_KEY (FR-AUTH-01)
    is presented instead of a user token -- bypasses per-user ownership
    scoping, same as Phase 1 behavior. Kept for CI/service-account use;
    prefer per-user tokens for anything else."""

    id = "system"
    email = "system"


def _resolve_bearer_token(db: Session, authorization: str | None) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid Authorization header")

    raw_token = authorization.removeprefix("Bearer ").strip()
    access_token = db.query(AccessToken).filter(AccessToken.token_hash == _hash_token(raw_token)).first()
    if access_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    if access_token.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")
    expires_at = access_token.expires_at
    if expires_at is not None:
        # SQLite drops tzinfo on round-trip even for a DateTime(timezone=True)
        # column, so a value read back here can be naive even though it was
        # written as UTC-aware -- normalize before comparing, or this raises
        # TypeError on every authenticated request against SQLite.
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")

    user = db.get(User, access_token.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return user


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    if deps.API_KEY is not None and x_api_key == deps.API_KEY:
        return SystemPrincipal()
    return _resolve_bearer_token(db, authorization)


def require_auth_if_configured(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    """Local-dev escape hatch: with MLFORGE_ENV unset/"development" (the
    default) and no users registered yet and no API key configured, auth is
    skipped entirely. In production (MLFORGE_ENV=production, or anything
    other than "development") this bypass NEVER applies, regardless of
    whether any user exists yet -- a request with no valid API key or bearer
    token is always rejected, so a production deployment that simply forgot
    to set MLFORGE_API_KEY fails closed instead of silently running open."""
    if not deps.IS_PRODUCTION and deps.API_KEY is None and db.query(User).first() is None:
        return SystemPrincipal()
    if deps.API_KEY is not None and x_api_key == deps.API_KEY:
        return SystemPrincipal()
    return _resolve_bearer_token(db, authorization)
