import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** grid placement, e.g. "span 2" */
  span?: number;
  rows?: number;
}

/** Square-bordered dashboard tile. Tiles are focusable so ← and → can move between them. */
export function TallyTile({ title, actions, children, className, span, rows }: Props) {
  return (
    <section
      className={`t-tile ${className ?? ""}`}
      data-tile
      tabIndex={0}
      style={{ gridColumn: span ? `span ${span}` : undefined, gridRow: rows ? `span ${rows}` : undefined }}
    >
      <header className="t-tile-head">
        <h2>{title}</h2>
        {actions && <div className="t-tile-actions">{actions}</div>}
      </header>
      <div className="t-tile-body">{children}</div>
    </section>
  );
}
