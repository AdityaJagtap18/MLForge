import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  subtitle: string;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={`flex flex-col justify-between gap-4 sm:flex-row sm:items-center ${className}`}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[28px] font-bold leading-tight text-ink">{title}</h1>
          {badge}
        </div>
        <p className="text-sm text-muted leading-normal">{subtitle}</p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-3">{actions}</div>
      )}
    </div>
  );
}
