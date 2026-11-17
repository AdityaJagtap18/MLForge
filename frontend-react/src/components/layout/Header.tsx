import { Icon } from "../ui/Icon";

export function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-8">
      <div className="flex w-[420px] items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2">
        <Icon name="search" className="h-4 w-4 text-muted" />
        <input
          className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          placeholder="Search datasets, experiments, models..."
        />
        <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">⌘K</kbd>
      </div>

      <div className="flex items-center gap-5">
        <button aria-label="Notifications" className="relative text-ink">
          <Icon name="bell" className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" />
        </button>
        <button aria-label="Help" className="text-ink">
          ?
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
            JD
          </div>
          <div className="text-sm leading-tight">
            <div className="font-medium text-ink">John Doe</div>
            <div className="text-xs text-muted">ML Engineer</div>
          </div>
        </div>
      </div>
    </header>
  );
}
