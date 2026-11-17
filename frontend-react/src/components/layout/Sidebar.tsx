import { NavLink } from "react-router-dom";
import logo from "../../assets/mlforge-logo.svg";
import { Icon, type IconName } from "../ui/Icon";

// The supplied SVG pack has no dedicated "Overview" icon (see
// docs/ui/visual-spec.md §6) -- this is the one documented Lucide-style
// fallback, drawn at the same 24x24/1.5px outline weight as the rest of the
// pack rather than freehand-approximated.
const HOME_FALLBACK = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>`;

interface NavItem {
  to: string;
  label: string;
  icon: IconName | "home";
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Overview", icon: "home" },
  { to: "/datasets", label: "Datasets", icon: "datasets" },
  { to: "/experiments", label: "Experiments", icon: "experiments" },
  { to: "/train", label: "Train Models", icon: "train-model" },
  { to: "/registry", label: "Model Registry", icon: "model-registry" },
  { to: "/deployments", label: "Deployments", icon: "deployment" },
  { to: "/predictions", label: "Predictions", icon: "predictions" },
  { to: "/monitoring", label: "Monitoring", icon: "monitoring" },
  { to: "/explainability", label: "Explainability", icon: "explainability" },
  { to: "/pipelines", label: "Pipelines", icon: "pipelines" },
  { to: "/logs", label: "Audit & Logs", icon: "logs" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-[260px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex flex-col gap-1 px-5 py-5">
        <img src={logo} alt="MLForge" className="h-7 w-auto" />
        <span className="text-xs text-muted">End-to-End ML &amp; MLOps Platform</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive ? "bg-primary text-white" : "text-ink hover:bg-bg",
              ].join(" ")
            }
          >
            {item.icon === "home" ? (
              <span className="h-5 w-5" dangerouslySetInnerHTML={{ __html: HOME_FALLBACK }} />
            ) : (
              <Icon name={item.icon} className="h-5 w-5" />
            )}
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="m-3 rounded-card bg-gradient-to-br from-primary/10 to-amber/10 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          MLForge v2.0
          <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">PRO</span>
        </div>
        <p className="mt-1 text-xs text-muted">MLOps · Monitoring · AutoML</p>
      </div>
    </aside>
  );
}
