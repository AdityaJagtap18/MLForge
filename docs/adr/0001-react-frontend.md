# ADR-0001: Migrate frontend from static HTML/JS to React + TypeScript + Vite

Status: **Proposed** (pending user approval before Phase 1 starts)

## Context
The original PRD explicitly keeps the static HTML/CSS/vanilla-JS frontend (PRD §7.2: "A rebuilt frontend framework (React/Vue)... out of scope"). The transformation prompt overrides this: the expanded MLOps surface (12 modules, tables, charts, polling, forms) needs a modular, typed, component-based frontend, and supplies a React-shaped dashboard reference (screenshot + SVG pack) that assumes componentized implementation, not static pages.

## Decision
Adopt React + TypeScript + Vite, with Tailwind CSS (+ small token layer), shadcn/ui primitives (styled to match the reference), Apache ECharts, TanStack Table/Query, React Router, React Hook Form + Zod, Zustand (shared state only), and Lucide only as an icon fallback for glyphs missing from the supplied SVG pack (one case so far: the Overview nav icon — see `docs/ui/visual-spec.md` §6).

## Consequences
- This is an explicit, documented override of PRD §7.2 — recorded here rather than silently changed, per the transformation prompt's rule 12.
- The existing user workflows (upload → select columns → train/find-best-model → view results) must be preserved behavior-for-behavior during the migration; a parity checklist is required before the old frontend is removed.
- `frontend/*.html`/`*.js` is not deleted until the React app's equivalent screens are implemented and tested (transformation prompt guardrail: don't delete legacy code until replacement is tested and migration documented).
- Frontend build tooling (Node/npm, Vite config, lockfile) is new infrastructure for this repo and needs its own CI step.
- All MLflow/Evidently access stays server-side; the frontend only ever talks to the FastAPI `/api/v1` surface.

## Migration strategy (Phase 1)
1. Stand up the Vite app alongside the existing static frontend (does not replace it yet).
2. Build the shared shell (sidebar, header, routing) matched to the Overview reference first.
3. Re-implement the two existing functional flows (train, find-best-model) plus the two new ones required to close PRD gaps (predict, logs) as React modules calling the refactored FastAPI routers.
4. Run the screenshot-comparison checklist (`docs/ui/visual-spec.md` §9) against the Overview screen.
5. Only after parity is verified and tested: remove the static `frontend/` tree and update `README.md`/deployment docs.
