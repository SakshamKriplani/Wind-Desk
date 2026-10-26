/**
 * Client-side trading calculations.
 *
 * The backend supplies the forecast, the bias-adjusted forecast, the P10/P90 range and
 * (in hindsight) the outturn. Everything that depends on the trader's own inputs - risk
 * appetite, demand, prices, penalty rates, manual edits - is computed here so the UI can
 * recalculate instantly without a round trip.
 *
 * Sign conventions
 *   cost  > 0  money paid out
 *   P&L   > 0  better than the comparison strategy
 *   short      the wind delivered less than the volume you relied on, so you buy at cashout
 *   long       more wind than relied on, so the surplus is spilled at a discount
 */
import type { Decision } from "./types";

export const HALF_HOUR = 30 * 60 * 1000;
const P10_TO_P90_SIGMAS = 2.5631; // width of a normal P10-P90 interval in standard deviations

export interface Params {
  demandMw: number;     // flat demand to cover
  risk: number;         // 0 = rely on the central forecast, 1 = rely on the P10 floor
  daPrice: number;      // day-ahead price, £/MWh (scenario input)
  penalty: number;      // extra paid per MWh when short, £/MWh
  longRate: number;     // discount per MWh of spilled surplus, £/MWh
  capacityMw: number;   // assumed wind capacity, for capacity-factor display
  stressPct: number;    // wind shortfall stress test, % reduction of expected and actual wind
  biasOn: boolean;      // hedge on the bias-adjusted forecast instead of the raw one
}

export const DEFAULT_PARAMS: Params = {
  demandMw: 30000,
  risk: 0.5,
  daPrice: 65,
  penalty: 85,
  longRate: 25,
  capacityMw: 30000,
  stressPct: 0,
  biasOn: true,
};

/** One settlement period (half-hour) or one hour, depending on the detail level. */
export interface Period {
  t: number;            // start, epoch ms
  sp: number;           // Elexon settlement period of the start (1-48 on a normal day)
  spEnd: number;        // last settlement period covered
  hours: number;        // 0.5 or 1
  forecast: number;     // raw WINDFOR forecast, MW
  adjusted: number;     // bias-adjusted forecast, MW
  p10: number;
  p90: number;
  actual: number | null;
  leadH: number | null;
  publishTime: string | null;
}

export interface Override {
  forecast?: number;
  contracted?: number;
}

export interface Row extends Period {
  base: number;         // forecast the hedge is built on (raw, adjusted or edited)
  edited: boolean;
  floor: number;        // P10 after any edit shift
  ceil: number;         // P90 after any edit shift
  expected: number;     // best estimate of outturn after stress (bias-adjusted)
  counted: number;      // wind the desk relies on, MW
  recommended: number;  // contracted MW the desk would buy for this period
  contracted: number;   // contracted MW, possibly edited
  expShortMw: number;   // expected shortfall, MW
  expLongMw: number;    // expected surplus, MW
  expCashout: number;   // expected imbalance cost, £ (positive = cost)
  daCost: number;       // £ paid in the day-ahead market
  realShortMw: number | null;
  realLongMw: number | null;
  realCashout: number | null;
}

// ----------------------------------------------------------------------------
// periods from API data
// ----------------------------------------------------------------------------

/**
 * Turns the hourly decision points into rows. In detailed mode each hour becomes two
 * settlement periods, with the forecast interpolated linearly to the half-hour.
 * Half-hourly outturn (if supplied) is used for actuals.
 */
export function buildPeriods(
  d: Decision,
  halfHourActuals: Map<number, number> | null,
  detailed: boolean,
  jitter: number[] | null = null,
): Period[] {
  const start = new Date(d.delivery_start).getTime();
  const pts = d.points
    .filter((p) => p.forecast != null)
    .map((p, i) => {
      const k = jitter ? 1 + (jitter[i % jitter.length] ?? 0) : 1;
      return {
        t: new Date(p.t).getTime(),
        forecast: p.forecast! * k,
        adjusted: (p.adjusted ?? p.forecast!) * k,
        p10: (p.p10 ?? p.forecast!) * k,
        p90: (p.p90 ?? p.forecast!) * k,
        actual: p.actual,
        leadH: p.lead_h,
        publishTime: p.publish_time,
      };
    })
    .sort((a, b) => a.t - b.t);
  const spOf = (t: number) => Math.floor((t - start) / HALF_HOUR) + 1;
  const actualAt = (t: number) => halfHourActuals?.get(t) ?? null;

  if (!detailed) {
    return pts.map((p) => {
      const a1 = actualAt(p.t);
      const a2 = actualAt(p.t + HALF_HOUR);
      const actual = a1 != null && a2 != null ? (a1 + a2) / 2 : p.actual;
      return { ...p, actual, sp: spOf(p.t), spEnd: spOf(p.t) + 1, hours: 1 };
    });
  }

  const out: Period[] = [];
  pts.forEach((p, i) => {
    const next = pts[i + 1];
    const mid = (a: number, b: number | undefined) => (b == null ? a : (a + b) / 2);
    out.push({ ...p, actual: actualAt(p.t) ?? p.actual, sp: spOf(p.t), spEnd: spOf(p.t), hours: 0.5 });
    const t2 = p.t + HALF_HOUR;
    out.push({
      ...p,
      t: t2,
      sp: spOf(t2),
      spEnd: spOf(t2),
      hours: 0.5,
      forecast: mid(p.forecast, next?.forecast),
      adjusted: mid(p.adjusted, next?.adjusted),
      p10: mid(p.p10, next?.p10),
      p90: mid(p.p90, next?.p90),
      actual: actualAt(t2),
    });
  });
  return out;
}

