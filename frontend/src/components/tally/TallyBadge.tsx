export type BadgeTone = "ok" | "warn" | "crit" | "info" | "dr" | "cr" | "sim";

/** Small square status label: OK / Degraded / Critical, Dr / Cr, SIMULATED. */
export function TallyBadge({ tone, children, title }: { tone: BadgeTone; children: React.ReactNode; title?: string }) {
  return <span className={`t-badge t-badge-${tone}`} title={title}>{children}</span>;
}
