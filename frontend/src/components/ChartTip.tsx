import type { ReactNode } from "react";

export interface TipRow {
  label: string;
  value: ReactNode;
  color?: string;
}

/** Shared tooltip body for all charts. */
export function ChartTip({ title, rows }: { title: ReactNode; rows: TipRow[] }) {
  return (
    <div className="chart-tip">
      <b>{title}</b>
      {rows.map((r) => (
        <div key={r.label}>
          <span style={{ color: r.color }}>{r.label}</span>
          <span>{r.value}</span>
        </div>
      ))}
    </div>
  );
}
