from __future__ import annotations

import os

# FR-AUTH-01 (Phase 1): single shared API key, usable as a service-account
# bypass on top of Phase 2's per-user auth -- see api/auth.py
# (SystemPrincipal / require_auth_if_configured), which is what routers
# actually depend on now. No key configured => falls back to Phase 1's
# local-dev convenience (auth skipped until the first user registers) --
# but only when ENVIRONMENT is "development" (the default); see
# api/auth.py::require_auth_if_configured and docs/security.
API_KEY = os.environ.get("MLFORGE_API_KEY")

# "development" (default, permissive local-dev bypass) or "production"
# (bypass refused outright -- see api/auth.py). Anything else is treated as
# production, so a typo never silently grants the permissive behavior.
ENVIRONMENT = os.environ.get("MLFORGE_ENV", "development").strip().lower()
IS_PRODUCTION = ENVIRONMENT != "development"
