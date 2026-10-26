import { gbp } from "../../format";

/** Half-circle P&L gauge: needle position shows value against ±range. */
export function Gauge({ value, range, label }: { value: number; range: number; label: string }) {
  const r = 90;
  const clamped = Math.max(-range, Math.min(range, value));
  const angle = Math.PI * (1 - (clamped + range) / (2 * range)); // π (left) to 0 (right)
  const nx = 110 + r * 0.82 * Math.cos(angle);
  const ny = 110 - r * 0.82 * Math.sin(angle);
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from), a1 = Math.PI * (1 - to);
    return `M ${110 + r * Math.cos(a0)} ${110 - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${110 + r * Math.cos(a1)} ${110 - r * Math.sin(a1)}`;
  };
  return (
    <figure className="t-gauge">
      <svg viewBox="0 0 220 130" role="img" aria-label={`${label}: ${gbp(value)}`}>
        <path d={arc(0, 0.5)} stroke="#c5221f" strokeWidth="16" fill="none" />
        <path d={arc(0.5, 1)} stroke="#107c41" strokeWidth="16" fill="none" />
        <line x1="110" y1="110" x2={nx} y2={ny} stroke="#0c3a6b" strokeWidth="3" style={{ transition: "all 300ms ease-out" }} />
        <circle cx="110" cy="110" r="6" fill="#0c3a6b" />
        <text x="18" y="126" fontSize="10" fill="#4a6582">{gbp(-range)}</text>
        <text x="202" y="126" fontSize="10" fill="#4a6582" textAnchor="end">+{gbp(range)}</text>
      </svg>
      <figcaption>
        <b className={value >= 0 ? "t-pos" : "t-neg"}>{value >= 0 ? "+" : ""}{gbp(value)}</b>
        <span>{label}</span>
      </figcaption>
    </figure>
  );
}
