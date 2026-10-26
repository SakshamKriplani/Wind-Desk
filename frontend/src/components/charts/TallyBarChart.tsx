import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface BarSeries {
  key: string;
  label: string;
  color: string;
  /** colour each bar by its value instead (e.g. red below zero) */
  colorBy?: (v: number) => string;
}

interface Props<D> {
  data: D[];
  category: keyof D & string;
  series: BarSeries[];
  horizontal?: boolean;
  height?: number;
  format?: (v: number) => string;
  labels?: boolean;
  categoryWidth?: number;
}

/** Sky-blue bar chart with a zero baseline, vertical or horizontal. */
export function TallyBarChart<D extends object>({
  data, category, series, horizontal, height = 220, format = (v) => v.toLocaleString("en-GB"), labels, categoryWidth = 120,
}: Props<D>) {
  return (
    <>
      {series.length > 1 && (
        <ul className="t-legend">
          {series.map((s) => <li key={s.key}><i className="t-legend-box" style={{ background: s.color }} />{s.label}</li>)}
        </ul>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data as Record<string, unknown>[]} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 6, right: labels ? 60 : 10, bottom: 0, left: 0 }}
          barCategoryGap="18%">
          <CartesianGrid stroke="#d2e3f3" horizontal={!horizontal} vertical={!!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" stroke="#7d9cbb" tick={{ fontSize: 11 }} tickFormatter={format} />
              <YAxis type="category" dataKey={category as string} width={categoryWidth} stroke="#7d9cbb" tick={{ fontSize: 11 }} />
            </>
          ) : (
            <>
              <XAxis dataKey={category as string} stroke="#7d9cbb" tick={{ fontSize: 11 }} />
              <YAxis width={64} stroke="#7d9cbb" tick={{ fontSize: 11 }} tickFormatter={format} />
            </>
          )}
          <ReferenceLine {...(horizontal ? { x: 0 } : { y: 0 })} stroke="#0c3a6b" />
          <Tooltip cursor={{ fill: "rgba(248,184,25,0.18)" }} isAnimationActive={false}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="t-tip">
                  <b>{String(label ?? (payload[0].payload as Record<string, unknown>)[category])}</b>
                  {payload.map((p) => (
                    <div key={String(p.dataKey)}>
                      <span>{series.find((s) => s.key === p.dataKey)?.label}</span>
                      <span>{format(Number(p.value))}</span>
                    </div>
                  ))}
                </div>
              );
            }} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color} isAnimationActive={false}>
              {s.colorBy && data.map((d, i) => <Cell key={i} fill={s.colorBy!(Number((d as Record<string, unknown>)[s.key]))} />)}
              {labels && <LabelList dataKey={s.key} position={horizontal ? "right" : "top"} formatter={(v: unknown) => format(Number(v))} className="t-barlabel" />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
