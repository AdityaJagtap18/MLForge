# MLForge — Overview Screen Visual Spec

Source of truth: the supplied dashboard screenshot (`1.webp`, ~1672×941 reference) and `mlforge-ui-svg-assets.zip`. This is a visual spec only — functional behavior comes from the PRD, not this document.

## 1. Design tokens

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#E96B18` | Active nav item, primary buttons, logo mark, chart accent |
| `--color-amber` | `#F59E0B` | Secondary chart series, warning accents |
| `--color-deep-orange` | `#E85D04` | Hover/darker accent variant |
| `--color-bg` | `#FAF8F5` | Page background |
| `--color-surface` | `#FFFFFF` | Cards, sidebar, header |
| `--color-text` | `#242424` | Primary text |
| `--color-text-muted` | `#77716B` | Secondary/meta text, labels |
| `--color-border` | `#EAE4DC` | Card borders, dividers, input borders |

Status colors observed in the reference (not in the token list, confirm with user or pick nearest warm-neutral equivalents): green check for "healthy"/"operational"/"stable" indicators, red/warm triangle for alerts. Keep these desaturated/warm rather than pure Material green/red to avoid breaking the no-blue/purple/green-as-accent rule — status semantics (success/warning) are the one allowed exception the screenshot itself uses, but they must stay utility colors, never promoted to chart series or nav colors.

## 2. Page geometry (desktop, ~1680px reference width)

- **Sidebar**: fixed left, ~260px wide, white surface, full viewport height. Logo block at top (mark + "MLForge" wordmark + "End-to-End ML & MLOps Platform" subtitle, ~13px muted). Nav items ~44px row height, 12px horizontal padding, rounded-rect active state filled `--color-primary` with white text + icon; inactive items `--color-text` with muted icon.
- **Header bar**: full width minus sidebar, ~64px tall, white surface, bottom border `--color-border`. Contains: centered-left search input (pill/rounded-rect, ~420px wide, search icon + placeholder "Search datasets, experiments, models…" + right-aligned "⌘K" hint), right-aligned bell icon (with unread dot), help icon, user avatar (circular, initials, primary-colored) + name/role stack + chevron.
- **Content margin**: ~32px outer padding on all sides of the main content area.
- **Page heading row**: "Overview" (large, bold, ~28px) + one-line description below in muted text; right-aligned date-range control ("Last 30 Days" pill with calendar icon + chevron).
- **KPI row**: 5 cards in a single row, equal width, ~16px gutter. Each card: icon chip (tinted square, ~40px, icon in primary/amber/etc.), label (muted, small), big number (bold, ~24–28px), delta badge (↑/↓ + %, small pill, colored), and a one-line caption in muted text.
- **Second row**: 3 panels — "Training Activity" (line/area chart, ~2 cols width) and "Model Performance (Latest)" (horizontal bar chart, ~2 cols width) and "System Health" (status list, ~1 col width, narrower) — i.e. a 2-2-1-ish grid, card heights match.
- **Third row**: "Recent Experiments" (table, wide) + "Model Monitoring" (metrics + mini line chart) + "Alerts & Insights" (list of alert rows + CTA button) — same row rhythm as row two but content differs per card.
- **Cards**: white surface, `--color-border` 1px border, border-radius ~10–12px, subtle shadow (very low opacity, not glassmorphism), ~20px internal padding. Card header: icon + title (bold) + optional subtitle (muted) on the left, optional control (dropdown/link) on the right.
- **Footer/sidebar bottom**: product/version card ("MLForge v2.0" + "PRO" badge + "MLOps · Monitoring · AutoML" caption) pinned to sidebar bottom, soft gradient tint background.

## 3. Typography

- Font family: system/sans (reference reads as a standard humanist sans — use Inter or the system font stack; no custom font is supplied in the asset pack, so default to a widely available sans and document the substitution).
- Hierarchy: page title (bold, ~28px) → card title (semibold, ~15–16px) → KPI number (bold, ~26px) → body/table text (regular, ~14px) → muted captions/labels (regular, ~12–13px).

## 4. Charts (Apache ECharts)

- **Training Activity**: filled area + line, single series, primary-orange line with a light orange gradient fill to transparent, soft dot markers on hover, axis labels muted, gridlines very light.
- **Model Performance**: horizontal bar chart, 4 series shown (one bar per model), bars in a primary→amber gradient scale from darkest (top) to lightest (bottom) — not 4 unrelated hues; dense value labels at bar end.
- **Model Monitoring trend**: small inline line chart under the metric tiles, same primary-orange line treatment, compact axis.
- No pie/donut charts in the reference; do not introduce them without a new reference.

