import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../api";
import { TallyBarChart } from "../components/charts/TallyBarChart";
import { Num } from "../components/tally/Num";
import { TallyBadge, type BadgeTone } from "../components/tally/TallyBadge";
import { TallyTable, type Column } from "../components/tally/TallyTable";
import { TallyTile } from "../components/tally/TallyTile";
import { useTerminal } from "../context/TerminalStateContext";
import { calendar, gbp, int, pct, shortDay, signed } from "../format";
import { useAsync } from "../hooks";
import type { Accuracy, DailyAccuracy, Metrics } from "../types";

type HRow = Metrics & { horizon_h: number; label: string };

// Status thresholds, stated in the tile header so the rule is visible.
const horizonStatus = (nmae: number | null): [BadgeTone, string] =>
  nmae == null ? ["info", "n/a"] : nmae <= 12 ? ["ok", "OK"] : nmae <= 18 ? ["warn", "Degraded"] : ["crit", "Critical"];
const dayStatus = (pctMiss: number | null): [BadgeTone, string] => {
  const a = Math.abs(pctMiss ?? 0);
  return pctMiss == null ? ["info", "n/a"] : a <= 5 ? ["ok", "OK"] : a <= 15 ? ["warn", "Degraded"] : ["crit", "Critical"];
};

export function TerminalAccuracyView() {
  const t = useTerminal();
  const gate = t.committed?.gate ?? null;
  const acc = useAsync(() => (gate ? api.accuracy(gate) : Promise.resolve(null)), [gate]);
  if (acc.error) return <p className="t-empty t-neg">Could not load accuracy: {acc.error}</p>;
  if (!acc.data || t.calcStatus !== "ready") return <MatrixSkeleton />;
  return <Matrix a={acc.data} />;
}

/** Layout of the matrix with dashes, shown until a calculation has run. */
function MatrixSkeleton() {
  const t = useTerminal();
  const labels = ["Overall WAPE", "Systematic bias", "Band hit rate (P10–P90)", "Total imbalance loss", "With bias adjustment", "Days over-forecast"];
  const cols: Column<number>[] = ["HORIZON", "SAMPLES (N)", "MAE (MW)", "RMSE (MW)", "BIAS (MW)", "WORST OVER-FCST (MW)", "WORST UNDER-FCST (MW)", "nMAE", "STATUS"]
    .map((h, i) => ({ key: String(i), header: h, align: i === 0 ? "left" : i === 8 ? "center" : "right", render: () => null }));
  const horizons = ["1 hour ahead", "4 hours ahead", "Day-ahead gate", "24 hours ahead", "36 hours ahead"];
  const busy = t.calcStatus !== "empty";
  return (
    <div className="t-view">
      <dl className="t-ribbon">
        {labels.map((l) => (
          <div key={l}><dt>{l}</dt><dd className="t-placeholder">---</dd><small>{busy ? "[Computing…]" : "[Awaiting calculation]"}</small></div>
        ))}
      </dl>
      <TallyTile title="Lead-time horizon performance"
        actions={!busy && <button type="button" className="t-exec" onClick={t.compute}>⚡ Execute Calculation <kbd>F4</kbd></button>}>
        <TallyTable caption="Horizon performance" columns={cols} groups={[]} rowKey={(r) => r} selected={null} onSelect={() => undefined}
          placeholder={{
            rows: horizons.length,
            cell: (i, key) => (key === "0" ? horizons[i] : key === "8" ? (busy ? "Computing…" : "Awaiting calc") : undefined),
            footer: busy ? "Scoring every January decision at the chosen gate…" : "Accuracy is scored for all 31 January decisions once you run the calculation.",
          }} />
      </TallyTile>
    </div>
  );
}

