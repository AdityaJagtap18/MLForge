# MLForge — Implementation Status (Requirement Traceability)

Status values: `Not started` · `Partially implemented` · `Implemented` · `Tested` · `Documented` · `Deferred` · `Blocked`.
This table is updated at the end of every phase; nothing here is marked `Tested`/`Documented` without a command/output or doc link as evidence.

| Requirement ID | Source | Implementation location | Test/evidence | Status | Phase |
|---|---|---|---|---|---|
| BUG-01..06 | PRD §6.2 | `api/main.py`, `src/config.py` | none yet | Not started | 1 |
| FR-DATA (upload/profile/validate) | PRD §8 | n/a | none | Not started | 1 |
| FR-PREP (preprocessing pipeline) | PRD §8 | n/a | none | Not started | 1 |
| FR-TRAIN (single-model training) | PRD §8 | `src/model.py`/`train.py` (existing, subprocess-based) | none | Partially implemented (works via CLI/subprocess, not hardened) | 1 |
| FR-FIND (AutoML search) | PRD §8 | `api/main.py::find_best_model` (existing) | none | Partially implemented | 1 |
| FR-PREDICT (use trained model) | PRD §8 | n/a — `frontend/use-model.html` has no backend | none | Not started (identified gap) | 1 |
| FR-LOG (training history) | PRD §8 | n/a — `frontend/logs.html` has no backend | none | Not started (identified gap) | 1 |
| FR-AUTH-01 (API key) | PRD §8 | n/a | none | Not started | 1 |
| UI-REF-01 (Overview screen 1:1 match) | Screenshot + SVG ZIP | n/a | none | Not started — spec drafted in `docs/ui/visual-spec.md` | 1 |
| GOV-VERSION-01 (git/versioning discipline) | Transformation prompt | n/a | Git safety findings in `docs/architecture/current-state.md` §5 | Blocked on user decision (staged data files) | All |
| MLOPS-EXP-01 (MLflow tracking) | Transformation prompt | n/a | none | Not started | 2 |
| MLOPS-REG-01 (model registry) | Transformation prompt | n/a | none | Not started | 2 |
| MLOPS-MON-01 (Evidently monitoring) | Transformation prompt | n/a | none | Not started | 3 |
| MLOPS-XAI-01 (SHAP explainability) | Transformation prompt | n/a | none | Not started | 2 |
| MLOPS-DEPLOY-01 (serving/rollback) | Transformation prompt | n/a | none | Not started | 3 |
| MLOPS-RETRAIN-01 (controlled retraining) | Transformation prompt | n/a | none | Not started | 4 (optional) |

Nothing in this repository is currently tested, documented as shipped, or reachable end-to-end through the UI for the MLOps extension — the brownfield app only supports the original training/search flow, and even that has the confirmed defects above. No requirement is marked `Implemented` or `Tested` yet; this table will be updated as each Phase 1 task lands with its own commit and test evidence.
