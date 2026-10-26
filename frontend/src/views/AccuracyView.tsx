import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api";
import { ChartTip } from "../components/ChartTip";
import { Figures } from "../components/Figures";
import { Failed, Loading } from "../components/Status";
import { biasPhrase, calendar, dayMonth, download, gwh, longDay, mw, pct, signed, toCsv } from "../format";
import { useAsync } from "../hooks";
import type { Accuracy } from "../types";

interface Props {
  gate: string;
  onGate: (g: string) => void;
  onOpenDay: (decisionDay: string) => void;
}

export function AccuracyView({ gate, onGate, onOpenDay }: Props) {
  const { data, error, loading } = useAsync(() => api.accuracy(gate), [gate]);
  return (
    <>
      <div className="controls" style={{ paddingTop: 18 }}>
        <label className="field">
          Gate closure (UK)
          <input type="time" value={gate} step={300} onChange={(e) => e.target.value && onGate(e.target.value)} />
        </label>
      </div>
      {error && <Failed message={error} />}
      {loading && !data && <Loading what="accuracy for January" />}
      {data && <Report a={data} onOpenDay={onOpenDay} />}
    </>
  );
}

function Report({ a, onOpenDay }: { a: Accuracy; onOpenDay: (d: string) => void }) {
  const s = a.summary;
  const dayAheadLeads = leadRange(a);

  return (
    <>
      <h1 className="headline">
        At gate closure, January's wind forecast missed by {mw(s.mae)} in a typical hour
      </h1>
      <p className="subhead">
        Measured over {s.days} decisions, using the latest forecast available at {a.gate_closure} each day
        for the following delivery day. That is {pct(s.nmae_pct)} of average wind output.
      </p>

      <Figures
        items={[
          { label: "Average hourly miss", value: mw(s.mae), detail: `RMSE ${mw(s.rmse)}` },
          { label: "Direction", value: signed(s.bias, "MW"), detail: biasPhrase(s.bias) },
          { label: "1 hour in 10 misses by", value: `> ${mw(s.p90_abs)}`, detail: `worst ${mw(s.max_abs)}` },
          {
            label: "Daily energy miss",
            value: pct(s.median_abs_energy_error_pct, 1),
            detail: "median day, either direction",
          },
          {
            label: "Outturn inside range",
            value: pct(s.band_coverage_pct),
            detail: "P10–P90 band, target 80%",
            tone: s.band_coverage_pct != null && Math.abs(s.band_coverage_pct - 80) > 10 ? "bad" : undefined,
          },
        ]}
      />

      <Takeaways a={a} />

      <section className="panel">
        <h2>How error grows with forecast horizon</h2>
        <p className="note">
          For every forecast period in January's delivery days, the latest forecast published at least this many hours
          ahead. The shaded band marks the lead times you are working with at day-ahead gate closure
          {dayAheadLeads ? ` (${dayAheadLeads[0]}–${dayAheadLeads[1]} h)` : ""}.
        </p>
        <ul className="legend">
          <li><span className="swatch" style={{ background: "var(--sea)" }} />Average miss (MAE)</li>
          <li><span className="swatch" style={{ background: "var(--short)" }} />1-in-10 miss (P90)</li>
          <li><span className="swatch" style={{ background: "var(--amber)" }} />Bias (forecast − actual)</li>
        </ul>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={a.by_horizon} margin={{ top: 8, right: 8, bottom: 14, left: 8 }}>
            <CartesianGrid vertical={false} />
            {dayAheadLeads && (
              <ReferenceArea x1={dayAheadLeads[0]} x2={dayAheadLeads[1]} fill="var(--sea-band)" fillOpacity={0.25} />
            )}
            <ReferenceLine y={0} stroke="var(--line)" />
            <XAxis dataKey="horizon_h" type="number" domain={[0, 48]} ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
              stroke="var(--line)" label={{ value: "Hours ahead", position: "insideBottom", offset: -8, fill: "var(--ink-3)", fontSize: 12 }} />
            <YAxis width={64} stroke="var(--line)" tickFormatter={(v) => `${v.toLocaleString("en-GB")}`}
              label={{ value: "MW", angle: -90, position: "insideLeft", fill: "var(--ink-3)", fontSize: 12 }} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as Accuracy["by_horizon"][number];
              return <ChartTip title={`${r.horizon_h} h ahead`} rows={[
                { label: "Average miss", value: mw(r.mae), color: "var(--sea)" },
                { label: "1-in-10 miss", value: mw(r.p90_abs), color: "var(--short)" },
                { label: "Bias", value: signed(r.bias, "MW"), color: "var(--amber)" },
                { label: "Periods scored", value: r.n.toLocaleString("en-GB") },
              ]} />;
            }} />
            <Line dataKey="mae" stroke="var(--sea)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
            <Line dataKey="p90_abs" stroke="var(--short)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
            <Line dataKey="bias" stroke="var(--amber)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="panel">
        <h2>Energy miss for each delivery day</h2>
        <p className="note">
          Forecast minus actual wind energy over each delivery day. Bars above zero are days the wind
          under-delivered and you would have been short. Select a bar to open that day's brief.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={a.daily} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} />
            <ReferenceLine y={0} stroke="var(--ink-3)" />
            <XAxis dataKey="delivery_day" stroke="var(--line)" interval={2}
              tickFormatter={(v) => dayMonth(calendar(v).getTime())} />
            <YAxis width={64} stroke="var(--line)" tickFormatter={(v) => `${(v / 1000).toFixed(0)} GWh`} />
            <Tooltip cursor={{ fill: "var(--line-soft)" }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as Accuracy["daily"][number];
              return <ChartTip title={longDay(calendar(r.delivery_day).getTime())} rows={[
                { label: "Forecast", value: gwh(r.forecast_energy_mwh) },
                { label: "Actual", value: gwh(r.actual_energy_mwh) },
                { label: "Miss", value: `${signed(r.energy_error_mwh, "MWh")} (${pct(r.energy_error_pct, 1)})` },
                { label: "Average hourly miss", value: mw(r.mae) },
              ]} />;
            }} />
            <Bar dataKey="energy_error_mwh" isAnimationActive={false} cursor="pointer"
              onClick={(entry) => onOpenDay((entry as unknown as { decision_day: string }).decision_day)}>
              {a.daily.map((r) => (
                <Cell key={r.delivery_day} fill={(r.energy_error_mwh ?? 0) > 0 ? "var(--short)" : "var(--surplus)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Error by hour of delivery</h2>
          <p className="note">Average miss for each UK hour, at day-ahead gate closure.</p>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={a.by_hour} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="hour" stroke="var(--line)" interval={2} tickFormatter={(h) => `${String(h).padStart(2, "0")}:00`} />
              <YAxis width={56} stroke="var(--line)" tickFormatter={(v) => v.toLocaleString("en-GB")} />
              <Tooltip cursor={{ fill: "var(--line-soft)" }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as Accuracy["by_hour"][number];
                return <ChartTip title={`${String(r.hour).padStart(2, "0")}:00`} rows={[
                  { label: "Average miss", value: mw(r.mae) },
                  { label: "Bias", value: signed(r.bias, "MW") },
                ]} />;
              }} />
              <Bar dataKey="mae" fill="var(--sea)" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel">
          <h2>Spread of hourly errors</h2>
          <p className="note">Forecast minus actual, in 500 MW bins. Right of zero means wind came in below forecast.</p>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={a.histogram} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap={1}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="from" stroke="var(--line)" tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
              <YAxis width={40} stroke="var(--line)" allowDecimals={false} />
              <Tooltip cursor={{ fill: "var(--line-soft)" }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as Accuracy["histogram"][number];
                return <ChartTip title={`${signed(r.from, "")} to ${signed(r.to, "MW")}`} rows={[
                  { label: "Periods", value: r.count },
                ]} />;
              }} />
              <Bar dataKey="count" isAnimationActive={false}>
                {a.histogram.map((b) => (
                  <Cell key={b.from} fill={b.from >= 0 ? "var(--short)" : "var(--surplus)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <DailyTable a={a} onOpenDay={onOpenDay} />
    </>
  );
}

/** Lead-time window that day-ahead decisions actually use, from the gate time. */
function leadRange(a: Accuracy): [number, number] | null {
  const [hh, mm] = a.gate_closure.split(":").map(Number);
  const gateH = hh + mm / 60;
  return [Math.round(24 - gateH), Math.round(48 - gateH)];
}

function Takeaways({ a }: { a: Accuracy }) {
  const s = a.summary;
  const items: string[] = [];
  const h = a.by_horizon;
  const near = h.find((x) => x.horizon_h === 1);
  const dayAhead = h.find((x) => x.horizon_h === 24);
  if (near?.mae && dayAhead?.mae) {
    items.push(
      `A forecast made a day ahead misses by about ${mw(dayAhead.mae)} on average, ${(dayAhead.mae / near.mae).toFixed(1)}× the error of one made an hour ahead. Waiting for later runs helps, but only up to gate closure.`,
    );
  }
  if (s.bias != null && Math.abs(s.bias) >= 50) {
    items.push(
      s.bias > 0
        ? `The forecast leaned high: on average wind came in ${mw(s.bias)} below it. Counting on the full forecast tends to leave you short.`
        : `The forecast leaned low: on average wind came in ${mw(-s.bias)} above it, so you may be over-buying.`,
    );
  }
  if (s.days_over_forecast != null) {
    items.push(`Wind under-delivered against the gate-closure forecast on ${s.days_over_forecast} of ${s.days} delivery days.`);
  }
  if (s.worst_day) {
    items.push(`The hardest day was ${longDay(calendar(s.worst_day.delivery_day).getTime())}, with an average miss of ${mw(s.worst_day.mae)}.`);
  }
  if (s.band_coverage_pct != null) {
    const off = s.band_coverage_pct - 80;
    items.push(
      Math.abs(off) <= 10
        ? `The likely range held outturn ${pct(s.band_coverage_pct)} of the time, close to its 80% target, so it is a fair guide to risk.`
        : off < 0
          ? `The likely range held outturn only ${pct(s.band_coverage_pct)} of the time against an 80% target. Treat it as a minimum spread.`
          : `The likely range held outturn ${pct(s.band_coverage_pct)} of the time, above its 80% target, so it is on the cautious side.`,
    );
  }
  return (
    <ul className="takeaways">
      {items.map((t) => <li key={t}>{t}</li>)}
    </ul>
  );
}

function DailyTable({ a, onOpenDay }: { a: Accuracy; onOpenDay: (d: string) => void }) {
  const csv = () =>
    download(`wind-desk-accuracy-${a.gate_closure.replace(":", "")}.csv`, toCsv(a.daily as unknown as Record<string, unknown>[]));
  return (
    <section className="panel">
      <details>
        <summary>Every January decision</summary>
        <div className="panel-head" style={{ margin: "8px 0" }}>
          <p className="note" style={{ margin: 0 }}>Select a row to open that day's brief.</p>
          <button className="btn" onClick={csv}>Download CSV</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Delivery day</th><th>Forecast</th><th>Actual</th><th>Miss</th>
                <th>Average hourly miss</th><th>Worst hour</th><th>Inside range</th>
              </tr>
            </thead>
            <tbody>
              {a.daily.map((r) => (
                <tr key={r.delivery_day} className="clickable" tabIndex={0}
                  onClick={() => onOpenDay(r.decision_day)}
                  onKeyDown={(e) => e.key === "Enter" && onOpenDay(r.decision_day)}>
                  <td>{longDay(calendar(r.delivery_day).getTime())}</td>
                  <td>{gwh(r.forecast_energy_mwh)}</td>
                  <td>{gwh(r.actual_energy_mwh)}</td>
                  <td className={(r.energy_error_mwh ?? 0) > 0 ? "bad" : "good"}>
                    {r.energy_error_mwh != null ? signed(r.energy_error_mwh / 1000, "GWh", 1) : "–"}
                  </td>
                  <td>{mw(r.mae)}</td>
                  <td>{mw(r.max_abs)}</td>
                  <td>{pct(r.band_coverage_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
