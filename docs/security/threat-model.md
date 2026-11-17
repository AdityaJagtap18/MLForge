# MLForge — Threat Model & Access Control (as of the Phase 2 hardening pass)

Status: reflects `feature/phase2-hardening`. Written by inspection, not verified by execution (see `docs/implementation-status.md`).

## Identities

- **User** (`api/db_models.py::User`): email + PBKDF2-SHA256 password hash (390,000 iterations, stdlib `hashlib`, no third-party hashing dependency). Authenticates via `POST /auth/login` or `/auth/register`, receiving an opaque bearer token.
- **SystemPrincipal** (`api/auth.py`): the legacy `MLFORGE_API_KEY` bypass. Has visibility across all users' jobs/registry entries (`current_user.id == "system"` short-circuits every ownership check). Intended for a trusted service account / CI, not end users.
- **Local-dev bypass**: when `MLFORGE_ENV` is unset or `development` (the default), no `MLFORGE_API_KEY` is set, and no `User` row exists yet, every request is treated as `SystemPrincipal`. This bypass **never applies** when `MLFORGE_ENV=production` (or any value other than `development`), regardless of whether a user exists -- a production deployment that forgets to set `MLFORGE_API_KEY` fails closed (401 on every request) rather than running open.

## Tokens

- Opaque 256-bit random tokens (`secrets.token_hex(32)`), returned to the caller exactly once.
- Only `SHA-256(token)` is stored (`AccessToken.token_hash`) -- a database read alone (backup, replication, insider, SQL injection elsewhere) cannot be used to authenticate as anyone.
- Default lifetime 30 days (`MLFORGE_TOKEN_TTL_DAYS`), enforced server-side on every request.
- Explicit revocation via `POST /auth/logout` (`revoked_at`).
- Not a JWT: no client-side claims to forge, no algorithm-confusion surface. The tradeoff is a DB lookup per request, judged acceptable at this scale.

## Ownership isolation

Every resource (`Job`, `ModelVersion`) carries an `owner_id`. `api/services.py::owns()` and `api/registry_service.py::_owner_filter()` are the two enforcement points:
- A resource lookup by ID for a non-owner returns **404**, never 403 -- existence of another user's resource is not confirmed.
- `owner_id IS NULL` (owned by `SystemPrincipal`) is its own isolated scope, not a wildcard.
- Registry version numbering, "current production" lookup, and rollback targets are all scoped the same way -- two users training a model with an identical catalog name cannot affect each other's lifecycle state (`tests/test_hardening.py::test_promotion_to_production_only_archives_same_owners_prior_production`).

## Artifact trust boundary

Trained models are `pickle`/`joblib`-style artifacts. This is a deserialization trust boundary:
- Artifacts are written only by `api/services.py::save_pipeline`, to a path derived from our own generated job id (never a client-supplied filename).
- Artifacts are loaded only via `api/services.py::load_pipeline`, called only with a path read back from our own DB row (`Job.pickle_path`) -- never a client-supplied path.
- The filesystem path itself is never included in any API response (`api/schemas.py::JobDetail`) -- an internal implementation detail, not something a client should see or control.

## What this does not cover yet

- Rate limiting on login attempts (no account lockout / backoff).
- Token rotation / refresh tokens (a token is valid for its full TTL or until revoked).
- Multi-tenant resource quotas.
- TLS/transport security is deployment-environment responsibility, not application code.
