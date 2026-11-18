/**
 * Renders one of the supplied 24x24 outline SVGs by name (icons use
 * currentColor, per mlforge-ui-svg-assets/README.md, so color is set via
 * the `className`/`style` the caller passes).
 */
import alertTriangle from "../../assets/icons/alert-triangle.svg?raw";
import arrowRight from "../../assets/icons/arrow-right.svg?raw";
import bell from "../../assets/icons/bell.svg?raw";
import calendar from "../../assets/icons/calendar.svg?raw";
import chart from "../../assets/icons/chart.svg?raw";
import checkCircle from "../../assets/icons/check-circle.svg?raw";
import clock from "../../assets/icons/clock.svg?raw";
import close from "../../assets/icons/close.svg?raw";
import database from "../../assets/icons/database.svg?raw";
import datasets from "../../assets/icons/datasets.svg?raw";
import deployment from "../../assets/icons/deployment.svg?raw";
import download from "../../assets/icons/download.svg?raw";
import experiments from "../../assets/icons/experiments.svg?raw";
import explainability from "../../assets/icons/explainability.svg?raw";
import filter from "../../assets/icons/filter.svg?raw";
import logs from "../../assets/icons/logs.svg?raw";
import menu from "../../assets/icons/menu.svg?raw";
import modelRegistry from "../../assets/icons/model-registry.svg?raw";
import monitoring from "../../assets/icons/monitoring.svg?raw";
import pipelines from "../../assets/icons/pipelines.svg?raw";
import predictions from "../../assets/icons/predictions.svg?raw";
import search from "../../assets/icons/search.svg?raw";
import settings from "../../assets/icons/settings.svg?raw";
import trainModel from "../../assets/icons/train-model.svg?raw";
import upload from "../../assets/icons/upload.svg?raw";

const homeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Overview"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>`;

const ICONS = {
  "alert-triangle": alertTriangle,
  "arrow-right": arrowRight,
  bell,
  calendar,
  chart,
  "check-circle": checkCircle,
  clock,
  close,
  database,
  datasets,
  deployment,
  download,
  experiments,
  explainability,
  filter,
  home: homeSvg,
  logs,
  menu,
  "model-registry": modelRegistry,
  monitoring,
  pipelines,
  predictions,
  search,
  settings,
  "train-model": trainModel,
  upload,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center [&>svg]:block [&>svg]:h-full [&>svg]:w-full [&>svg]:stroke-[1.8] ${className}`}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
