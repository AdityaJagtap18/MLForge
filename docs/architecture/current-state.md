# MLForge — Current State (Phase 0 Baseline)

Date: 2026-11-17 · Status: baseline audit, no code changed.

## 1. What actually exists

| Layer | Files | Lines | Notes |
|---|---|---|---|
| API | `api/main.py`, `api/find-best-model.py` | 258 + 83 | FastAPI, single file, no routers/services |
| ML core | `src/model.py`, `train.py`, `metrics.py`, `config.py`, `test.py` | ~510 | CLI scripts invoked via `subprocess` |
| Orphaned | `src/text_classifier_train.py`, `text_classifier_test.py` | 274 | Depends on `mysql.connector` + undefined `Config` fields; unreachable from any route |
| Frontend | `frontend/*.html`, `*.js`, `style.css` | ~1000 | Static HTML + vanilla JS, no build step, API base hardcoded to `http://127.0.0.1:8000` |
| Data/artifacts | `MLForge_files/**` | — | ~160 files: raw CSVs, uploaded CSVs, pickled models, unrelated business CSVs (invoices, payments, attendance) |
| Docs | `PRODUCT_REQUIREMENTS_DOCUMENT.md`, `README.md` | 654 + 204 | PRD already contains its own brownfield assessment (§6), consistent with this audit |
| Tests | none | 0 | No test files anywhere in the repo |
| CI/CD | none | — | No `.github/`, no Dockerfile, no compose file |

No database, no MLflow, no Evidently, no SHAP, no auth, no job queue, no React/TS/Vite tooling exist today. `requirements.txt` has 7 unpinned lines (`pandas`, `numpy`, `scikit-learn`, `matplotlib`, `fastapi`, `uvicorn`, `python-multipart`).

## 2. Confirmed defects (cross-checked against PRD §6.2)

All six PRD-listed bugs (BUG-01..06) were verified directly in `api/main.py` / `src/`:
- BUG-01: `Config.CSV_CONFIG` points at a non-existent `MLForge_model_tbl.csv`; actual file is `model_capabilities.csv` → `GET /models` throws today.
- BUG-02: `api/find-best-model.py` is dead/non-importable (references an undefined `app`).
- BUG-03: task-type heuristic (`nunique(target) <= 20` ⇒ classification) misclassifies both directions.
- BUG-04: `model_params.replace('$','"')` is a fragile JSON-quoting workaround.
- BUG-05: raw `stderr`/stack traces returned verbatim to API callers on training failure.
- BUG-06: no validation that `input_cols`/`target_col` exist in the uploaded CSV before spawning the training subprocess.

## 3. UI-promised, backend-absent (PRD §6.3)

- `frontend/use-model.html` has no `use-model.js` and no `/predict` route — the single largest functional gap.
- `frontend/logs.html` has no `/logs` or `/jobs` endpoint and no persistence beyond raw files.
- Text classification is fully coded but orphaned (MySQL dependency never configured, not wired to any route).

## 4. Architectural gaps vs. PRD/transformation-prompt target

- Execution model: one OS subprocess per model per request, synchronous inside the HTTP cycle; `/find-best-model` can spawn up to ~40 subprocesses serially with no timeout.
- No preprocessing: `src/train.py` calls `.values` on raw columns; any non-numeric column throws during `.fit()`.
- No metadata store: every job is a UUID-named file under `MLForge_files/`; nothing is queryable.
- Storage growth is already unbounded in this checkout — 70+ uploads and matching pickles with no retention/cleanup.
- Security: no auth, `CORS allow_origins=["*"]`, no rate limiting, no artifact access control. Pickle/joblib files are loaded with no provenance check.
- **Correction (made during Phase 1 implementation):** `MLForge_files/csv_configurations/baml_model_tbl.csv` is **not** unrelated business data — its columns are `MODEL_NAME, MODEL_DESCRIPTION, MODEL_CLASS, MODEL_SECTION, MODEL_SUBSECTION, ...` and it is the real MODEL_NAME→sklearn-class catalog. `Config.CSV_CONFIG` (BUG-01) should point here, not at a nonexistent `MLForge_model_tbl.csv`; this is the actual root cause of BUG-01, not a missing file. `MLForge_files/csv_configurations/model_capabilities.csv` is a second, separate catalog (MODEL_NAME, IS_CLASSIFICATION, IS_REGRESSION flags) used by `/find-best-model`'s `get_allowed_models`. Both are legitimate and are kept. The `MLForge_execution_groups/*.csv` files (bike-sharing-style, attendance, invoice-count data) are genuine generic tabular sample/demo datasets usable for exercising classification/regression — not leftover business data from another system as first assumed. They are still excluded from version control per `.gitignore` (bulk sample data doesn't belong in git history), but are not flagged for deletion as "not part of the product."

## 5. Git state — CRITICAL, read before any commit

This directory **is already a git repository** (`.git/` present) but **has zero commits**. `git status` shows the entire `MLForge_files/` tree — including ~80 uploaded CSVs, ~70 pickled model files, and the unrelated business CSVs above — **already staged** for the first commit.

This directly conflicts with the transformation prompt's non-negotiable rules (never commit secrets, private datasets, or generated model binaries) and with standard Git hygiene for a brownfield-to-product transformation. **No commit has been made and none will be made until this is resolved with the user.**

Recommended before any commit (not yet executed — needs explicit go-ahead):
1. Add a `.gitignore` covering `MLForge_files/api_uploads/`, `MLForge_files/pickle_files/`, `MLForge_files/training_output/`, `__pycache__/`, and the unrelated business CSVs under `MLForge_files/MLForge_execution_groups/` and `bulk_upload_folder/`.
2. `git reset` (unstage only — working tree files are left untouched) the currently-staged data/binary files before the first commit.
3. Decide with the user whether any small, de-identified sample CSV should be kept as a committed fixture for tests/demos (deterministic, synthetic, clearly labeled) versus removing all of it.
4. First commit should contain source, docs and config only.

## 6. Dependency/runtime risk register

| Risk | Likelihood | Impact | Notes |
|---|---|---|---|
| Committing the staged data/pickle files | High if unaddressed | High | Privacy + repo bloat; see §5 |
| Subprocess-per-model execution blocking the event loop | Certain under any load | High | Must move to in-process calls behind a job abstraction before any concurrency work |
| `pickle`/`joblib` deserialization of artifacts | Medium | High | Document trust boundary; never load artifacts from user-controlled paths |
| Unpinned dependencies (`requirements.txt` has no versions) | Medium | Medium | Pin before CI is introduced |
| React/Vite migration risk to existing workflows | Medium | Medium | Mitigated by ADR-0001 + parity checklist before cutover |
| scikit-learn catalog drift (`model_capabilities.csv` referencing removed/renamed classes) | Medium | Low | Add catalog-import regression test in Phase 1 |

## 7. Reuse vs. replace recommendation

**Reuse as-is:** model catalog concept, computed metrics (`src/metrics.py`), overall upload→select→train/search→review flow, 40+ sklearn class list.
**Reuse with refactor:** `src/model.py`/`train.py` logic moves in-process behind a service boundary; `api/main.py` splits into routers + services.
**Replace:** static HTML/JS frontend → React + TS + Vite (ADR-0001); subprocess execution → in-process + later Redis/RQ; flat-file state → SQLAlchemy models.
**Delete:** `api/find-best-model.py` (dead code); orphaned text-classifier MySQL dependency (defer rebuild to Phase 3 per PRD); unrelated business CSVs once confirmed with the user.
