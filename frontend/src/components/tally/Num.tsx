import { useEffect, useRef, useState } from "react";

interface Props {
  value: number | null | undefined;
  format: (v: number | null | undefined) => string;
  /** how to show the change, e.g. (d) => signed(d, "MWh"); omit to flash without a delta */
  delta?: (d: number) => string;
  /** a rise is good (green) unless invert is set */
  invert?: boolean;
  className?: string;
}

/**
 * A number that flashes amber when it changes and briefly shows the delta with an arrow,
 * like a live trading terminal cell.
 */
export function Num({ value, format, delta, invert, className }: Props) {
  const prev = useRef(value);
  const [change, setChange] = useState<{ d: number; key: number } | null>(null);

  useEffect(() => {
    const p = prev.current;
    prev.current = value;
    if (p == null || value == null || Math.abs(value - p) < 1e-9) return;
    setChange({ d: value - p, key: Date.now() });
    const id = window.setTimeout(() => setChange(null), 1600);
    return () => window.clearTimeout(id);
  }, [value]);

  const up = (change?.d ?? 0) > 0;
  const good = invert ? !up : up;
  return (
    <span className={`t-num ${change ? "t-flash" : ""} ${className ?? ""}`} key={change?.key}>
      {format(value)}
      {change && delta && (
        <span className={`t-delta ${good ? "t-pos" : "t-neg"}`}>
          {delta(change.d)} {up ? "▲" : "▼"}
        </span>
      )}
    </span>
  );
}
