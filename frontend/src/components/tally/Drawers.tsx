import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HALF_HOUR, slotLabel } from "../../calc";
import { RISK_PRESETS, VIEWS, useTerminal } from "../../context/TerminalStateContext";
import { addDays, calendar, gbp, int, longDay, shortDay, time } from "../../format";
import { TallyInput } from "./TallyInput";

function Panel({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const body = ref.current?.querySelector(".t-drawer-body");
    (body?.querySelector<HTMLElement>("input, select, button, [tabindex]") ?? ref.current?.querySelector<HTMLElement>("button"))?.focus();
  }, []);
  return (
    <div className="t-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`t-drawer ${wide ? "t-drawer-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="t-drawer-head">
          <h2>{title}</h2>
          <button type="button" className="t-x" onClick={onClose} aria-label="Close">Esc ✕</button>
        </header>
        <div className="t-drawer-body">{children}</div>
      </div>
    </div>
  );
}

export function Drawers() {
  const t = useTerminal();
  const close = () => t.setDrawer(null);
  if (!t.drawer) return null;
  switch (t.drawer.kind) {
    case "goto": return <Panel title="Go To" onClose={close}><GoTo /></Panel>;
    case "date": return <Panel title="Period / Date" onClose={close}><DatePicker /></Panel>;
    case "config": return <Panel title="Configure trading parameters" onClose={close}><Config /></Panel>;
    case "help": return <Panel title="Help" onClose={close} wide><Help /></Panel>;
    case "inspect": return <Panel title="Settlement period detail" onClose={close}><Inspect t={t.drawer.t} /></Panel>;
  }
}

function GoTo() {
  const t = useTerminal();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const items = useMemo(() => {
    const out: { label: string; hint: string; run: () => void }[] = [];
    VIEWS.forEach((v) => out.push({ label: v.label, hint: "view", run: () => t.setView(v.id) }));
    t.meta.decision_days.forEach((d) => {
      const del = addDays(d, 1);
      out.push({ label: `Delivery ${shortDay(calendar(del).getTime())} (${del})`, hint: `decide ${d}`, run: () => t.setDay(d) });
    });
    t.rows.forEach((r) => out.push({
      label: `SP ${r.sp} ${slotLabel(r.t, r.hours)}`, hint: "settlement period",
      run: () => { t.setView("ledger"); t.setSelected(r.t); },
    }));
    const needle = q.trim().toLowerCase();
    return needle ? out.filter((o) => `${o.label} ${o.hint}`.toLowerCase().includes(needle)) : out;
  }, [q, t]);
  const pick = (k: number) => {
    items[k]?.run();
    t.setDrawer(null);
  };
  return (
    <>
      <input className="t-goto-input" placeholder="Type a view, a date like 16 Jan, or SP 32" value={q}
        onChange={(e) => { setQ(e.target.value); setI(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(items.length - 1, n + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
          if (e.key === "Enter") pick(i);
        }} />
      <ul className="t-goto-list">
        {items.slice(0, 40).map((o, k) => (
          <li key={o.label} className={k === i ? "t-selected" : ""} onMouseEnter={() => setI(k)} onClick={() => pick(k)}>
            <span>{o.label}</span><em>{o.hint}</em>
          </li>
        ))}
        {!items.length && <li className="t-muted">Nothing matches. Try a view name, a January date, or an SP number.</li>}
      </ul>
    </>
  );
}

function DatePicker() {
  const t = useTerminal();
  const days = t.meta.decision_days;
  const lead = (calendar(days[0]).getUTCDay() + 6) % 7; // Monday-first offset
  return (
    <>
      <p className="t-muted">Pick the decision day. Power is bought for delivery the following day.</p>
      <div className="t-cal">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => <b key={w}>{w}</b>)}
        {Array.from({ length: lead }, (_, k) => <span key={`e${k}`} />)}
        {days.map((d) => (
          <button key={d} type="button" className={d === t.day ? "t-selected" : ""}
            onClick={() => { t.setDay(d); t.setDrawer(null); }}>
            {Number(d.slice(8))}
          </button>
        ))}
      </div>
      <p className="t-muted">
        Selected: decide {longDay(calendar(t.day).getTime())}, deliver {longDay(calendar(addDays(t.day, 1)).getTime())}.
      </p>
    </>
  );
}