## 5. Table (Recent Experiments)

- Columns: Run Name, Model, Dataset, F1 Score, Status (pill badge), Started (relative time, muted). Row height ~44px, zebra-free (plain white rows separated by hairline border), status pill uses a soft amber/orange-tinted background with darker text for "Completed" in the reference — confirm exact pill palette against the live screenshot at build time since status pills are a case where a muted-green "success" tint may be acceptable per the one exception in §1.
- "View All →" link top-right of the card header, primary-orange text + arrow icon.

## 6. Icon mapping (provided SVG pack → nav/UI)

| Screen/element | Provided icon | Notes |
|---|---|---|
| Datasets | `icons/datasets.svg` / `database.svg` | pack has both; use `datasets.svg` for nav, `database.svg` for the Datasets KPI chip |
| Experiments | `icons/experiments.svg` | nav + KPI chip + card header |
| Train Models | `icons/train-model.svg` | nav |
| Model Registry | `icons/model-registry.svg` | nav + KPI chip |
| Deployments | `icons/deployment.svg` | nav + KPI chip |
| Predictions | `icons/predictions.svg` | nav |
| Monitoring | `icons/monitoring.svg` | nav + Model Monitoring card header |
| Explainability | `icons/explainability.svg` | nav |
| Pipelines | `icons/pipelines.svg` | nav |
| Audit & Logs | `icons/logs.svg` | nav |
| Settings | `icons/settings.svg` | nav |
| Search bar | `icons/search.svg` | header |
| Notifications | `icons/bell.svg` | header (with unread-dot overlay, drawn in CSS, not baked into the SVG) |
| Date filter | `icons/calendar.svg` + implicit chevron | header-right control |
| Upload actions | `icons/upload.svg` | Datasets module (Phase 1) |
| Download actions | `icons/download.svg` | Predictions/Experiments export (later phases) |
| Alerts (warning) | `icons/alert-triangle.svg` | Alerts & Insights list |
| Alerts (success) | `icons/check-circle.svg` | System Health rows, "performing within range" banner |
| Filter controls | `icons/filter.svg` | tables, later phases |
| "View All" link | `icons/arrow-right.svg` | card header links |
| Close / dismiss | `icons/close.svg` | modals/toasts |
| Mobile nav toggle | `icons/menu.svg` | responsive header |
| Relative time | `icons/clock.svg` | optional, table "Started" column |
| Generic chart icon | `icons/chart.svg` | Model Performance card header |
| Logo | `mlforge-mark.svg` (compact) / `mlforge-logo.svg` (wordmark) | sidebar header uses both together; favicon uses `favicon.svg` |

**Gap:** the pack has no dedicated "Overview"/home icon. Per the transformation prompt's icon rule, fall back to a single Lucide `home`/`layout-dashboard` glyph for that one nav item only, styled to the same 24×24 outline weight as the rest of the pack — do not redraw or approximate it freehand.

## 7. Colors explicitly forbidden

Purple, blue, and green must not appear as brand/primary/secondary/navigation/chart-series/decorative-accent colors anywhere in the app shell, including in modules beyond the Overview screen. Status-only semantic uses (a success check, a drift-alert warning) are the sole exception and should stay muted/utility, not decorative.

## 8. Responsive behavior

Desktop (this spec) is the fidelity target. Tablet: collapse KPI row to 2–3 per row, stack the three-panel rows to 2+1. Mobile: sidebar becomes a slide-over triggered by `icons/menu.svg`; KPI cards stack single-column; charts remain full-width; table becomes a card-per-row list. None of this is implemented yet — it is a Phase 1 build target.

## 9. Screenshot comparison checklist (to run after implementation)

- [ ] Sidebar width, logo block, nav row height/spacing match within a few px at the same viewport width.
- [ ] Header height, search bar width/placement, right-cluster icon order match.
- [ ] KPI card count (5), order, icon-chip tint, number size, delta badge placement match.
- [ ] Chart types (area, horizontal bar) and palette match; no blue/green/purple introduced.
- [ ] Table column order and status-pill styling match.
- [ ] System Health / Alerts & Insights row icons and copy structure match (content can be fixture data, clearly labeled as demo data if not yet wired to real services).
- [ ] Sidebar footer product/version card present and styled consistently.
- [ ] Side-by-side screenshot diff at the same viewport size captured and saved (local ignored artifacts dir), differences listed with resolution notes.
