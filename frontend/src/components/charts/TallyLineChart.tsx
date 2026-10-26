import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Row } from "../../calc";
import { int, time } from "../../format";

const C = { raw: "#3b95d6", adj: "#0e3e78", band: "#9cc7ea", actual: "#e67e22", counted: "#107c41", grid: "#d2e3f3" };

interface Props {
  rows: Row[];
  start: number;
  end: number;
  showActual: boolean;
  selected: number | null;
  height?: number;
  onPick?: (t: number) => void;
}

/** Generation profile: raw forecast, bias-adjusted, P10-P90 cloud, wind counted on, outturn. */
export function TallyLineChart({ rows, start, end, showActual, selected, height = 300, onPick }: Props) {
  const data = rows.map((r) => ({
    ts: r.t, raw: r.forecast, adj: r.adjusted, band: [r.floor, r.ceil] as [number, number],
    counted: r.counted, actual: r.actual, base: r.base,
  }));
  const ticks = Array.from({ length: 9 }, (_, i) => start + i * 3 * 3600e3);
  return (
    <>
      <ul className="t-legend">
        <li><i style={{ borderTop: `2px dashed ${C.raw}` }} />Raw forecast</li>
        <li><i style={{ borderTop: `2.5px solid ${C.adj}` }} />Bias-adjusted</li>
        <li><i className="t-legend-box" style={{ background: C.band }} />P10–P90</li>
        <li><i style={{ borderTop: `1.5px solid ${C.counted}` }} />Wind counted on</li>
        {showActual && <li><i style={{ borderTop: `2px solid ${C.actual}` }} />Actual</li>}
      </ul>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}
          onClick={(e) => { const ts = (e as { activePayload?: { payload: { ts: number } }[] })?.activePayload?.[0]?.payload.ts; if (ts != null) onPick?.(ts); }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="ts" type="number" scale="time" domain={[start, end]} ticks={ticks}
            tickFormatter={(v) => time(v)} stroke="#7d9cbb" tick={{ fontSize: 11 }} />
          <YAxis width={52} stroke="#7d9cbb" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          {selected != null && <ReferenceLine x={selected} stroke="#f8b819" strokeWidth={2} />}
          <Tooltip
            isAnimationActive={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as (typeof data)[number];
              return (
                <div className="t-tip">
                  <b>{time(r.ts)} UK</b>
                  <div><span style={{ color: C.raw }}>Raw</span><span>{int(r.raw)} MW</span></div>
                  <div><span style={{ color: C.adj }}>Adjusted</span><span>{int(r.adj)} MW</span></div>
                  <div><span>Δ adj − raw</span><span className={r.adj - r.raw < 0 ? "t-neg" : "t-pos"}>{int(r.adj - r.raw)} MW</span></div>
                  <div><span>P10 / P90</span><span>{int(r.band[0])} / {int(r.band[1])}</span></div>
                  <div><span style={{ color: C.counted }}>Counted on</span><span>{int(r.counted)} MW</span></div>
                  {showActual && <div><span style={{ color: C.actual }}>Actual</span><span>{int(r.actual)} MW</span></div>}
                </div>
              );
            }}
          />
          <Area dataKey="band" stroke="none" fill={C.band} fillOpacity={0.5} isAnimationActive={false} />
          <Line dataKey="raw" stroke={C.raw} strokeWidth={1.8} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
          <Line dataKey="counted" stroke={C.counted} strokeWidth={1.4} dot={false} isAnimationActive={false} />
          <Line dataKey="adj" stroke={C.adj} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          {showActual && <Line dataKey="actual" stroke={C.actual} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />}
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}
