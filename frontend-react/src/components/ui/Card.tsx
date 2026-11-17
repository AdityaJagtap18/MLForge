import type { ReactNode } from "react";

export function Card({
  className = "",
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-card border border-line bg-surface p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between">
      <div className="flex items-start gap-2">
        {icon}
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
