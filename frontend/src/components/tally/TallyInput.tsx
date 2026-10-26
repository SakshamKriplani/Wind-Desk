import { useState } from "react";

interface Props {
  label: string;
  hotkey?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  prefix?: string;
  suffix?: string;
  width?: number;
  /** optional mini refresh button, e.g. force a recalculation */
  onRefresh?: () => void;
  title?: string;
}

/** Dense numeric input with − / + steppers and an optional ⟳ refresh. */
export function TallyInput({ label, hotkey, value, onChange, step = 1, min, max, prefix, suffix, width = 84, onRefresh, title }: Props) {
  const [spin, setSpin] = useState(0);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const nudge = (dir: number) => onChange(clamp(Math.round((value + dir * step) * 1000) / 1000));
  return (
    <label className="t-field" title={title}>
      <span className="t-field-label">
        {hotkey && <kbd>{hotkey}</kbd>}
        {label}
      </span>
      <span className="t-field-row">
        <button type="button" className="t-step" aria-label={`Decrease ${label}`} onClick={() => nudge(-1)}>−</button>
        {prefix && <span className="t-affix">{prefix}</span>}
        <input
          type="number"
          value={Number.isFinite(value) ? value : ""}
          step={step}
          min={min}
          max={max}
          style={{ width }}
          onChange={(e) => e.target.value !== "" && onChange(clamp(Number(e.target.value)))}
        />
        {suffix && <span className="t-affix">{suffix}</span>}
        <button type="button" className="t-step" aria-label={`Increase ${label}`} onClick={() => nudge(1)}>+</button>
        {onRefresh && (
          <button
            type="button"
            className={`t-step t-refresh ${spin ? "t-spin" : ""}`}
            aria-label={`Recalculate ${label}`}
            title="Recalculate"
            key={spin}
            onClick={() => {
              setSpin((n) => n + 1);
              onRefresh();
            }}
          >
            ⟳
          </button>
        )}
      </span>
    </label>
  );
}