// ----------------------------------------------------------------------------
// statistics
// ----------------------------------------------------------------------------

function erf(x: number): number {
  // Abramowitz and Stegun 7.1.26, max error 1.5e-7
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
export const normCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));
export const normPdf = (z: number) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

/** E[max(k - W, 0)] for W ~ Normal(mu, sigma). */
export function expectedShortfall(k: number, mu: number, sigma: number): number {
  if (sigma <= 0) return Math.max(k - mu, 0);
  const z = (k - mu) / sigma;
  return (k - mu) * normCdf(z) + sigma * normPdf(z);
}

// ----------------------------------------------------------------------------
// rows
// ----------------------------------------------------------------------------

export function computeRow(p: Period, params: Params, ov: Override | undefined): Row {
  const defaultBase = params.biasOn ? p.adjusted : p.forecast;
  const edited = ov?.forecast != null;
  const base = edited ? ov!.forecast! : defaultBase;
  const shift = base - defaultBase;
  const floor = Math.max(0, p.p10 + shift);
  const ceil = Math.max(floor, p.p90 + shift);
  const keep = 1 - params.stressPct / 100;

  const counted = Math.max(0, base - params.risk * Math.max(0, base - floor));
  const recommended = Math.max(0, params.demandMw - counted);
  const contracted = ov?.contracted ?? recommended;
  const reliedOn = params.demandMw - contracted; // wind implied by the contracted volume

  const expected = Math.max(0, (p.adjusted + shift) * keep);
  const sigma = Math.max(1, ((ceil - floor) / P10_TO_P90_SIGMAS) * keep);
  const expShortMw = expectedShortfall(reliedOn, expected, sigma);
  const expLongMw = expShortMw + (expected - reliedOn);
  const h = p.hours;
  const expCashout = (expShortMw * params.penalty + Math.max(0, expLongMw) * params.longRate) * h;
  const daCost = contracted * params.daPrice * h;

  let realShortMw: number | null = null;
  let realLongMw: number | null = null;
  let realCashout: number | null = null;
  if (p.actual != null) {
    const w = p.actual * keep;
    realShortMw = Math.max(0, reliedOn - w);
    realLongMw = Math.max(0, w - reliedOn);
    realCashout = (realShortMw * params.penalty + realLongMw * params.longRate) * h;
  }

  return {
    ...p, base, edited, floor, ceil, expected, counted, recommended, contracted,
    expShortMw, expLongMw: Math.max(0, expLongMw), expCashout, daCost,
    realShortMw, realLongMw, realCashout,
  };
}

export function computeRows(periods: Period[], params: Params, overrides: Record<number, Override>): Row[] {
  return periods.map((p) => computeRow(p, params, overrides[p.t]));
}

export interface Totals {
  forecastMwh: number;
  adjustedMwh: number;
  p10Mwh: number;
  p90Mwh: number;
  countedMwh: number;
  contractedMwh: number;
  demandMwh: number;
  expShortMwh: number;
  expLongMwh: number;
  expCashout: number;
  daCost: number;
  actualMwh: number | null;
  realCashout: number | null;
  wmaeMw: number | null;  // energy-weighted mean absolute error of the hedge base, hindsight
}

export function totals(rows: Row[], params: Params): Totals {
  const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r) * r.hours, 0);
  const all = rows.length > 0 && rows.every((r) => r.actual != null);
  const hrs = rows.reduce((s, r) => s + r.hours, 0);
  return {
    forecastMwh: sum((r) => r.forecast),
    adjustedMwh: sum((r) => r.adjusted),
    p10Mwh: sum((r) => r.p10),
    p90Mwh: sum((r) => r.p90),
    countedMwh: sum((r) => r.counted),
    contractedMwh: sum((r) => r.contracted),
    demandMwh: params.demandMw * hrs,
    expShortMwh: sum((r) => r.expShortMw),
    expLongMwh: sum((r) => r.expLongMw),
    expCashout: rows.reduce((s, r) => s + r.expCashout, 0),
    daCost: rows.reduce((s, r) => s + r.daCost, 0),
    actualMwh: all ? sum((r) => r.actual!) : null,
    realCashout: all ? rows.reduce((s, r) => s + r.realCashout!, 0) : null,
    wmaeMw: all && hrs ? sum((r) => Math.abs(r.base - r.actual!)) / hrs : null,
  };
}

