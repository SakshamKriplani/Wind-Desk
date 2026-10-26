import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { ChartTip } from "../components/ChartTip";
import { Figures } from "../components/Figures";
import { Failed, Loading } from "../components/Status";
import { addDays, biasPhrase, dayMonth, dayTime, mw, pct, signed } from "../format";
import { useAsync } from "../hooks";
import type { Meta, Series } from "../types";

const ukDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso)); // YYYY-MM-DD

export function ExploreView({ meta }: { meta: Meta }) {
  const minDay = ukDate(meta.explore_window.start);
  const maxDay = addDays(ukDate(meta.explore_window.end), -1);
  const [from, setFrom] = useState(minDay);
  const [to, setTo] = useState(addDays(minDay, 6));
  const [horizon, setHorizon] = useState(4);
  const [committedH, setCommittedH] = useState(4);

  const { data, error, loading } = useAsync(
    () => api.series(from, addDays(to, 1), committedH),
    [from, to, committedH],
  );

  return (
    <>
      <div className="controls" style={{ paddingTop: 18 }}>
        <label className="field">
          From
          <input type="date" value={from} min={minDay} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
        <label className="field">
          To
          <input type="date" value={to} min={from} max={maxDay} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
        <label className="field" style={{ minWidth: 260, flex: "1 1 260px", maxWidth: 420 }}>
          Forecast horizon: {horizon} hours ahead
          <input className="range" type="range" min={0} max={meta.max_horizon_h} step={1} value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            onPointerUp={() => setCommittedH(horizon)}
            onKeyUp={() => setCommittedH(horizon)} />
        </label>
      </div>

      <h1 className="headline">Actual wind against the forecast made {committedH} hours earlier</h1>
      <p className="subhead">
        For each period, the latest forecast published at least {committedH} hours before it. Move the slider
        to see how accuracy changes with notice.
      </p>

      {error && <Failed message={error} />}
      {loading && !data && <Loading what="the series" />}
      {data && <SeriesBody s={data} />}
    </>
  );
}

function SeriesBody({ s }: { s: Series }) {
  const m = s.metrics;
  const rows = useMemo(() => {
    const map = new Map<number, { ts: number; actual?: number | null; forecast?: number | null }>();
    for (const a of s.actual) {
      const ts = new Date(a.t).getTime();
      map.set(ts, { ...(map.get(ts) ?? { ts }), actual: a.mw });
    }
    for (const f of s.forecast) {
      const ts = new Date(f.t).getTime();
      map.set(ts, { ...(map.get(ts) ?? { ts }), forecast: f.mw });
    }
    return [...map.values()].sort((a, b) => a.ts - b.ts);
  }, [s]);

  const start = new Date(s.start).getTime();
  const end = new Date(s.end).getTime();
  const days = Math.round((end - start) / 86400e3);
  const ticks = Array.from({ length: days + 1 }, (_, i) => start + i * 86400e3);

  return (
    <>
      <Figures items={[
        { label: "Average miss", value: mw(m.mae), detail: `${pct(m.nmae_pct)} of average output` },
        { label: "Direction", value: signed(m.bias, "MW"), detail: biasPhrase(m.bias) },
        { label: "1-in-10 miss", value: mw(m.p90_abs) },
        { label: "Worst miss", value: mw(m.max_abs) },
        { label: "Periods compared", value: m.n.toLocaleString("en-GB") },
      ]} />
      <section className="panel">
        <ul className="legend">
          <li><span className="swatch" style={{ background: "var(--amber)" }} />Actual outturn</li>
          <li><span className="swatch" style={{ background: "var(--sea)" }} />Forecast</li>
        </ul>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="ts" type="number" scale="time" domain={[start, end]} ticks={ticks}
              tickFormatter={(v) => dayMonth(v)} stroke="var(--line)" interval="preserveStartEnd" />
            <YAxis width={58} stroke="var(--line)" tickFormatter={(v) => `${(v / 1000).toFixed(0)} GW`} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as { ts: number; actual?: number | null; forecast?: number | null };
              return <ChartTip title={dayTime(r.ts)} rows={[
                { label: "Actual", value: mw(r.actual), color: "var(--amber)" },
                { label: "Forecast", value: mw(r.forecast), color: "var(--sea)" },
              ]} />;
            }} />
            <Line dataKey="actual" stroke="var(--amber)" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
            <Line dataKey="forecast" stroke="var(--sea)" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </section>
    </>
  );
}
