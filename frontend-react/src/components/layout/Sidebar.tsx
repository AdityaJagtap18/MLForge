import { NavLink } from "react-router-dom";
import logo from "../../assets/mlforge-logo.svg";
import { Icon, type IconName } from "../ui/Icon";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
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

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  function handleNavClick() {
    if (onClose) {
      onClose();
    }
  }

  return (
    <>
      {/* Mobile Drawer Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar / Mobile Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-[270px] max-w-[85vw] flex-col border-r border-line bg-surface shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:h-screen lg:w-[260px] lg:shrink-0 lg:shadow-none lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-line/60 lg:border-none">
          <div className="flex flex-col gap-1">
            <img src={logo} alt="MLForge" className="h-7 w-auto" />
            <span className="text-xs text-muted">End-to-End ML &amp; MLOps Platform</span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden rounded-lg p-1.5 text-muted hover:bg-bg hover:text-ink focus:outline-none"
              aria-label="Close navigation"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 overflow-y-auto py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={handleNavClick}
              className={({ isActive }) =>
                [
                  "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-white" : "text-ink hover:bg-bg",
                ].join(" ")
              }
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="m-3 shrink-0 rounded-card bg-gradient-to-br from-primary/10 to-amber/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            MLForge v2.0
            <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">PRO</span>
          </div>
          <p className="mt-1 text-xs text-muted">MLOps · Monitoring · AutoML</p>
        </div>
      </aside>
    </>
  );
}
