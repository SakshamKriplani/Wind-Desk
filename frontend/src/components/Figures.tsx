import type { ReactNode } from "react";

export interface Figure {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "good" | "bad";
}

/** A single row of headline figures separated by hairlines. */
export function Figures({ items }: { items: Figure[] }) {
  return (
    <dl className="figures">
      {items.map((f) => (
        <div key={f.label}>
          <dt>{f.label}</dt>
          <dd className={f.tone}>
            {f.value}
            {f.detail && <small>{f.detail}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
