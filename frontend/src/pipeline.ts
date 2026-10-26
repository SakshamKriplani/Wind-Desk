/**
 * Calculation pipeline used for the staged reveal.
 *
 * The actual work (loading the decision from the API and running calc.ts) takes a few
 * milliseconds to a few hundred. In "staged" mode the UI reveals results in four steps over
 * a minimum of STAGED_MS so the reader can follow what is being produced; in "instant" mode
 * results appear as soon as the data is loaded. Status messages describe real steps and the
 * ready line reports measured timings, so the staging never claims work that did not happen.
 */

export type CalcStatus = "empty" | "initializing" | "computing_metrics" | "drawing_charts" | "populating_table" | "ready";

export const STAGED_MS = 1350;

/** When each phase starts, as a fraction of the total duration, and its progress value. */
export const PHASES: { status: CalcStatus; at: number; progress: number }[] = [
  { status: "initializing", at: 0, progress: 10 },
  { status: "computing_metrics", at: 250 / 1350, progress: 40 },
  { status: "drawing_charts", at: 550 / 1350, progress: 70 },
  { status: "populating_table", at: 950 / 1350, progress: 90 },
  { status: "ready", at: 1, progress: 100 },
];

const ORDER: CalcStatus[] = ["empty", "initializing", "computing_metrics", "drawing_charts", "populating_table", "ready"];

/** True once the pipeline has reached (or passed) the given phase. */
export function atLeast(current: CalcStatus, phase: CalcStatus): boolean {
  return ORDER.indexOf(current) >= ORDER.indexOf(phase);
}

export const progressOf = (s: CalcStatus) => PHASES.find((p) => p.status === s)?.progress ?? 0;

/**
 * Remaining phase changes once data has arrived, as delays from now.
 * A slow fetch eats into the staged time rather than adding to it; each later phase still
 * gets at least `minStepMs` so the sequence stays readable.
 */
export function remainingSchedule(totalMs: number, elapsedMs: number, minStepMs = 60): { status: CalcStatus; delay: number }[] {
  if (totalMs <= 0) return [{ status: "ready", delay: 0 }];
  let last = 0;
  return PHASES.slice(1).map((p) => {
    const delay = Math.max(p.at * totalMs - elapsedMs, last + minStepMs);
    last = delay;
    return { status: p.status, delay: Math.round(delay) };
  });
}

export interface StepContext {
  day: string;
  gate: string;
  lookbackDays: number;
  leadH: number | null;
  rows: number;
}

/** Plain-language description of what each phase reveals. */
export function stepMessage(s: CalcStatus, c: StepContext): string {
  switch (s) {
    case "initializing":
      return `Step 1/4: loading forecast runs published before ${c.gate} on ${c.day} from the Elexon snapshot`;
    case "computing_metrics":
      return `Step 2/4: ${c.lookbackDays}-day rolling bias at ${c.leadH != null ? `${Math.round(c.leadH)} h` : "this"} lead, P10 to P90 range and hedge volume`;
    case "drawing_charts":
      return "Step 3/4: drawing the generation profile and uncertainty band";
    case "populating_table":
      return `Step 4/4: settling ${c.rows} periods: contracted volume and cashout exposure`;
    default:
      return "";
  }
}

export interface CalcStats {
  totalMs: number;        // trigger to ready, including staging
  fetchMs: number;        // waiting for the API (0 when the decision was already loaded)
  mathMs: number;         // client-side calc.ts run time
  rows: number;           // periods computed
  checked: number;        // forecasts checked for lookahead
  lookaheadOk: boolean;   // every forecast published at or before gate closure
  heapMb: number | null;  // JS heap in use, where the browser exposes it
}

/** Runtime no-lookahead check on what the API returned. */
export function checkLookahead(points: { publish_time: string | null }[], decisionTime: string): { checked: number; ok: boolean } {
  const tau = Date.parse(decisionTime);
  const pubs = points.map((p) => p.publish_time).filter((x): x is string => x != null);
  return { checked: pubs.length, ok: pubs.every((p) => Date.parse(p) <= tau) };
}

export function heapMb(): number | null {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return mem ? Math.round((mem.usedJSHeapSize / 1048576) * 10) / 10 : null;
}
