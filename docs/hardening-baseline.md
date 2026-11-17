# Phase 2 Hardening — Baseline Assessment

Branch: `feature/phase2-hardening`, cut from `feature/mlforge-mlops-foundation` (3 commits ahead of `origin/main`: Phase 0 docs, Phase 1, Phase 2). Working tree was clean at branch creation (only the untracked `UIDesign/` reference image, left alone).

## What exists (confirmed by inspection, not execution)

- Auth: `api/auth.py` issues raw opaque tokens (`secrets.token_hex(32)`) stored **in plaintext** in `access_tokens.token` (the primary key itself), no expiry, no revocation endpoint. `require_auth_if_configured` bypasses auth whenever `MLFORGE_API_KEY` is unset and no `User` row exists yet -- this has no environment gate, so it would also apply in a production deployment that simply hasn't set `MLFORGE_API_KEY`.
- Registry: `api/registry_service.py::promote()` looks up "current production" by `model_name` alone, with no `owner_id` filter -- two different users training a model with the same catalog name (e.g. both named "Logistic Regression") would archive each other's production version. `rollback()` loads `version.promoted_from` by id with no ownership check on the target. `register_version()`'s version-numbering counts *all* `ModelVersion` rows with that `model_name`, not just the caller's -- so version numbers are shared/leak across users.
- API responses: `JobDetail`/`ModelVersionResponse`/`model_card` include `pickle_path`, an absolute-ish filesystem path under `MLForge_files/pickle_files/`. This is an internal implementation detail leaking in a public response.
- MLflow: `api/integrations/mlflow_adapter.py` already degrades to a no-op on `_get_mlflow()` import/tracking-uri failure, but `tracked_run()`'s `with mlflow.start_run(...)` is not guarded -- a failure *inside* the `with` block (e.g. the tracking server rejecting the run after import succeeded) would propagate and fail the training request, and nothing records on the `Job` row whether tracking actually succeeded.
- Repo hygiene: `MLForge_files/api_uploads/` (73 files) and `MLForge_files/pickle_files/` (69 files) are tracked in git history from the original "Initial commit" (predates this engagement) and are still in the working tree's git index today -- runtime-generated files committed as if they were source. `MLForge_files/text_classifier_training_output/metric_files/` (2 files) are generated training outputs, also tracked. `.gitignore` from Phase 0/1 covers `training_output/` but not the actual tracked path `text_classifier_training_output/` -- a gap. `csv_configurations/*.csv` (the real model catalogs), `MLForge_execution_groups/*`, `rawTraining/*`, `bulk_upload_folder/*`, and `testing/*`, `training/*`, `text_classifier_training/*`, `text_classifier_testing/*` are legitimate sample/seed datasets per the Phase 0/1 correction and are **not** touched.
- Tests: `tests/test_api.py`, `test_phase2.py`, `test_catalog.py`, `test_task_detection.py`, `test_preprocessing.py`, `test_training.py` exist (written in the prior sessions, never executed -- no Python interpreter has been available in any session that worked on this repo so far).

## Proposed changes (this hardening pass)

1. Registry: scope "current production" lookup, version numbering, and rollback target by `owner_id`; `SystemPrincipal` keeps cross-user visibility (documented, not a bug) since it represents the legacy trusted API-key caller, same as Phase 1/2.
2. Auth: hash tokens at rest (SHA-256 of the opaque token, looked up by hash -- the client-held token itself is still a high-entropy secret, never stored raw), add `expires_at` + a `revoked_at` column and a `/auth/logout` endpoint, reject expired/revoked tokens.
3. Auth bypass: gate the dev-convenience bypass behind an explicit `MLFORGE_ENV` (`development` default / `production`); refuse to start in `production` without `MLFORGE_API_KEY` or at least one registered user already required for any write.
4. Strip `pickle_path` (and any other filesystem path) from every public response schema; keep it in the DB for the trust-boundary-checked internal load path only.
5. MLflow: wrap every adapter call site, not just the import, in its own try/except; add `Job.tracking_status` (`ok` / `unavailable` / `error`) so a client can tell the difference between "tracked" and "silently not tracked" instead of us claiming success either way.
6. Repo hygiene: `git rm --cached` the generated artifacts above, fix the `.gitignore` gap, leave git history alone (still a separate, user-approved decision per the Phase 0 report) and document the implication.
7. Expand tests per the spec's checklist -- written and reviewed, **not executed** (no interpreter in this sandbox).

Full results of each phase, file-by-file, are in the final report at the end of this turn.
