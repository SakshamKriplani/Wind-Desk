import type { Decision } from "../types";
import { addDays, calendar, longDay, shortDay, time } from "../format";

interface Props {
  day: string;
  days: string[];
  gate: string;
  decision: Decision | null;
  onDay: (d: string) => void;
  onGate: (g: string) => void;
}

/**
 * The decision in one picture: a 48-hour line from the start of the decision day
 * to the end of the delivery day, with the forecast run and gate closure marked.
 */
export function DecisionStrip({ day, days, gate, decision, onDay, onGate }: Props) {
  const idx = days.indexOf(day);
  const first = days[0];
  const last = days[days.length - 1];

  let marks = null;
  if (decision) {
    const start = new Date(decision.delivery_start).getTime() - 24 * 3600e3;
    const end = new Date(decision.delivery_end).getTime();
    const pos = (iso: string) => `${(100 * (new Date(iso).getTime() - start)) / (end - start)}%`;
    const run = decision.summary.latest_publish_time;
    marks = (
      <>
        <div className="delivery" style={{ left: "50%", right: 0 }} />
        {run && (
          <>
            <span className="mark run" style={{ left: pos(run) }} />
            <span className="lbl run" style={{ left: pos(run) }}>Forecast run {time(run)}</span>
          </>
        )}
        <span className="mark gate" style={{ left: pos(decision.decision_time) }} />
        <span className="lbl gate" style={{ left: pos(decision.decision_time) }}>
          Gate closure {time(decision.decision_time)}
        </span>
        <span className="daylbl" style={{ left: 0 }}>Decide on {shortDay(calendar(day).getTime())}</span>
        <span className="daylbl deliv" style={{ left: "50%" }}>
          Deliver on {shortDay(calendar(addDays(day, 1)).getTime())}
        </span>
      </>
    );
  }

  return (
    <section className="strip" aria-label="Decision timing">
      <div className="controls">
        <label className="field">
          Decision day
          <div className="stepper">
            <button className="btn" aria-label="Previous day" disabled={idx <= 0} onClick={() => onDay(days[idx - 1])}>
              ‹
            </button>
            <input type="date" value={day} min={first} max={last}
              onChange={(e) => days.includes(e.target.value) && onDay(e.target.value)} />
            <button className="btn" aria-label="Next day" disabled={idx >= days.length - 1} onClick={() => onDay(days[idx + 1])}>
              ›
            </button>
          </div>
        </label>
        <label className="field">
          Gate closure (UK)
          <input type="time" value={gate} step={300} onChange={(e) => e.target.value && onGate(e.target.value)} />
        </label>
      </div>
      <div className="timeline" aria-hidden="true" title={`Decision on ${longDay(calendar(day).getTime())}`}>
        <div className="track" />
        {marks}
      </div>
    </section>
  );
}
