import { useMemo, useState } from "react";
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api";
import { ChartTip } from "../components/ChartTip";
import { DecisionStrip } from "../components/DecisionStrip";
import { Figures } from "../components/Figures";
import { Failed, Loading } from "../components/Status";
import {
  addDays, calendar, download, gwh, hours, longDay, mw, pct, signed, time, toCsv,
} from "../format";
import { useAsync } from "../hooks";
import type { Decision, Meta } from "../types";

interface Props {
  meta: Meta;
  day: string;
  gate: string;
  onDay: (d: string) => void;
  onGate: (g: string) => void;
}

export function BriefView({ meta, day, gate, onDay, onGate }: Props) {
  const { data, error, loading } = useAsync(() => api.decision(day, gate), [day, gate]);
  // Off by default: the brief is the gate-closure view; outturn is hindsight.
  const [showActual, setShowActual] = useState(false);
  const [demand, setDemand] = useState(30000);

  return (
    <>
      <DecisionStrip day={day} days={meta.decision_days} gate={gate} decision={data} onDay={onDay} onGate={onGate} />
      {error && <Failed message={error} />}
      {loading && !data && <Loading what="the day-ahead forecast" />}
      {data && (
        <Brief d={data} showActual={showActual} setShowActual={setShowActual}
          demand={demand} setDemand={setDemand} lookback={meta.error_lookback_days} />
      )}
    </>
  );
}

interface BriefProps {
  d: Decision;
  showActual: boolean;
  setShowActual: (v: boolean) => void;
  demand: number;
  setDemand: (v: number) => void;
  lookback: number;
}

function Brief({ d, showActual, setShowActual, demand, setDemand, lookback }: BriefProps) {
  const s = d.summary;
  const deliveryDay = addDays(d.decision_day, 1);
  const step = s.step_hours;

  if (!s.points_with_forecast) {
    return (
      <p className="state">
        No forecast was published before {time(d.decision_time)} for {longDay(calendar(deliveryDay).getTime())}.
        Try a later gate closure time.
      </p>
    );
  }

  const dayHours = (new Date(d.delivery_end).getTime() - new Date(d.delivery_start).getTime()) / 3600e3;
  const demandMwh = demand * dayHours;
  const minus = (wind: number | null) => (wind != null ? demandMwh - wind : null);
  const h = d.hindsight;

  return (
    <>
      <h1 className="headline">
        The latest forecast puts wind at {gwh(s.energy_mwh.p50)} for {longDay(calendar(deliveryDay).getTime())}
      </h1>
      <p className="subhead">
        What the desk sees at {time(d.decision_time)} on {longDay(calendar(d.decision_day).getTime())}: the
        newest forecast is the {time(s.latest_publish_time!)} run, published {hours(s.forecast_age_hours)} before
        gate closure. Nothing published later is used.
      </p>

      <ErrorCallout d={d} lookback={lookback} />

      <Figures
        items={[
          { label: "Average output", value: mw(s.mean_mw) },
          { label: "Peak", value: mw(s.peak?.mw), detail: s.peak && `at ${time(s.peak.t)}` },
          { label: "Lowest", value: mw(s.trough?.mw), detail: s.trough && `at ${time(s.trough.t)}` },
          {
            label: "Typical hourly miss",
            value: s.typical_mae_mw != null ? `± ${mw(s.typical_mae_mw)}` : "–",
            detail: `at this lead time, last ${lookback} days`,
          },
          {
            label: "Forecast lead time",
            value: s.lead_range_hours ? `${s.lead_range_hours[0].toFixed(0)}–${s.lead_range_hours[1].toFixed(0)} h` : "–",
            detail: "from run to delivery hour",
          },
        ]}
      />

      <div className="grid-main">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Wind forecast for delivery day</h2>
              <p className="note">
                The shaded range is where outturn landed 80% of the time for forecasts at the same lead time
                over the last {lookback} days, using only data available at gate closure.
              </p>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={showActual} onChange={(e) => setShowActual(e.target.checked)} />
              Show what actually happened
            </label>
          </div>
          <DecisionChart d={d} showActual={showActual} />
        </section>

        <aside className="panel side">
          <h2>Volume left to buy</h2>
          <p className="note">Replace the example with your own demand forecast for the day.</p>
          <label className="field" style={{ marginBottom: 12 }}>
            Demand to cover (MW, flat across the day)
            <input type="number" min={0} step={500} value={demand}
              onChange={(e) => setDemand(Math.max(0, Number(e.target.value) || 0))} />
          </label>
          <dl className="kv">
            <dt>Demand</dt><dd>{gwh(demandMwh)}</dd>
            <dt>Left to buy, using the forecast as published</dt><dd>{gwh(minus(s.energy_mwh.p50))}</dd>
            {s.energy_mwh.adjusted != null && (
              <>
                <dt>Left to buy, allowing for recent bias</dt>
                <dd className="big">{gwh(minus(s.energy_mwh.adjusted))}</dd>
              </>
            )}
            <dt>If wind comes in low (P10)</dt><dd className="bad">{gwh(minus(s.energy_mwh.p10))}</dd>
          </dl>

          {showActual && h && (
            <>
              <hr className="divider" />
              <h2>What actually happened</h2>
              <p className="note">Known only after delivery. Shown to judge the forecast, not used by it.</p>
              <dl className="kv">
                <dt>Actual wind</dt><dd>{gwh(h.actual_energy_mwh)}</dd>
                <dt>Forecast minus actual</dt>
                <dd className={(h.energy_error_mwh ?? 0) > 0 ? "bad" : "good"}>
                  {signed(h.energy_error_mwh, "MWh")}
                </dd>
                {h.adjusted_energy_error_mwh != null && (
                  <>
                    <dt>Bias-adjusted minus actual</dt>
                    <dd className={h.adjusted_energy_error_mwh > 0 ? "bad" : "good"}>
                      {signed(h.adjusted_energy_error_mwh, "MWh")}
                    </dd>
                  </>
                )}
                <dt>Average hourly miss</dt>
                <dd>{mw(h.mae)}{h.adjusted_mae != null && <> ({mw(h.adjusted_mae)} adjusted)</>}</dd>
                <dt>Hours inside range</dt><dd>{pct(h.band_coverage_pct)}</dd>
              </dl>
            </>
          )}
        </aside>
      </div>

      <HourlyTable d={d} demand={demand} step={step} showActual={showActual} />
    </>
  );
}