// ----------------------------------------------------------------------------
// strategy backtest (hindsight)
// ----------------------------------------------------------------------------

export type StrategyId = "raw" | "adjusted" | "p10" | "custom";

export interface StrategyLine {
  t: number;
  sp: number;
  hours: number;
  contracted: number; // MW
  need: number;       // MW still needed after actual wind
  short: number;      // MW bought at cashout
  long: number;       // MW spilled
  cashout: number;    // £ for the period (positive = paid)
}

export interface StrategyResult {
  id: StrategyId;
  lines: StrategyLine[];
  buyMwh: number;
  shortMwh: number;
  longMwh: number;
  daCost: number;
  cashout: number;
  total: number;
}

export interface Scenario {
  daPrice: number;
  penalty: number;
  longRate: number;
  demandMw: number;
  /** fractional wind loss applied to outturn per period (ramp-down event), 0 = none */
  windLoss: (p: Period) => number;
}

/**
 * Cost of buying day-ahead against a chosen wind estimate, settled against the real outturn.
 * Short volume is bought at day-ahead price plus penalty; surplus is sold back at
 * day-ahead price minus the spill discount.
 */
export function runStrategy(id: StrategyId, periods: Period[], sc: Scenario, customBuyMwh?: number): StrategyResult | null {
  if (!periods.length || periods.some((p) => p.actual == null)) return null;
  const wind = (p: Period) => (id === "raw" ? p.forecast : id === "p10" ? p.p10 : p.adjusted);
  let contracted = periods.map((p) => Math.max(0, sc.demandMw - wind(p)));
  if (id === "custom" && customBuyMwh != null) {
    // spread the chosen volume in the shape of the bias-adjusted recommendation
    const shape = periods.map((p) => Math.max(0, sc.demandMw - p.adjusted));
    const shapeMwh = shape.reduce((s, c, i) => s + c * periods[i].hours, 0) || 1;
    contracted = shape.map((c) => (c * customBuyMwh) / shapeMwh);
  }
  let buy = 0, short = 0, long = 0, da = 0, cash = 0;
  const lines: StrategyLine[] = [];
  periods.forEach((p, i) => {
    const h = p.hours;
    const w = p.actual! * (1 - sc.windLoss(p));
    const need = Math.max(0, sc.demandMw - w);
    const c = contracted[i];
    const s = Math.max(0, need - c);
    const l = Math.max(0, c - need);
    buy += c * h;
    short += s * h;
    long += l * h;
    da += c * sc.daPrice * h;
    const pc = (s * (sc.daPrice + sc.penalty) - l * (sc.daPrice - sc.longRate)) * h;
    cash += pc;
    lines.push({ t: p.t, sp: p.sp, hours: h, contracted: c, need, short: s, long: l, cashout: pc });
  });
  return { id, lines, buyMwh: buy, shortMwh: short, longMwh: long, daCost: da, cashout: cash, total: da + cash };
}

// ----------------------------------------------------------------------------
// display basis
// ----------------------------------------------------------------------------

export type Basis = "MWh" | "CF%" | "£";

/** Converts a MW value over a period into the chosen display basis. */
export function toBasis(mw: number, hours: number, basis: Basis, params: Params): number {
  if (basis === "CF%") return params.capacityMw ? (100 * mw) / params.capacityMw : 0;
  if (basis === "£") return mw * hours * params.daPrice;
  return mw * hours;
}

/** UK time-slot label for a period, e.g. "14:00-14:30". */
export function slotLabel(t: number, hours: number): string {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${f.format(new Date(t))}-${f.format(new Date(t + hours * 3600e3))}`;
}

export type Block = "overnight" | "peak" | "late";
export const BLOCKS: { id: Block; title: string; from: number; to: number }[] = [
  { id: "overnight", title: "Off-peak overnight (SP 1 to SP 13)", from: 1, to: 13 },
  { id: "peak", title: "Peak hours (SP 14 to SP 38)", from: 14, to: 38 },
  { id: "late", title: "Off-peak late night (SP 39 to SP 48)", from: 39, to: 48 },
];
export const blockOf = (sp: number): Block => (sp <= 13 ? "overnight" : sp <= 38 ? "peak" : "late");
