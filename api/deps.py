from __future__ import annotations

import os

# FR-AUTH-01 (Phase 1): single shared API key, usable as a service-account
# bypass on top of Phase 2's per-user auth -- see api/auth.py
# (SystemPrincipal / require_auth_if_configured), which is what routers
# actually depend on now. No key configured => falls back to Phase 1's
# local-dev convenience (auth skipped until the first user registers).
API_KEY = os.environ.get("MLFORGE_API_KEY")