/** Turns the measured error into a planning figure: the accuracy loop closed on the decision screen. */
function ErrorCallout({ d, lookback }: { d: Decision; lookback: number }) {
  const s = d.summary;
  const bias = s.typical_bias_mw;
  if (bias == null || s.energy_mwh.adjusted == null) {
    return (
      <p className="callout">
        Not enough recent history at this lead time to measure the forecast's error yet.
      </p>
    );
  }
  if (Math.abs(bias) < 100) {
    return (
      <p className="callout">
        Over the last {lookback} days, forecasts made this far ahead showed no consistent lean. Expect a
        typical miss of about ±{mw(s.typical_mae_mw)} in any hour.
      </p>
    );
  }
  const high = bias > 0;
  return (
    <p className="callout">
      <strong>Allow for the forecast's recent lean.</strong> Over the last {lookback} days, forecasts made this
      far ahead came in {mw(Math.abs(bias))} {high ? "above" : "below"} actual output on average. Allowing for
      that, plan on {gwh(s.energy_mwh.adjusted)} of wind rather than {gwh(s.energy_mwh.p50)}
      {high ? ", which means buying more from the market." : ", which means buying less from the market."}
    </p>
  );
}

interface Row {
  ts: number;
  forecast: number | null;
  band: [number, number] | null;
  actual: number | null;
  adjusted: number | null;
  [run: string]: number | null | [number, number];
}