function Matrix({ a }: { a: Accuracy }) {
  const t = useTerminal();
  const p = t.applied;
  const s = a.summary;
  const [gh, gm] = a.gate_closure.split(":").map(Number);
  const gateLead = Math.round(24 - (gh + gm / 60));

  const pick = (h: number, label: string): HRow | null => {
    const m = a.by_horizon.find((x) => x.horizon_h === h);
    return m ? { ...m, label } : null;
  };
  const horizons = [
    pick(1, "1 hour ahead"),
    pick(4, "4 hours ahead"),
    pick(gateLead, `${gateLead} hours ahead (day-ahead gate)`),
    pick(24, "24 hours ahead"),
    pick(36, "36 hours ahead"),
  ].filter((x): x is HRow => x != null);

  const loss = (k: "raw" | "adjusted") => s.imbalance[k].short_mwh * p.penalty + s.imbalance[k].long_mwh * p.longRate;
  const lossRaw = loss("raw");
  const lossAdj = loss("adjusted");

  const hCols: Column<HRow>[] = [
    { key: "h", header: "HORIZON", align: "left", render: (r) => r.label },
    { key: "n", header: "SAMPLES (N)", render: (r) => int(r.n) },
    { key: "mae", header: "MAE (MW)", render: (r) => int(r.mae) },
    { key: "rmse", header: "RMSE (MW)", render: (r) => int(r.rmse) },
    { key: "bias", header: "BIAS (MW)", render: (r) => signed(r.bias, ""), cellClass: (r) => ((r.bias ?? 0) > 0 ? "t-neg" : "t-pos") },
    { key: "over", header: "WORST OVER-FCST (MW)", render: (r) => int(r.max_over) },
    { key: "under", header: "WORST UNDER-FCST (MW)", render: (r) => int(r.max_under) },
    { key: "nmae", header: "nMAE", render: (r) => pct(r.nmae_pct, 1) },
    { key: "st", header: "STATUS", align: "center", render: (r) => { const [tone, l] = horizonStatus(r.nmae_pct); return <TallyBadge tone={tone}>{l}</TallyBadge>; } },
  ];

  const dCols: Column<DailyAccuracy>[] = [
    { key: "day", header: "DELIVERY DAY", align: "left", render: (r) => shortDay(calendar(r.delivery_day).getTime()) },
    { key: "f", header: "FORECAST (MWh)", render: (r) => int(r.forecast_energy_mwh) },
    { key: "a", header: "ACTUAL (MWh)", render: (r) => int(r.actual_energy_mwh) },
    { key: "miss", header: "MISS (MWh)", render: (r) => signed(r.energy_error_mwh, ""), cellClass: (r) => ((r.energy_error_mwh ?? 0) > 0 ? "t-neg" : "t-pos") },
    { key: "pct", header: "MISS %", render: (r) => pct(r.energy_error_pct, 1) },
    { key: "adj", header: "ADJ. MISS (MWh)", render: (r) => signed(r.adjusted_energy_error_mwh, ""), cellClass: (r) => ((r.adjusted_energy_error_mwh ?? 0) > 0 ? "t-neg" : "t-pos") },
    { key: "mae", header: "MAE (MW)", render: (r) => int(r.mae) },
    { key: "amae", header: "ADJ. MAE (MW)", render: (r) => int(r.adjusted_mae) },
    { key: "band", header: "IN RANGE", render: (r) => pct(r.band_coverage_pct) },
    { key: "st", header: "STATUS", align: "center", render: (r) => { const [tone, l] = dayStatus(r.energy_error_pct); return <TallyBadge tone={tone}>{l}</TallyBadge>; } },
  ];

  const bars = a.by_horizon.filter((h) => h.horizon_h % 4 === 0).map((h) => ({
    horizon: `${h.horizon_h} h`, mae: h.mae ?? 0, p90: h.p90_abs ?? 0, bias: h.bias ?? 0,
  }));
  const split = [
    { name: "Over-forecast", value: s.error_split.over_pct, color: "#c5221f" },
    { name: "Under-forecast", value: s.error_split.under_pct, color: "#3b95d6" },
    { name: `Within ±${s.error_split.tolerance_pct}%`, value: s.error_split.within_pct, color: "#107c41" },
  ];

  return (
    <div className="t-view">
      <dl className="t-ribbon">
        <div>
          <dt>Overall WAPE</dt>
          <dd><Num countUp value={s.nmae_pct} format={(v) => pct(v, 1)} /></dd>
          <small>sum |error| / sum actual, {s.days} decisions at {a.gate_closure}</small>
        </div>
        <div>
          <dt>Systematic bias</dt>
          <dd className={(s.bias ?? 0) > 0 ? "t-neg" : "t-pos"}><Num countUp value={s.bias} format={(v) => signed(v, "MW")} /></dd>
          <small>{(s.bias ?? 0) > 0 ? "over-forecasting: wind came in lower" : "under-forecasting"}</small>
        </div>
        <div>
          <dt>Band hit rate (P10–P90)</dt>
          <dd><Num countUp value={s.band_coverage_pct} format={(v) => pct(v, 1)} /></dd>
          <small>target 80%</small>
        </div>
        <div>
          <dt>Total imbalance loss</dt>
          <dd className="t-neg"><Num countUp value={-lossRaw} format={gbp} delta={(d) => gbp(d)} /></dd>
          <small>raw forecast; £{p.penalty} short, £{p.longRate} spill (F12)</small>
        </div>
        <div className="t-ribbon-key">
          <dt>With bias adjustment</dt>
          <dd className="t-pos"><Num countUp value={-lossAdj} format={gbp} delta={(d) => gbp(d)} /></dd>
          <small>saves {gbp(lossRaw - lossAdj)}; MAE {int(s.adjusted.mae)} vs {int(s.mae)} MW</small>
        </div>
        <div>
          <dt>Days over-forecast</dt>
          <dd>{s.days_over_forecast} / {s.days}</dd>
          <small>worst {s.worst_day ? shortDay(calendar(s.worst_day.delivery_day).getTime()) : "–"}, MAE {int(s.worst_day?.mae)} MW</small>
        </div>
      </dl>

      <div className="t-grid">
        <TallyTile span={3} title="Lead-time horizon performance"
          actions={<span className="t-hint">Status by nMAE: OK ≤ 12%, Degraded ≤ 18%, Critical above</span>}>
          <TallyTable caption="Horizon performance" columns={hCols} groups={[{ id: "h", title: "", rows: horizons }]} flat
            rowKey={(r) => r.horizon_h} selected={t.selected} onSelect={(k) => t.setSelected(k as number)} />
        </TallyTile>

        <TallyTile span={2} title="Error by horizon (MW), every 4 hours">
          <TallyBarChart data={bars} category="horizon" horizontal height={300} categoryWidth={48}
            format={(v) => int(v)}
            series={[
              { key: "mae", label: "MAE", color: "#3b95d6" },
              { key: "p90", label: "1-in-10 miss (P90)", color: "#0e3e78" },
              { key: "bias", label: "Bias", color: "#c5221f" },
            ]} />
        </TallyTile>

        <TallyTile title={`Error split at ${a.gate_closure} gate`}>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={split} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} startAngle={90} endAngle={-270}
                isAnimationActive={false} stroke="#ffffff">
                {split.map((x) => <Cell key={x.name} fill={x.color} />)}
              </Pie>
              <Tooltip isAnimationActive={false} formatter={(v) => `${Number(v).toFixed(1)}% of periods`} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="t-legend t-legend-col">
            {split.map((x) => <li key={x.name}><i className="t-legend-box" style={{ background: x.color }} />{x.name}: <b>{pct(x.value, 1)}</b></li>)}
          </ul>
        </TallyTile>

        <TallyTile span={3} title="Delivery-day summary (forecast at gate vs outturn)"
          actions={<span className="t-hint">Enter opens that day's brief. Status by daily energy miss: OK ≤ 5%, Degraded ≤ 15%</span>}>
          <TallyTable caption="Delivery-day summary" columns={dCols} groups={[{ id: "d", title: "", rows: a.daily }]} flat
            rowKey={(r) => r.decision_day}
            selected={t.day}
            onSelect={(k) => t.setDay(String(k))}
            onActivate={(r) => { t.setDay(r.decision_day); t.setView("brief"); }}
            maxHeight={360}
            footer={{
              day: "JANUARY",
              f: int(a.daily.reduce((x, r) => x + (r.forecast_energy_mwh ?? 0), 0)),
              a: int(a.daily.reduce((x, r) => x + (r.actual_energy_mwh ?? 0), 0)),
              miss: signed(a.daily.reduce((x, r) => x + (r.energy_error_mwh ?? 0), 0), ""),
              adj: signed(a.daily.reduce((x, r) => x + (r.adjusted_energy_error_mwh ?? 0), 0), ""),
              mae: int(s.mae),
              amae: int(s.adjusted.mae),
              band: pct(s.band_coverage_pct),
            }} />
        </TallyTile>
      </div>
    </div>
  );
}