function Config() {
  const t = useTerminal();
  const p = t.params;
  return (
    <>
      <p className="t-muted">
        Prices and rates are scenario assumptions you set here. They are not part of the Elexon data.
      </p>
      <div className="t-form">
        <TallyInput label="Demand to cover" value={p.demandMw} step={500} min={0} suffix="MW" width={90}
          onChange={(v) => t.setParam("demandMw", v)} />
        <TallyInput label="Day-ahead price" value={p.daPrice} step={5} prefix="£" suffix="/MWh"
          onChange={(v) => t.setParam("daPrice", v)} />
        <TallyInput label="Shortfall penalty" value={p.penalty} step={5} min={0} prefix="£" suffix="/MWh"
          onChange={(v) => t.setParam("penalty", v)} title="Paid on top of the day-ahead price for each MWh short" />
        <TallyInput label="Spill discount" value={p.longRate} step={5} min={0} prefix="£" suffix="/MWh"
          onChange={(v) => t.setParam("longRate", v)} title="Lost per MWh of surplus sold back" />
        <TallyInput label="Assumed wind capacity" value={p.capacityMw} step={1000} min={1000} suffix="MW" width={90}
          onChange={(v) => t.setParam("capacityMw", v)} title="Used only for the capacity-factor basis (B)" />
        <TallyInput label="Stress: wind shortfall" value={p.stressPct} step={5} min={0} max={50} suffix="%"
          onChange={(v) => t.setParam("stressPct", v)} />
        <label className="t-field">
          <span className="t-field-label"><kbd>Z</kbd>Risk tolerance</span>
          <select value={String(p.risk)} onChange={(e) => t.setParam("risk", Number(e.target.value))}>
            {RISK_PRESETS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            {!RISK_PRESETS.some((r) => r.value === p.risk) && <option value={p.risk}>{Math.round(p.risk * 100)}% to P10</option>}
          </select>
        </label>
      </div>
      <p className="t-muted">
        Likely range quantiles: P{Math.round(t.meta.band_quantiles[0] * 100)} to P{Math.round(t.meta.band_quantiles[1] * 100)},
        from the previous {t.meta.error_lookback_days} days of errors (set in the backend).
      </p>
      <h3>Saved scenarios <kbd>L</kbd></h3>
      {t.scenarios.length === 0 && <p className="t-muted">None yet. Press L to save the current setup.</p>}
      <ul className="t-goto-list">
        {t.scenarios.map((s) => (
          <li key={s.name} onClick={() => t.loadScenario(s)}>
            <span>{s.name}: decide {s.day}, gate {s.gate}</span>
            <em>{s.params.demandMw.toLocaleString("en-GB")} MW, £{s.params.daPrice}</em>
          </li>
        ))}
      </ul>
    </>
  );
}

function Help() {
  const keys: [string, string][] = [
    ["Alt+G", "Go to a view, date or settlement period"],
    ["F2 / K", "Pick the decision day"],
    ["F3 / Y", "Cycle gate closure: 09:20, 09:50, 11:00, 12:00"],
    ["F4", "Re-run the calculations (needed when Live Recalc is off)"],
    ["F5", "Detailed 48 settlement periods or condensed 24 hours"],
    ["F6", "Stress test: cut expected and actual wind by 20%"],
    ["F7", "Hedge on the bias-adjusted forecast or the raw one"],
    ["F8 / E", "Export the blotter as CSV"],
    ["B", "Show values as MWh, capacity factor % or £"],
    ["H", "Next view"],
    ["Z", "Cycle risk tolerance"],
    ["O", "Show or hide actual outturn (hindsight)"],
    ["M", "Demo jitter on or off (simulated, flagged in red)"],
    ["L", "Save the current scenario"],
    ["F12", "Configure prices and parameters"],
    ["↑ ↓ / Enter", "Move the selection bar / open the period detail"],
    ["← →", "Move between tiles"],
    ["Esc / Q", "Close or go back / return to the brief"],
  ];
  return (
    <div className="t-help">
      <table className="t-table">
        <tbody>
          {keys.map(([k, v]) => <tr key={k}><td style={{ width: 120 }}><kbd>{k}</kbd></td><td style={{ textAlign: "left" }}>{v}</td></tr>)}
        </tbody>
      </table>
      <h3>How the numbers are made</h3>
      <ul>
        <li>Forecasts and outturn are Elexon WINDFOR and FUELHH (wind) for decisions made in January 2026.</li>
        <li>The forecast for a decision is the latest run published before gate closure. Nothing later is used.</li>
        <li>Bias-adjusted = forecast minus the average error seen at the same lead time over the previous 14 days.</li>
        <li>Wind counted on slides from the hedge forecast (risk 0%) to the P10 floor (risk 100%).</li>
        <li>Contracted = demand minus wind counted on. Expected shortfall assumes outturn is normally distributed
          around the bias-adjusted forecast, with spread taken from the P10 to P90 range.</li>
        <li>In detailed mode, hourly forecasts are interpolated to half-hours. Outturn is half-hourly.</li>
        <li>Prices, penalties and capacity are your inputs (F12), not market data.</li>
      </ul>
    </div>
  );
}

function Inspect({ t: at }: { t: number }) {
  const t = useTerminal();
  const r = t.rows.find((x) => x.t === at);
  const d = t.decision.data;
  if (!r || !d) return <p className="t-muted">This period is not in the current view.</p>;
  const hourT = r.hours === 0.5 && (r.t / HALF_HOUR) % 2 === 1 ? r.t - HALF_HOUR : r.t;
  const iso = new Date(hourT).toISOString().replace(".000Z", "Z");
  const runs = [
    { label: `Latest ${r.publishTime ? time(r.publishTime) : ""}`, mw: d.points.find((p) => p.t === iso)?.forecast ?? null },
    ...d.previous_runs.map((run) => ({
      label: `${time(run.publish_time)} (${run.hours_before_latest.toFixed(0)} h earlier)`,
      mw: run.points.find((p) => p.t === iso)?.forecast ?? null,
    })),
  ];
  const kv: [string, ReactNode][] = [
    ["Settlement period", `SP ${r.sp}${r.spEnd !== r.sp ? `–${r.spEnd}` : ""}`],
    ["Time slot (UK)", slotLabel(r.t, r.hours)],
    ["Lead time", r.leadH != null ? `${r.leadH.toFixed(1)} h` : "–"],
    ["Raw forecast", `${int(r.forecast)} MW`],
    ["Bias-adjusted", `${int(r.adjusted)} MW`],
    ["Hedge base", `${int(r.base)} MW${r.edited ? " (edited)" : ""}`],
    ["P10 floor / P90 ceiling", `${int(r.floor)} / ${int(r.ceil)} MW`],
    ["Wind counted on", `${int(r.counted)} MW`],
    ["Contracted", `${int(r.contracted)} MW`],
    ["Expected shortfall", `${int(r.expShortMw)} MW`],
    ["Expected imbalance cost", gbp(r.expCashout)],
    ["Actual (hindsight)", r.actual != null ? `${int(r.actual)} MW` : t.showActuals ? "not available" : "hidden (O)"],
  ];
  return (
    <>
      <table className="t-table t-kv"><tbody>
        {kv.map(([k, v]) => <tr key={k}><td style={{ textAlign: "left" }}>{k}</td><td>{v}</td></tr>)}
      </tbody></table>
      <h3>Forecast runs for this hour</h3>
      <table className="t-table t-kv"><tbody>
        {runs.map((x) => <tr key={x.label}><td style={{ textAlign: "left" }}>{x.label}</td><td>{x.mw != null ? `${int(x.mw)} MW` : "–"}</td></tr>)}
      </tbody></table>
      <div className="t-drawer-actions">
        <button type="button" className="t-btn" onClick={() => t.setOverride(r.t, { ...t.overrides[r.t], contracted: Math.round(r.recommended) })}>
          Auto-balance this period
        </button>
        <button type="button" className="t-btn" onClick={() => t.setOverride(r.t, undefined)} disabled={!t.overrides[r.t]}>
          Clear edits
        </button>
      </div>
    </>
  );
}