function DecisionChart({ d, showActual }: { d: Decision; showActual: boolean }) {
  const runs = d.previous_runs;
  const rows = useMemo<Row[]>(() => {
    const byTime = new Map<string, Row>();
    for (const p of d.points) {
      byTime.set(p.t, {
        ts: new Date(p.t).getTime(),
        forecast: p.forecast,
        band: p.p10 != null && p.p90 != null ? [p.p10, p.p90] : null,
        actual: p.actual,
        adjusted: p.adjusted,
      });
    }
    runs.forEach((r, i) => {
      for (const p of r.points) {
        const row = byTime.get(p.t);
        if (row) row[`run${i}`] = p.forecast;
      }
    });
    return [...byTime.values()].sort((a, b) => a.ts - b.ts);
  }, [d, runs]);

  const start = new Date(d.delivery_start).getTime();
  const end = new Date(d.delivery_end).getTime();
  const ticks = Array.from({ length: 9 }, (_, i) => start + i * 3 * 3600e3);
  const runLabel = (i: number) => `Run ${time(runs[i].publish_time)} (${runs[i].hours_before_latest.toFixed(0)} h earlier)`;

  return (
    <>
      <ul className="legend">
        <li><span className="swatch" style={{ background: "var(--sea)" }} />Latest forecast</li>
        <li><span className="swatch band" style={{ background: "var(--sea-band)" }} />Likely range (P10–P90)</li>
        <li style={{ color: "var(--ink-2)" }}><span className="swatch dash" />Allowing for recent bias</li>
        {runs.length > 0 && (
          <li style={{ color: "var(--sea-faint)" }}><span className="swatch dash" />Earlier runs</li>
        )}
        {showActual && <li><span className="swatch" style={{ background: "var(--amber)" }} />Actual outturn</li>}
      </ul>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="ts" type="number" scale="time" domain={[start, end]} ticks={ticks}
            tickFormatter={(v) => time(v)} stroke="var(--line)" />
          <YAxis width={58} stroke="var(--line)" tickFormatter={(v) => `${(v / 1000).toFixed(0)} GW`} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as Row;
              const rows = [
                { label: "Forecast", value: mw(r.forecast), color: "var(--sea)" },
                { label: "Allowing for bias", value: mw(r.adjusted), color: "var(--ink-2)" },
                { label: "Range", value: r.band ? `${mw(r.band[0])} – ${mw(r.band[1])}` : "–" },
              ];
              if (showActual) rows.push({ label: "Actual", value: mw(r.actual), color: "var(--amber)" });
              return <ChartTip title={time(r.ts)} rows={rows} />;
            }}
          />
          <Area dataKey="band" stroke="none" fill="var(--sea-band)" fillOpacity={0.55} isAnimationActive={false} />
          {runs.map((_, i) => (
            <Line key={i} dataKey={`run${i}`} name={runLabel(i)} stroke="var(--sea-faint)" strokeWidth={1.2}
              strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />
          ))}
          <Line dataKey="adjusted" stroke="var(--ink-2)" strokeWidth={1.6} strokeDasharray="6 3" dot={false}
            isAnimationActive={false} />
          <Line dataKey="forecast" stroke="var(--sea)" strokeWidth={2.6} dot={false} isAnimationActive={false} />
          {showActual && (
            <Line dataKey="actual" stroke="var(--amber)" strokeWidth={2} dot={false} isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

function HourlyTable({ d, demand, step, showActual }: { d: Decision; demand: number; step: number; showActual: boolean }) {
  const rows = d.points.map((p) => ({
    time_uk: time(p.t),
    start_time_utc: p.t,
    forecast_mw: p.forecast,
    p10_mw: p.p10,
    p90_mw: p.p90,
    adjusted_mw: p.adjusted,
    to_buy_mw: p.forecast != null ? Math.round(demand - p.forecast) : null,
    to_buy_adjusted_mw: p.adjusted != null ? Math.round(demand - p.adjusted) : null,
    to_buy_low_wind_mw: p.p10 != null ? Math.round(demand - p.p10) : null,
    actual_mw: p.actual,
    forecast_run_utc: p.publish_time,
  }));
  const res = step === 1 ? "Hourly" : "Half-hourly";

  return (
    <section className="panel">
      <details>
        <summary>{res} figures for the delivery day</summary>
        <div className="panel-head" style={{ margin: "8px 0" }}>
          <p className="note" style={{ margin: 0 }}>Times in UK local time. "To buy" uses the demand entered above.</p>
          <button className="btn" onClick={() => download(`wind-desk-${d.decision_day}.csv`, toCsv(rows))}>
            Download CSV
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th><th>Forecast</th><th>Bias-adjusted</th><th>Low (P10)</th><th>High (P90)</th>
                <th>To buy</th><th>To buy, adjusted</th><th>To buy, low wind</th>
                {showActual && <th>Actual</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.start_time_utc}>
                  <td>{r.time_uk}</td>
                  <td>{mw(r.forecast_mw)}</td>
                  <td>{mw(r.adjusted_mw)}</td>
                  <td>{mw(r.p10_mw)}</td>
                  <td>{mw(r.p90_mw)}</td>
                  <td>{mw(r.to_buy_mw)}</td>
                  <td>{mw(r.to_buy_adjusted_mw)}</td>
                  <td>{mw(r.to_buy_low_wind_mw)}</td>
                  {showActual && <td>{mw(r.actual_mw)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
