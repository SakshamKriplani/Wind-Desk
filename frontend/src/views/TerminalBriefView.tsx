import { useMemo } from "react";
import { BLOCKS, blockOf, slotLabel, type Row } from "../calc";
import { TallyBarChart } from "../components/charts/TallyBarChart";
import { TallyLineChart } from "../components/charts/TallyLineChart";
import { Num } from "../components/tally/Num";
import { TallyBadge } from "../components/tally/TallyBadge";
import { TallyInput } from "../components/tally/TallyInput";
import { TallyTable, type Column } from "../components/tally/TallyTable";
import { TallyTile } from "../components/tally/TallyTile";
import { useTerminal } from "../context/TerminalStateContext";
import { atLeast } from "../pipeline";
import { addDays, calendar, gbp, hours, int, longDay, signed, time } from "../format";
import { BasisCell, basisUnit, shortClass } from "./shared";

/** Start of the delivery day as epoch ms, for chart axes before data exists (January: UK = UTC). */
const deliveryStart = (decisionDay: string) => Date.parse(`${addDays(decisionDay, 1)}T00:00:00Z`);

export function TerminalBriefView() {
  const t = useTerminal();
  const d = t.decision.data;
  const { tot, rows, applied: p } = t;
  const st = t.calcStatus;
  const metricsOn = !!d && atLeast(st, "computing_metrics");
  const chartsOn = !!d && atLeast(st, "drawing_charts");
  const tableOn = !!d && atLeast(st, "populating_table");
  const ready = !!d && st === "ready";
  const axisDay = t.committed?.day ?? t.day;
  const start = d ? new Date(d.delivery_start).getTime() : deliveryStart(axisDay);
  const end = d ? new Date(d.delivery_end).getTime() : start + 24 * 3600e3;

  const blocks = useMemo(
    () => BLOCKS.map((b) => {
      const rs = rows.filter((r) => blockOf(r.sp) === b.id);
      const e = (f: (r: Row) => number) => Math.round(rs.reduce((s, r) => s + f(r) * r.hours, 0));
      return {
        block: b.id === "overnight" ? "Overnight SP1–13" : b.id === "peak" ? "Peak SP14–38" : "Late SP39–48",
        contracted: e((r) => r.contracted),
        expected: e((r) => r.expected),
        shortfall: e((r) => r.expShortMw),
      };
    }),
    [rows],
  );

  if (d && !rows.length) {
    return <p className="t-empty">No forecast was published before {t.committed?.gate} for this delivery day. Press F3 for a later gate.</p>;
  }

  const s = d?.summary;
  const mwhDelta = (v: number) => signed(v, "MWh");
  const gbpDelta = (v: number) => `${v > 0 ? "+" : ""}${gbp(v)}`;
  const buy = tot.demandMwh - tot.countedMwh;
  const show = <T,>(v: T) => (metricsOn ? v : null);
  const awaiting = t.calcStatus === "empty" ? "[Awaiting calculation]" : "[Computing…]";
  const fig = (v: number | null | undefined, i: number, fmt: (x: number | null | undefined) => string, delta?: (x: number) => string) => (
    <Num value={show(v)} format={fmt} delta={delta} placeholder="---" countUp delayMs={i * 70} />
  );
  const mwh = (v: number | null | undefined) => `${int(v)} MWh`;
  const watermark = (
    <>
      <b>{t.calcStatus === "empty" ? "⚡ RUN CALCULATION TO RENDER CURVES" : "⟳ CALCULATING…"}</b>
      <span>Settlement: {addDays(axisDay, 1)} | Gate: {t.committed?.gate ?? t.gate} UK</span>
      {t.calcStatus === "empty" && <span>Press F4 or Enter</span>}
    </>
  );

  const cols: Column<Row>[] = [
    { key: "sp", header: "SP", align: "left", width: 46, render: (r) => r.spEnd !== r.sp ? `${r.sp}–${r.spEnd}` : r.sp },
    { key: "slot", header: "TIME SLOT", align: "left", render: (r) => slotLabel(r.t, r.hours) },
    { key: "raw", header: `RAW (${basisUnit(t.basis)})`, render: (r) => <BasisCell mw={r.forecast} r={r} /> },
    { key: "adj", header: `BIAS ADJ`, render: (r) => <BasisCell mw={r.adjusted} r={r} /> },
    { key: "counted", header: "COUNTED ON", render: (r) => <BasisCell mw={r.counted} r={r} /> },
    { key: "contracted", header: "CONTRACTED", render: (r) => <BasisCell mw={r.contracted} r={r} /> },
    {
      key: "exp", header: "EXP. IMBALANCE (£)",
      render: (r) => <Num value={-r.expCashout} format={(v) => gbp(v)} />,
      cellClass: (r) => shortClass(r, p),
    },
  ];
  if (t.showActuals) {
    cols.push({ key: "act", header: "ACTUAL", render: (r) => (r.actual == null ? "–" : <BasisCell mw={r.actual} r={r} />) });
  }
  const n = t.detailed ? 48 : 24;
  const slot0 = (i: number) => slotLabel(start + i * (t.detailed ? 1800e3 : 3600e3), t.detailed ? 0.5 : 1);

  return (
    <div className={`t-view ${t.rehedging ? "t-rehedge" : ""}`}>
      <dl className="t-ribbon">
        <div>
          <dt>Total expected wind (P50)</dt>
          <dd>{fig(tot.forecastMwh, 0, mwh, mwhDelta)}</dd>
          <small>{metricsOn && s ? `raw forecast, run ${s.latest_publish_time ? time(s.latest_publish_time) : "–"}` : awaiting}</small>
        </div>
        <div>
          <dt>Conservative floor (P10)</dt>
          <dd>{fig(tot.p10Mwh, 1, mwh, mwhDelta)}</dd>
          <small>{metricsOn ? "sum of hourly P10" : awaiting}</small>
        </div>
        <div>
          <dt>High ceiling (P90)</dt>
          <dd>{fig(tot.p90Mwh, 2, mwh, mwhDelta)}</dd>
          <small>{metricsOn ? "sum of hourly P90" : awaiting}</small>
        </div>
        <div>
          <dt>Bias-adjusted</dt>
          <dd>{fig(tot.adjustedMwh, 3, mwh, mwhDelta)}</dd>
          {metricsOn && s ? (
            <small className={(s.typical_bias_mw ?? 0) > 0 ? "t-neg" : "t-pos"}>recent lean {signed(s.typical_bias_mw, "MW")} at this lead</small>
          ) : <small>{awaiting}</small>}
        </div>
        <div className={`t-ribbon-key ${metricsOn ? "t-unlock" : ""}`} key={metricsOn ? `k${t.computeTick}` : "k"}>
          <dt>Hedge: wind to count on</dt>
          <dd>{fig(tot.countedMwh, 4, mwh, mwhDelta)}</dd>
          <small>
            <button type="button" className="t-mini" disabled={!ready}
              onClick={() => { t.clearOverrides(); t.notify("Contracted volumes reset to the recommendation"); }}>
              ⚡ Auto-Fill
            </button>{" "}
            buy <Num value={show(buy)} format={mwh} placeholder="---" />
          </small>
        </div>
        <div>
          <dt>Expected imbalance cost</dt>
          <dd className="t-neg">{fig(-tot.expCashout, 5, gbp, gbpDelta)}</dd>
          <small>{metricsOn ? `short ${int(tot.expShortMwh)} MWh, long ${int(tot.expLongMwh)} MWh` : awaiting}</small>
        </div>
      </dl>

      <div className="t-controls">
        <label className={`t-field ${!t.hasRunInitialCalc ? "t-await" : ""}`}>
          <span className="t-field-label"><kbd>F2</kbd>Decision day</span>
          <span className="t-field-row">
            <button type="button" className="t-step" aria-label="Previous day" onClick={() => t.stepDay(-1)}>−</button>
            <input type="date" value={t.day} min={t.meta.decision_days[0]} max={t.meta.decision_days.at(-1)}
              onChange={(e) => t.setDay(e.target.value)} />
            <button type="button" className="t-step" aria-label="Next day" onClick={() => t.stepDay(1)}>+</button>
            <button type="button" className="t-mini t-inline" onClick={t.compute}>⟳ Update</button>
          </span>
        </label>
        <label className={`t-field ${!t.hasRunInitialCalc ? "t-await" : ""}`}>
          <span className="t-field-label"><kbd>F3</kbd>Gate time (UK)</span>
          <span className="t-field-row">
            <input type="time" value={t.gate} step={300} onChange={(e) => e.target.value && t.setGate(e.target.value)} />
            <button type="button" className="t-step" title="Cycle gate" onClick={t.cycleGate}>⟳</button>
            <button type="button" className="t-mini t-inline" onClick={t.compute}>⟳ Update</button>
          </span>
        </label>
        <label className="t-field t-field-wide">
          <span className="t-field-label"><kbd>Z</kbd>Risk aversion: {Math.round(t.params.risk * 100)}%
            <em>{t.rehedging ? <b className="t-busy">⟳ Re-hedging…</b> : t.params.risk === 0 ? "aggressive, rely on forecast" : t.params.risk === 1 ? "conservative, rely on P10" : "between forecast and P10"}</em>
          </span>
          <span className="t-field-row">
            <button type="button" className="t-step" onClick={() => t.setParam("risk", Math.max(0, Math.round((t.params.risk - 0.05) * 100) / 100))}>−</button>
            <input type="range" min={0} max={1} step={0.05} value={t.params.risk} className="t-range"
              onChange={(e) => t.setParam("risk", Number(e.target.value))} aria-label="Risk aversion" />
            <button type="button" className="t-step" onClick={() => t.setParam("risk", Math.min(1, Math.round((t.params.risk + 0.05) * 100) / 100))}>+</button>
            <button type="button" className="t-mini t-inline" onClick={() => t.rehedge(500)} disabled={!t.hasRunInitialCalc}>⌥ Re-Hedge</button>
          </span>
        </label>
        <TallyInput label="Cashout penalty" value={t.params.penalty} step={5} min={0} prefix="£" suffix="/MWh"
          onChange={(v) => t.setParam("penalty", v)} onRefresh={t.recalc} width={64} />
        <TallyInput label="Demand" value={t.params.demandMw} step={500} min={0} suffix="MW"
          onChange={(v) => t.setParam("demandMw", v)} onRefresh={t.recalc} width={76} />
        <TallyInput label="DA price" value={t.params.daPrice} step={5} prefix="£" suffix="/MWh"
          onChange={(v) => t.setParam("daPrice", v)} onRefresh={t.recalc} width={60} />
        <button type="button" className={`t-exec t-exec-main ${!t.hasRunInitialCalc ? "t-await" : ""}`} onClick={t.compute}
          disabled={st !== "empty" && st !== "ready"}>
          ⚡ {t.hasRunInitialCalc ? "Recompute Model" : "Execute Calculation"} <kbd>F4</kbd>
        </button>
      </div>

      <div className="t-grid">
        <TallyTile span={2} title={`Generation profile: delivery ${longDay(calendar(addDays(axisDay, 1)).getTime())}`}
          actions={<>
            <button type="button" className={`t-mini ${t.params.biasOn ? "t-on" : ""}`} onClick={t.toggleBias}><kbd>F7</kbd> Bias {t.params.biasOn ? "on" : "off"}</button>
            <button type="button" className={`t-mini ${t.showActuals ? "t-on" : ""}`} onClick={t.toggleActuals}><kbd>O</kbd> Actuals</button>
          </>}>
          <TallyLineChart rows={chartsOn ? rows : []} start={start} end={end} showActual={t.showActuals} selected={t.selected}
            onPick={(ts) => t.setSelected(ts)} height={300} empty={!chartsOn} watermark={watermark}
            animate={chartsOn && !ready} key={chartsOn ? `c${t.computeTick}` : "empty"} />
        </TallyTile>

        <TallyTile title="Decision at gate closure">
          <table className="t-table t-kv"><tbody>
            <tr><td>Decide</td><td>{longDay(calendar(axisDay).getTime())}, {t.committed?.gate ?? t.gate} UK</td></tr>
            <tr><td>Forecast run used</td><td>{metricsOn && s?.latest_publish_time ? `${time(s.latest_publish_time)} UK` : "---"}</td></tr>
            <tr><td>Run age at gate</td><td>{metricsOn && s ? hours(s.forecast_age_hours) : "---"}</td></tr>
            <tr><td>Lead time to delivery</td><td>{metricsOn && s?.lead_range_hours ? `${s.lead_range_hours[0].toFixed(0)}–${s.lead_range_hours[1].toFixed(0)} h` : "---"}</td></tr>
            <tr><td>Recent lean at this lead</td><td className={metricsOn && (s?.typical_bias_mw ?? 0) > 0 ? "t-neg" : "t-pos"}>{metricsOn && s ? signed(s.typical_bias_mw, "MW") : "---"}</td></tr>
            <tr><td>Typical hourly miss</td><td>{metricsOn && s ? `± ${int(s.typical_mae_mw)} MW` : "---"}</td></tr>
            <tr><td>History samples</td><td>{metricsOn && s ? int(s.history_samples) : "---"}</td></tr>
            <tr><td>Hedge built on</td><td>{t.params.biasOn ? <TallyBadge tone="info">BIAS-ADJUSTED</TallyBadge> : <TallyBadge tone="warn">RAW FORECAST</TallyBadge>}</td></tr>
            <tr><td>Manual edits</td><td>{Object.keys(t.overrides).length || "none"}</td></tr>
          </tbody></table>
          {metricsOn && s && (s.typical_bias_mw ?? 0) > 100 && (
            <p className="t-note">
              Forecasts at this lead ran {int(s.typical_bias_mw)} MW high over the last {t.meta.error_lookback_days} days.
              {t.params.biasOn ? " The hedge already allows for it." : " Press F7 to hedge on the adjusted forecast."}
            </p>
          )}
        </TallyTile>

        <TallyTile title="Purchase vs cashout exposure by block (MWh)">
          <TallyBarChart data={chartsOn ? blocks : blocks.map((b) => ({ ...b, contracted: 0, expected: 0, shortfall: 0 }))}
            category="block" height={250} empty={!chartsOn} watermark={<b>{t.calcStatus === "empty" ? "Awaiting calculation" : "⟳ Calculating…"}</b>}
            animate={chartsOn && !ready} key={chartsOn ? `b${t.computeTick}` : "empty"}
            format={(v) => `${Math.round(v / 1000)}k`}
            series={[
              { key: "contracted", label: "Contracted", color: "#3b95d6" },
              { key: "expected", label: "Expected wind", color: "#0e3e78" },
              { key: "shortfall", label: "Expected shortfall", color: "#c5221f" },
            ]} />
        </TallyTile>

        <TallyTile span={2} title={`Settlement ledger (${t.detailed ? "48 SP" : "24 h"}, ${t.basis})`}
          actions={<>
            <button type="button" className="t-mini" onClick={t.toggleDetailed}><kbd>F5</kbd> {t.detailed ? "Condense" : "Detail"}</button>
            <button type="button" className="t-mini" onClick={() => t.setView("ledger")}>Open full ledger</button>
          </>}>
          <TallyTable
            caption="Settlement ledger"
            columns={cols}
            groups={[{ id: "all", title: "All", rows }]}
            flat
            rowKey={(r) => r.t}
            selected={t.selected}
            onSelect={(k) => t.setSelected(k as number)}
            onActivate={(r) => t.setDrawer({ kind: "inspect", t: r.t })}
            maxHeight={300}
            rowClass={(r) => (r.edited || t.overrides[r.t]?.contracted != null ? "t-edited" : undefined)}
            placeholder={tableOn ? undefined : {
              rows: 12,
              cell: (i, key) => (key === "sp" ? String(i + 1).padStart(2, "0") : key === "slot" ? slot0(i) : undefined),
              footer: `Rows: 0/${n} computed | Net exposure: £0.00`,
            }}
            cascade={st === "populating_table"}
          />
        </TallyTile>

        <TallyTile title="Hindsight check" actions={<button type="button" className="t-mini" onClick={t.toggleActuals}><kbd>O</kbd> {t.showActuals ? "Hide" : "Show"}</button>}>
          {!ready ? (
            <p className="t-note">--- Available once the calculation is complete.</p>
          ) : !t.showActuals ? (
            <p className="t-note">Hidden so this screen shows only what was known at {t.committed?.gate}. Press O to compare with what actually happened.</p>
          ) : tot.actualMwh == null ? (
            <p className="t-note">Outturn for this delivery day is incomplete.</p>
          ) : (
            <table className="t-table t-kv"><tbody>
              <tr><td>Actual wind</td><td>{int(tot.actualMwh)} MWh</td></tr>
              <tr><td>Raw forecast miss</td><td className={tot.forecastMwh > tot.actualMwh ? "t-neg" : "t-pos"}>{signed(tot.forecastMwh - tot.actualMwh, "MWh")}</td></tr>
              <tr><td>Bias-adjusted miss</td><td className={tot.adjustedMwh > tot.actualMwh ? "t-neg" : "t-pos"}>{signed(tot.adjustedMwh - tot.actualMwh, "MWh")}</td></tr>
              <tr><td>Hedge base mean miss</td><td>{int(tot.wmaeMw)} MW</td></tr>
              <tr><td>Realised imbalance cost</td><td className="t-neg">{gbp(-(tot.realCashout ?? 0))}</td></tr>
              <tr><td>Expected was</td><td>{gbp(-tot.expCashout)}</td></tr>
            </tbody></table>
          )}
          <p className="t-note">Values: {p.biasOn ? "bias-adjusted" : "raw"} hedge, demand {int(p.demandMw)} MW, risk {Math.round(p.risk * 100)}%.</p>
        </TallyTile>
      </div>
    </div>
  );
}
