import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMS, buildPeriods, computeRow, expectedShortfall, normCdf, runStrategy, slotLabel, toBasis, totals,
  type Period, type Scenario,
} from "./calc";
import type { Decision } from "./types";

const H = 3600e3;
const start = Date.parse("2026-01-16T00:00:00Z");

function decision(n = 24): Decision {
  return {
    decision_day: "2026-01-15",
    decision_time: "2026-01-15T09:50:00Z",
    delivery_start: "2026-01-16T00:00:00Z",
    delivery_end: "2026-01-17T00:00:00Z",
    runs_used: [],
    summary: {} as Decision["summary"],
    hindsight: null,
    previous_runs: [],
    points: Array.from({ length: n }, (_, i) => ({
      t: new Date(start + i * H).toISOString(),
      forecast: 10000 + i * 100,
      adjusted: 9000 + i * 100,
      p10: 7000 + i * 100,
      p90: 11000 + i * 100,
      actual: 9000,
      publish_time: "2026-01-15T09:30:00Z",
      lead_h: 15 + i,
    })),
  };
}

const period = (over: Partial<Period> = {}): Period => ({
  t: start, sp: 1, spEnd: 1, hours: 1, forecast: 10000, adjusted: 9000, p10: 7000, p90: 11000,
  actual: 9000, leadH: 15, publishTime: null, ...over,
});

describe("buildPeriods", () => {
  it("keeps hourly rows in condensed mode", () => {
    const ps = buildPeriods(decision(), null, false);
    expect(ps).toHaveLength(24);
    expect(ps[0].sp).toBe(1);
    expect(ps[0].spEnd).toBe(2);
    expect(ps[23].sp).toBe(47);
  });
  it("splits into 48 settlement periods with interpolation", () => {
    const ps = buildPeriods(decision(), null, true);
    expect(ps).toHaveLength(48);
    expect(ps[47].sp).toBe(48);
    expect(ps[1].forecast).toBe(10050); // halfway between 10000 and 10100
    expect(ps[47].forecast).toBe(ps[46].forecast); // last half-hour holds
  });
  it("uses half-hourly outturn when supplied", () => {
    const acts = new Map([[start, 8000], [start + H / 2, 8400]]);
    expect(buildPeriods(decision(), acts, true)[1].actual).toBe(8400);
    expect(buildPeriods(decision(), acts, false)[0].actual).toBe(8200);
  });
});

describe("statistics", () => {
  it("normal cdf", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.2816)).toBeCloseTo(0.9, 3);
  });
  it("expected shortfall limits", () => {
    expect(expectedShortfall(100, 0, 0)).toBe(100);
    expect(expectedShortfall(-1e6, 0, 10)).toBeCloseTo(0, 6);
    expect(expectedShortfall(0, 0, 1)).toBeCloseTo(0.3989, 3);
  });
});

describe("computeRow", () => {
  it("risk slides counted wind from the base to the P10 floor", () => {
    const p = period();
    expect(computeRow(p, { ...DEFAULT_PARAMS, risk: 0 }, undefined).counted).toBe(9000);
    expect(computeRow(p, { ...DEFAULT_PARAMS, risk: 1 }, undefined).counted).toBe(7000);
    expect(computeRow(p, { ...DEFAULT_PARAMS, risk: 0.5, biasOn: false }, undefined).counted).toBe(8500);
  });
  it("contracted volume covers demand minus counted wind, and can be edited", () => {
    const params = { ...DEFAULT_PARAMS, risk: 0, demandMw: 30000 };
    expect(computeRow(period(), params, undefined).contracted).toBe(21000);
    expect(computeRow(period(), params, { contracted: 25000 }).contracted).toBe(25000);
  });
  it("editing the forecast shifts the range with it", () => {
    const r = computeRow(period(), { ...DEFAULT_PARAMS, risk: 1 }, { forecast: 10000 });
    expect(r.edited).toBe(true);
    expect(r.floor).toBe(8000);
    expect(r.counted).toBe(8000);
  });
  it("buying more lowers expected shortfall", () => {
    const lo = computeRow(period(), { ...DEFAULT_PARAMS, risk: 0 }, undefined);
    const hi = computeRow(period(), { ...DEFAULT_PARAMS, risk: 1 }, undefined);
    expect(hi.expShortMw).toBeLessThan(lo.expShortMw);
  });
  it("stress test cuts expected and actual wind", () => {
    const r = computeRow(period(), { ...DEFAULT_PARAMS, risk: 0, stressPct: 20 }, undefined);
    expect(r.expected).toBe(7200);
    expect(r.realShortMw).toBe(1800); // relied on 9000, got 7200
  });
});

describe("totals and basis", () => {
  it("sums energy using period length", () => {
    const rows = buildPeriods(decision(2), null, true).map((p) => computeRow(p, DEFAULT_PARAMS, undefined));
    const t = totals(rows, DEFAULT_PARAMS);
    expect(t.demandMwh).toBe(30000 * 2);
    expect(t.forecastMwh).toBeCloseTo((10000 + 10050 + 10100 + 10100) / 2, 6);
  });
  it("converts basis", () => {
    expect(toBasis(15000, 0.5, "MWh", DEFAULT_PARAMS)).toBe(7500);
    expect(toBasis(15000, 0.5, "CF%", DEFAULT_PARAMS)).toBe(50);
    expect(toBasis(1000, 1, "£", DEFAULT_PARAMS)).toBe(65000);
  });
  it("labels slots in UK time", () => {
    expect(slotLabel(Date.parse("2026-01-16T14:00:00Z"), 0.5)).toBe("14:00-14:30");
  });
});

describe("runStrategy", () => {
  const sc: Scenario = { daPrice: 50, penalty: 100, longRate: 20, demandMw: 30000, windLoss: () => 0 };
  const ps = [period({ actual: 8000 })];
  it("prices shortfall at cashout", () => {
    const raw = runStrategy("raw", ps, sc)!; // relies on 10000, gets 8000
    expect(raw.buyMwh).toBe(20000);
    expect(raw.shortMwh).toBe(2000);
    expect(raw.total).toBe(20000 * 50 + 2000 * 150);
  });
  it("prices surplus at a discount", () => {
    const p10 = runStrategy("p10", ps, sc)!; // relies on 7000, gets 8000
    expect(p10.longMwh).toBe(1000);
    expect(p10.total).toBe(23000 * 50 - 1000 * 30);
  });
  it("custom volume is honoured", () => {
    expect(runStrategy("custom", ps, sc, 22000)!.buyMwh).toBeCloseTo(22000, 6);
  });
  it("needs outturn", () => {
    expect(runStrategy("raw", [period({ actual: null })], sc)).toBeNull();
  });
});
