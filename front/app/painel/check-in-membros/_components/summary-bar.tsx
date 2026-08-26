import type { MemberCheckinSummary } from "shared";

interface SummaryBarProps {
  summary: MemberCheckinSummary;
}

/** FR-006 — "X de Y presentes" da edição corrente. */
export function SummaryBar({ summary }: SummaryBarProps) {
  return (
    <div className="border-border bg-card flex items-center justify-between rounded-xl border px-4 py-3">
      <span className="text-sm font-medium">Presença confirmada</span>
      <span className="font-heading text-lg font-semibold tabular-nums">
        {summary.checkedIn} <span className="text-muted-foreground font-sans text-sm font-normal">de {summary.total}</span>
      </span>
    </div>
  );
}
