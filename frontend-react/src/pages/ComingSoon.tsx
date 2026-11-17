import { Card } from "../components/ui/Card";

export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div>
      <h1 className="mb-6 text-[28px] font-bold text-ink">{title}</h1>
      <Card>
        <p className="text-sm text-muted">
          This module is scoped for <span className="font-medium text-ink">{phase}</span> of the
          transformation plan and is not implemented yet. See{" "}
          <code className="rounded bg-bg px-1 py-0.5 text-xs">docs/implementation-plan.md</code>.
        </p>
      </Card>
    </div>
  );
}
