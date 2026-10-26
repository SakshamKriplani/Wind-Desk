import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { buildPeriods, runStrategy, slotLabel, type Period, type Scenario, type StrategyId, type StrategyResult } from "../calc";
import { Gauge } from "../components/charts/Gauge";
import { Num } from "../components/tally/Num";
import { TallyBadge } from "../components/tally/TallyBadge";
import { TallyInput } from "../components/tally/TallyInput";
import { TallyTable, type Column } from "../components/tally/TallyTable";
import { TallyTile } from "../components/tally/TallyTile";
import { useTerminal } from "../context/TerminalStateContext";
import { addDays, calendar, gbp, int, longDay } from "../format";
import { useAsync } from "../hooks";

const PRICE_SCENARIOS = [
  { id: "normal", label: "Normal £65/MWh", price: 65 },
  { id: "drought", label: "Wind drought £180/MWh", price: 180 },
  { id: "negative", label: "Negative pricing −£25/MWh", price: -25 },
];
const NAMES: Record<StrategyId, string> = {
  raw: "Unhedged (raw forecast)",
  adjusted: "Bias-adjusted hedge",
  p10: "P10 conservative hedge",
  custom: "Your volume (slider)",
};

export function TerminalSimulatorView() {
  const t = useTerminal();
  const p = t.params;
  const d = t.decision.data;
  const periods = t.hindsightPeriods;
  const [rampOn, setRampOn] = useState(false);
  const [rampPct, setRampPct] = useState(30);
  const [rampFrom, setRampFrom] = useState(33); // SP 33 = 16:00
  const [volume, setVolume] = useState<number | null>(null);

  const scenario: Scenario = useMemo(() => ({
    daPrice: t.applied.daPrice,
    penalty: t.applied.penalty,
    longRate: t.applied.longRate,
    demandMw: t.applied.demandMw,
    windLoss: (per: Period) => {
      const ramp = rampOn && per.sp >= rampFrom ? rampPct / 100 : 0;
      return 1 - (1 - ramp) * (1 - t.applied.stressPct / 100);
    },
  }), [t.applied, rampOn, rampFrom, rampPct]);

  const base = useMemo(() => {
    const out: Partial<Record<StrategyId, StrategyResult>> = {};
    (["raw", "adjusted", "p10"] as StrategyId[]).forEach((id) => {
      const r = runStrategy(id, periods, scenario);
      if (r) out[id] = r;
    });
    return out;
  }, [periods, scenario]);

  // slider range: from relying on the P90 ceiling to relying on the P10 floor, with a margin
  const demandMwh = periods.reduce((s, x) => s + t.applied.demandMw * x.hours, 0);
  const sumWind = (f: (x: Period) => number) => periods.reduce((s, x) => s + f(x) * x.hours, 0);
  const lo = Math.max(0, Math.floor((demandMwh - sumWind((x) => x.p90)) * 0.9 / 1000) * 1000);
  const hi = Math.ceil((demandMwh - sumWind((x) => x.p10)) * 1.1 / 1000) * 1000;
  const recommended = base.adjusted?.buyMwh ?? (lo + hi) / 2;
  useEffect(() => setVolume(null), [t.day, t.gate]);
  const vol = volume ?? Math.round(recommended);
  const custom = useMemo(() => runStrategy("custom", periods, scenario, vol), [periods, scenario, vol]);

  if (t.decision.error) return <p className="t-empty t-neg">Could not load the decision: {t.decision.error}</p>;
  if (!d || t.calcStatus !== "ready") {
    return (
      <div className="t-view">
        <TallyTile title="Scenario sandbox">
          <p className="t-empty">
            {t.calcStatus === "empty"
              ? "The sandbox settles trades against the loaded decision. Run the calculation first."
              : `⟳ ${t.calcStep}`}
          </p>
          {t.calcStatus === "empty" && <button type="button" className="t-exec" onClick={t.compute}>⚡ Execute Calculation <kbd>F4</kbd></button>}
        </TallyTile>
      </div>
    );
  }
  if (!base.raw || !custom) {
    return <p className="t-empty">Outturn for this delivery day is incomplete, so the sandbox cannot settle trades. Pick another day (F2).</p>;
  }

  const results = [base.raw, base.adjusted!, base.p10!, custom];
  const best = Math.min(...results.map((r) => r.total));
  const pnl = base.raw.total - custom.total;
  const scenarioId = PRICE_SCENARIOS.find((s) => s.price === p.daPrice)?.id ?? "custom";

  const cols: Column<StrategyResult>[] = [
    { key: "s", header: "STRATEGY", align: "left", render: (r) => NAMES[r.id] },
    { key: "buy", header: "DA BUY (MWh)", render: (r) => <Num value={r.buyMwh} format={(v) => int(v)} /> },
    { key: "short", header: "SHORT (MWh)", render: (r) => <Num value={r.shortMwh} format={(v) => int(v)} />, cellClass: () => "t-neg" },
    { key: "long", header: "LONG (MWh)", render: (r) => <Num value={r.longMwh} format={(v) => int(v)} /> },
    { key: "da", header: "DA COST (£)", render: (r) => <Num value={r.daCost} format={gbp} /> },
    { key: "cash", header: "CASHOUT (£)", render: (r) => <Num value={r.cashout} format={gbp} /> },
    { key: "tot", header: "TOTAL COST (£)", render: (r) => <b><Num value={r.total} format={gbp} /></b> },
    {
      key: "vs", header: "VS UNHEDGED (£)",
      render: (r) => <Num value={base.raw!.total - r.total} format={(v) => `${(v ?? 0) >= 0 ? "+" : ""}${gbp(v)}`} />,
      cellClass: (r) => (base.raw!.total - r.total >= 0 ? "t-pos" : "t-neg"),
    },
    { key: "best", header: "", align: "center", render: (r) => (r.total === best ? <TallyBadge tone="ok">BEST</TallyBadge> : null) },
  ];

  const txns = custom.lines.filter((l) => l.short > 0.5 || l.long > 0.5);

  return (
    <div className="t-view">
      <div className="t-grid t-grid-sim">
        <TallyTile title="What-if settings" rows={2}>
          <div className="t-form">
            <label className="t-field">
              <span className="t-field-label">Market price scenario</span>
              <select value={scenarioId} onChange={(e) => {
                const s = PRICE_SCENARIOS.find((x) => x.id === e.target.value);
                if (s) t.setParam("daPrice", s.price);
              }}>
                {PRICE_SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                {scenarioId === "custom" && <option value="custom">Custom £{p.daPrice}/MWh (F12)</option>}
              </select>
            </label>
            <TallyInput label="Shortfall penalty" value={p.penalty} step={5} min={0} prefix="£" suffix="/MWh"
              onChange={(v) => t.setParam("penalty", v)} onRefresh={t.recalc} width={60} />
            <TallyInput label="Spill discount" value={p.longRate} step={5} min={0} prefix="£" suffix="/MWh"
              onChange={(v) => t.setParam("longRate", v)} width={60} />
            <TallyInput label="Demand" value={p.demandMw} step={500} min={0} suffix="MW"
              onChange={(v) => t.setParam("demandMw", v)} width={76} />
            <label className="t-check">
              <input type="checkbox" checked={rampOn} onChange={(e) => setRampOn(e.target.checked)} />
              Wind ramp-down event (sudden curtailment)
            </label>
            {rampOn && (
              <>
                <TallyInput label="Wind lost" value={rampPct} step={5} min={5} max={90} suffix="%" onChange={setRampPct} width={50} />
                <TallyInput label="From settlement period" value={rampFrom} step={1} min={1} max={48} prefix="SP" onChange={setRampFrom} width={50} />
              </>
            )}
          </div>
          <p className="t-note">
            Settled against the real outturn for {longDay(calendar(addDays(t.day, 1)).getTime())}.
            Short volume costs the day-ahead price plus the penalty; surplus is sold back at the day-ahead price minus the spill discount.
            Prices are scenario inputs, not Elexon data.
          </p>
        </TallyTile>

        <TallyTile span={2} title="Volume purchased day-ahead">
          <div className="t-slider-row">
            <input type="range" className="t-range" min={lo} max={hi} step={500} value={vol}
              onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume purchased" />
            <span className="t-slider-val"><Num value={vol} format={(v) => `${int(v)} MWh`} delta={(dv) => `${dv > 0 ? "+" : ""}${int(dv)}`} /></span>
            <button type="button" className="t-mini" onClick={() => setVolume(null)}>⌥ Auto-Hedge</button>
          </div>
          <div className="t-slider-marks">
            <span>{int(lo)}</span>
            <span>raw {int(base.raw.buyMwh)}</span>
            <span>adjusted {int(base.adjusted!.buyMwh)}</span>
            <span>P10 {int(base.p10!.buyMwh)}</span>
            <span>{int(hi)}</span>
          </div>
          <div className="t-sim-out">
            <Gauge value={pnl} range={Math.max(50000, Math.abs(pnl) * 1.4)} label="P&L vs unhedged" />
            <dl className="t-kv-grid">
              <dt>Total cost</dt><dd><Num value={custom.total} format={gbp} delta={(dv) => gbp(dv)} invert /></dd>
              <dt>Cashout</dt><dd><Num value={custom.cashout} format={gbp} invert /></dd>
              <dt>Short</dt><dd className="t-neg"><Num value={custom.shortMwh} format={(v) => `${int(v)} MWh`} invert /></dd>
              <dt>Long</dt><dd><Num value={custom.longMwh} format={(v) => `${int(v)} MWh`} /></dd>
            </dl>
          </div>
        </TallyTile>

        <TallyTile span={2} title="Strategy comparison (this delivery day)">
          <TallyTable caption="Strategy comparison" columns={cols} groups={[{ id: "s", title: "", rows: results }]} flat
            rowKey={(r) => r.id} selected={null} onSelect={() => undefined} />
        </TallyTile>

        <TallyTile title={`Cashout transactions: your volume (${txns.length})`}>
          <ul className="t-txns">
            {txns.map((l) => (
              <li key={`${l.t}-${vol}`} className="t-txn">
                <span>SP {l.sp}</span>
                <span>{slotLabel(l.t, l.hours)}</span>
                <span className={l.short > 0 ? "t-neg" : "t-pos"}>
                  {l.short > 0 ? `SHORT ${int(l.short * l.hours)} MWh` : `LONG ${int(l.long * l.hours)} MWh`}
                </span>
                <b className={l.cashout > 0 ? "t-neg" : "t-pos"}>{l.cashout > 0 ? "−" : "+"}{gbp(Math.abs(l.cashout))}</b>
              </li>
            ))}
          </ul>
        </TallyTile>

        <MonthBacktest scenario={scenario} />
      </div>
    </div>
  );
}

/** The three rule-based strategies over every January decision, under the same scenario. */
function MonthBacktest({ scenario }: { scenario: Scenario }) {
  const t = useTerminal();
  const gate = t.committed?.gate ?? t.gate;
  const all = useAsync(() => Promise.all(t.meta.decision_days.map((d) => api.decision(d, gate))), [gate]);
  const summary = useMemo(() => {
    if (!all.data) return null;
    const ids: StrategyId[] = ["raw", "adjusted", "p10"];
    const acc = Object.fromEntries(ids.map((id) => [id, { id, total: 0, cash: 0, short: 0, long: 0, wins: 0, days: 0 }]));
    for (const d of all.data) {
      const ps = buildPeriods(d, null, false);
      const res = ids.map((id) => runStrategy(id, ps, scenario)).filter((r): r is StrategyResult => r != null);
      if (res.length !== ids.length) continue;
      const min = Math.min(...res.map((r) => r.total));
      res.forEach((r) => {
        const a = acc[r.id];
        a.total += r.total; a.cash += r.cashout; a.short += r.shortMwh; a.long += r.longMwh; a.days += 1;
        if (r.total === min) a.wins += 1;
      });
    }
    return ids.map((id) => acc[id]);
  }, [all.data, scenario]);

  return (
    <TallyTile span={2} title={`January backtest: all decisions at ${gate}, same scenario (hourly)`}>
      {!summary ? <p className="t-note">Loading 31 decisions…</p> : (
        <table className="t-table">
          <thead><tr>
            <th style={{ textAlign: "left" }}>STRATEGY</th><th>DAYS</th><th>SHORT (MWh)</th><th>LONG (MWh)</th>
            <th>CASHOUT (£)</th><th>TOTAL COST (£)</th><th>VS UNHEDGED (£)</th><th>DAYS CHEAPEST</th>
          </tr></thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.id}>
                <td style={{ textAlign: "left" }}>{NAMES[s.id as StrategyId]}</td>
                <td>{s.days}</td>
                <td className="t-neg">{int(s.short)}</td>
                <td>{int(s.long)}</td>
                <td>{gbp(s.cash)}</td>
                <td><b>{gbp(s.total)}</b></td>
                <td className={summary[0].total - s.total >= 0 ? "t-pos" : "t-neg"}>
                  {summary[0].total - s.total >= 0 ? "+" : ""}{gbp(summary[0].total - s.total)}
                </td>
                <td>{s.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TallyTile>
  );
}
