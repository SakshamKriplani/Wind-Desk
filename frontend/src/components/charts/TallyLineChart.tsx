import type { ReactNode } from "react";
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
  /** before the first calculation: axes and grid only, with a watermark */
  empty?: boolean;
  watermark?: ReactNode;
  /** draw the lines in from left to right (first reveal only) */
  animate?: boolean;
}

/** Generation profile: raw forecast, bias-adjusted, P10-P90 cloud, wind counted on, outturn. */
const DRAW_MS = 750;

export function TallyLineChart({ rows, start, end, showActual, selected, height = 300, onPick, empty, watermark, animate }: Props) {
  const ticks = Array.from({ length: 7 }, (_, i) => start + i * 4 * 3600e3);
  const xTick = (v: number) => (v >= end ? "24:00" : time(v));

  if (empty) {
    return (
      <div className="t-chart-empty" style={{ height: height + 26 }}>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={[{ ts: start, y: 0 }, { ts: end, y: 16000 }]} margin={{ top: 32, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="2 4" />
            <XAxis dataKey="ts" type="number" scale="time" domain={[start, end]} ticks={ticks}
              tickFormatter={xTick} stroke="#7d9cbb" tick={{ fontSize: 11 }} />
            <YAxis width={64} stroke="#7d9cbb" tick={{ fontSize: 11 }} domain={[0, 16000]}
              ticks={[0, 4000, 8000, 12000, 16000]} tickFormatter={(v) => `${int(v)} MW`} />
            {/* invisible series so the Y axis renders its scale */}
            <Line dataKey="y" stroke="none" dot={false} activeDot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="t-watermark">{watermark}</div>
      </div>
    );
  }

  const anim = { isAnimationActive: !!animate, animationDuration: DRAW_MS, animationEasing: "ease-out" as const };
  const data = rows.map((r) => ({
    ts: r.t, raw: r.forecast, adj: r.adjusted, band: [r.floor, r.ceil] as [number, number],
    counted: r.counted, actual: r.actual, base: r.base,
  }));
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
            tickFormatter={xTick} stroke="#7d9cbb" tick={{ fontSize: 11 }} />
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
          {/* the range fades in as the lines finish drawing */}
          <Area dataKey="band" stroke="none" fill={C.band} fillOpacity={0.5} {...anim} animationBegin={animate ? DRAW_MS * 0.6 : 0} />
          <Line dataKey="raw" stroke={C.raw} strokeWidth={1.8} strokeDasharray="5 3" dot={false} {...anim} />
          <Line dataKey="counted" stroke={C.counted} strokeWidth={1.4} dot={false} {...anim} />
          <Line dataKey="adj" stroke={C.adj} strokeWidth={2.5} dot={false} {...anim} />
          {showActual && <Line dataKey="actual" stroke={C.actual} strokeWidth={2} dot={false} connectNulls {...anim} />}
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}
