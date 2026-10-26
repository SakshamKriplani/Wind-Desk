import { useEffect, useRef, useState } from "react";

interface Props {
  value: number | null | undefined;
  format: (v: number | null | undefined) => string;
  /** how to show the change, e.g. (d) => signed(d, "MWh"); omit to flash without a delta */
  delta?: (d: number) => string;
  /** a rise is good (green) unless invert is set */
  invert?: boolean;
  className?: string;
  /** shown while there is no value yet, e.g. before the first calculation */
  placeholder?: string;
  /** roll up from zero when the value first appears */
  countUp?: boolean;
  countUpMs?: number;
  /** wait before rolling, to stagger a row of figures */
  delayMs?: number;
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Rolls a number from 0 to `target` like an odometer; returns the value to display. */
function useCountUp(target: number | null | undefined, enabled: boolean, ms: number, delay: number) {
  const [shown, setShown] = useState<number | null | undefined>(enabled ? null : target);
  const started = useRef(false);
  useEffect(() => {
    if (!enabled || target == null || started.current || reducedMotion()) {
      setShown(target);
      if (target != null) started.current = true;
      return;
    }
    started.current = true;
    let raf = 0;
    const timer = window.setTimeout(() => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / ms);
        const eased = 1 - Math.pow(1 - k, 3);
        setShown(target * eased);
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, enabled, ms, delay]);
  // after the first roll, later changes show immediately (and flash)
  useEffect(() => {
    if (target == null) started.current = false;
  }, [target]);
  return shown;
}

/**
 * A number that flashes amber when it changes and briefly shows the delta with an arrow,
 * like a live trading terminal cell. Optionally rolls up from zero on first appearance.
 */
export function Num({ value, format, delta, invert, className, placeholder, countUp, countUpMs = 400, delayMs = 0 }: Props) {
  const shown = useCountUp(value, !!countUp, countUpMs, delayMs);
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

  if (value == null && placeholder != null) return <span className={`t-num t-placeholder ${className ?? ""}`}>{placeholder}</span>;
  if (shown == null && placeholder != null) return <span className={`t-num t-placeholder ${className ?? ""}`}>{placeholder}</span>;

  const up = (change?.d ?? 0) > 0;
  const good = invert ? !up : up;
  return (
    <span className={`t-num ${change ? "t-flash" : ""} ${className ?? ""}`} key={change?.key}>
      {format(shown)}
      {change && delta && (
        <span className={`t-delta ${good ? "t-pos" : "t-neg"}`}>
          {delta(change.d)} {up ? "▲" : "▼"}
        </span>
      )}
    </span>
  );
}
