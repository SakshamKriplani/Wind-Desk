/**
 * Shared terminal state: what the trader has selected, their trading parameters, manual edits,
 * and the derived rows every view reads. Calculations run in calc.ts; this file only wires
 * inputs to outputs and to the API.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import {
  DEFAULT_PARAMS, buildPeriods, computeRows, slotLabel, totals,
  type Basis, type Override, type Params, type Period, type Row, type Totals,
} from "../calc";
import { download, toCsv } from "../format";
import type { AsyncState } from "../hooks";
import {
  STAGED_MS, checkLookahead, heapMb, progressOf, remainingSchedule, stepMessage,
  type CalcStats, type CalcStatus,
} from "../pipeline";
import type { Decision, Meta } from "../types";

export type View = "brief" | "ledger" | "accuracy" | "simulator";
export const VIEWS: { id: View; label: string }[] = [
  { id: "brief", label: "Day-Ahead Brief" },
  { id: "ledger", label: "Settlement Ledger" },
  { id: "accuracy", label: "Accuracy Matrix" },
  { id: "simulator", label: "Scenario Sandbox" },
];
export const GATE_CYCLE = ["09:20", "09:50", "11:00", "12:00"];
export const RISK_PRESETS = [
  { value: 0, label: "P50 Aggressive" },
  { value: 0.5, label: "Balanced" },
  { value: 1, label: "P10 Conservative" },
];
const BASES: Basis[] = ["MWh", "CF%", "£"];
const JITTER_MS = 8000;
const REHEDGE_MS = 300;
const SCENARIO_KEY = "winddesk.scenarios";

export type Drawer =
  | null
  | { kind: "goto" }
  | { kind: "config" }
  | { kind: "help" }
  | { kind: "date" }
  | { kind: "inspect"; t: number };

export interface SavedScenario {
  name: string;
  day: string;
  gate: string;
  params: Params;
}

export interface TerminalState {
  meta: Meta;
  view: View;
  setView: (v: View) => void;
  cycleView: (dir?: 1 | -1) => void;
  day: string;
  setDay: (d: string) => void;
  stepDay: (n: number) => void;
  gate: string;
  setGate: (g: string) => void;
  cycleGate: () => void;

  // calculation pipeline (see pipeline.ts)
  calcStatus: CalcStatus;
  calcProgress: number;
  calcStep: string;
  calcStats: CalcStats | null;
  hasRunInitialCalc: boolean;
  /** the day and gate the current results were computed for */
  committed: { day: string; gate: string } | null;
  staged: boolean;
  setStaged: (v: boolean) => void;
  /** full pipeline: load the decision, then reveal metrics, charts and table in turn */
  compute: () => void;
  /** downstream only: re-apply trading inputs to the loaded decision */
  rehedge: (ms?: number) => void;
  rehedging: boolean;
  computeTick: number;
  resetToEmpty: () => void;

  params: Params;            // what the inputs show
  applied: Params;           // what the calculations use
  setParam: <K extends keyof Params>(k: K, v: Params[K]) => void;
  liveRecalc: boolean;
  setLiveRecalc: (v: boolean) => void;
  pending: boolean;          // inputs changed but not yet applied
  recalc: () => void;
  recalcTick: number;        // bumps on every recalculation, for visual pulses

  detailed: boolean;
  toggleDetailed: () => void;
  basis: Basis;
  cycleBasis: () => void;
  showActuals: boolean;
  toggleActuals: () => void;
  jitter: boolean;
  toggleJitter: () => void;
  stressOn: boolean;
  toggleStress: () => void;
  toggleBias: () => void;

  decision: AsyncState<Decision>;
  periods: Period[];
  /** periods with outturn always attached, for hindsight backtests */
  hindsightPeriods: Period[];
  rows: Row[];
  tot: Totals;
  overrides: Record<number, Override>;
  setOverride: (t: number, ov: Override | undefined) => void;
  clearOverrides: () => void;

  selected: number | null;
  setSelected: (t: number | null) => void;
  drawer: Drawer;
  setDrawer: (d: Drawer) => void;

  scenarios: SavedScenario[];
  saveScenario: () => void;
  loadScenario: (s: SavedScenario) => void;
  exportBlotter: () => void;
  notice: string | null;
  notify: (msg: string) => void;
}

const Ctx = createContext<TerminalState | null>(null);

export function useTerminal(): TerminalState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTerminal must be used inside TerminalProvider");
  return v;
}

// --- routing: #/terminal/<view>/<day> -----------------------------------------------
function readHash(days: string[]): { view: View; day: string } {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/");
  const view = (VIEWS.find((v) => v.id === parts[1])?.id ?? "brief") as View;
  const day = days.includes(parts[2]) ? parts[2] : days[14] ?? days[0];
  return { view, day };
}

function readScenarios(): SavedScenario[] {
  try {
    return JSON.parse(localStorage.getItem(SCENARIO_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function TerminalProvider({ meta, children }: { meta: Meta; children: ReactNode }) {
  const days = meta.decision_days;
  const [route, setRoute] = useState(() => readHash(days));
  const [gate, setGate] = useState(meta.default_gate_closure);
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [applied, setApplied] = useState<Params>(DEFAULT_PARAMS);
  const [liveRecalc, setLiveRecalc] = useState(true);
  const [recalcTick, setRecalcTick] = useState(0);
  const [detailed, setDetailed] = useState(true);
  const [basis, setBasis] = useState<Basis>("MWh");
  const [showActuals, setShowActuals] = useState(false);
  const [jitter, setJitter] = useState(false);
  const [noise, setNoise] = useState<number[] | null>(null);
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [scenarios, setScenarios] = useState<SavedScenario[]>(readScenarios);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const [committed, setCommitted] = useState<{ day: string; gate: string } | null>(null);
  const [calcStatus, setCalcStatus] = useState<CalcStatus>("empty");
  const [calcStats, setCalcStats] = useState<CalcStats | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [touched, setTouched] = useState(false);
  const [staged, setStaged] = useState(true);
  const [rehedging, setRehedging] = useState(false);
  const [computeTick, setComputeTick] = useState(0);
  const timers = useRef<number[]>([]);
  const runStart = useRef(0);
  const scheduledRun = useRef(-1);
  const fetchMs = useRef(0);
  const mathMs = useRef(0);

  const notify = useCallback((msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3000);
  }, []);

  // hash <-> state
  useEffect(() => {
    const onHash = () => setRoute(readHash(days));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [days]);
  const go = useCallback((view: View, day: string) => {
    window.location.hash = `/terminal/${view}/${day}`;
  }, []);
  const { view, day } = route;

  // a new decision starts clean
  const committedKey = committed ? `${committed.day}|${committed.gate}` : null;
  useEffect(() => {
    setOverrides({});
    setSelected(null);
  }, [committedKey]);

  // --- calculation pipeline -----------------------------------------------------------
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  const compute = useCallback(() => {
    clearTimers();
    runStart.current = performance.now();
    setApplied(params);
    setRecalcTick((n) => n + 1);
    setCommitted({ day, gate });
    setCalcStats(null);
    setCalcStatus("initializing");
    setHasRun(true);
    setComputeTick((n) => n + 1);
  }, [params, day, gate]);

  const resetToEmpty = useCallback(() => {
    clearTimers();
    setCommitted(null);
    setCalcStatus("empty");
    setCalcStats(null);
    setHasRun(false);
    setTouched(false);
  }, []);

  // picking a new day (or, after the first run, a new gate) runs the full pipeline
  useEffect(() => {
    if (!(hasRun || touched)) return;
    if (committed && committed.day === day && committed.gate === gate) return;
    compute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, gate, touched]);

  // trading inputs: after a run, re-hedge downstream figures; otherwise apply silently
  useEffect(() => {
    if (!liveRecalc || params === applied) return;
    if (!hasRun || calcStatus !== "ready" || !staged) {
      setApplied(params);
      setRecalcTick((n) => n + 1);
      return;
    }
    setRehedging(true);
    const id = window.setTimeout(() => {
      setApplied(params);
      setRecalcTick((n) => n + 1);
      setRehedging(false);
    }, REHEDGE_MS);
    return () => {
      window.clearTimeout(id);
      setRehedging(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, liveRecalc]);

  const rehedge = useCallback((ms = 400) => {
    if (!hasRun) return compute();
    setRehedging(true);
    window.setTimeout(() => {
      setApplied(params);
      setRecalcTick((n) => n + 1);
      setRehedging(false);
    }, staged ? ms : 0);
  }, [hasRun, compute, params, staged]);
  const recalc = useCallback(() => rehedge(500), [rehedge]);

  // demo jitter: a small random walk on the forecast, clearly flagged in the UI
  useEffect(() => {
    if (!jitter) {
      setNoise(null);
      return;
    }
    const step = () =>
      setNoise((prev) => Array.from({ length: 48 }, (_, i) => {
        const v = (prev?.[i] ?? 0) + (Math.random() - 0.5) * 0.02;
        return Math.max(-0.06, Math.min(0.06, v));
      }));
    step();
    const id = window.setInterval(step, JITTER_MS);
    return () => window.clearInterval(id);
  }, [jitter]);

  // data
  // data for the committed day and gate only
  const [dec, setDec] = useState<{ key: string; data: Decision } | null>(null);
  const [decError, setDecError] = useState<string | null>(null);
  useEffect(() => {
    if (!committed || dec?.key === committedKey) return;
    let live = true;
    setDecError(null);
    api.decision(committed.day, committed.gate)
      .then((data) => live && setDec({ key: committedKey!, data }))
      .catch((e: Error) => live && setDecError(e.message));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedKey]);
  const d = dec && dec.key === committedKey ? dec.data : null;
  const decision: AsyncState<Decision> = {
    data: d,
    error: decError,
    loading: committed != null && d == null && decError == null,
  };

  const [series, setSeries] = useState<{ start: string; actual: Map<number, number> } | null>(null);
  useEffect(() => {
    if (!d || series?.start === d.delivery_start) return;
    let live = true;
    api.series(d.delivery_start, d.delivery_end, 0).then((s) => {
      if (!live) return;
      const m = new Map(s.actual.filter((a) => a.mw != null).map((a) => [new Date(a.t).getTime(), a.mw!]));
      setSeries({ start: d.delivery_start, actual: m });
    }).catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.delivery_start]);
  const halfHourActuals = d && series?.start === d.delivery_start ? series.actual : null;

  // once the decision is loaded, schedule the remaining reveal steps
  useEffect(() => {
    if (calcStatus !== "initializing" || !d || scheduledRun.current === computeTick) return;
    scheduledRun.current = computeTick;
    const elapsed = performance.now() - runStart.current;
    fetchMs.current = elapsed;
    for (const { status, delay } of remainingSchedule(staged ? STAGED_MS : 0, elapsed)) {
      timers.current.push(window.setTimeout(() => setCalcStatus(status), delay));
    }
  }, [calcStatus, d, staged, computeTick]);
  useEffect(() => () => clearTimers(), []);

  const hindsightPeriods = useMemo(
    () => (d ? buildPeriods(d, halfHourActuals, detailed, noise) : []),
    [d, halfHourActuals, detailed, noise],
  );
  const periods = useMemo(
    () => (showActuals ? hindsightPeriods : hindsightPeriods.map((p) => ({ ...p, actual: null }))),
    [hindsightPeriods, showActuals],
  );
  const rows = useMemo(() => {
    const t0 = performance.now();
    const out = computeRows(periods, applied, overrides);
    mathMs.current = performance.now() - t0;
    return out;
  }, [periods, applied, overrides]);

  // measured, not invented: timings, rows and a lookahead check on what the API returned
  useEffect(() => {
    if (calcStatus !== "ready" || !d) return;
    const lk = checkLookahead(
      [...d.points, ...d.previous_runs.map((r) => ({ publish_time: r.publish_time }))],
      d.decision_time,
    );
    setCalcStats({
      totalMs: performance.now() - runStart.current,
      fetchMs: fetchMs.current,
      mathMs: mathMs.current,
      rows: rows.length,
      checked: lk.checked,
      lookaheadOk: lk.ok,
      heapMb: heapMb(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcStatus]);
  const calcStep = committed
    ? stepMessage(calcStatus, {
        day: committed.day,
        gate: committed.gate,
        lookbackDays: meta.error_lookback_days,
        leadH: d?.summary.lead_range_hours?.[0] ?? null,
        rows: rows.length || (detailed ? 48 : 24),
      })
    : "";
  const tot = useMemo(() => totals(rows, applied), [rows, applied]);

  const setParam = useCallback(<K extends keyof Params>(k: K, v: Params[K]) => {
    setParams((p) => ({ ...p, [k]: v }));
  }, []);

  const setOverride = useCallback((t: number, ov: Override | undefined) => {
    setOverrides((o) => {
      const next = { ...o };
      if (!ov || (ov.forecast == null && ov.contracted == null)) delete next[t];
      else next[t] = ov;
      return next;
    });
  }, []);

  const exportBlotter = useCallback(() => {
    const out = rows.map((r) => ({
      settlement_period: r.sp,
      time_slot_uk: slotLabel(r.t, r.hours),
      forecast_mw: Math.round(r.forecast),
      bias_adjusted_mw: Math.round(r.adjusted),
      hedge_base_mw: Math.round(r.base),
      edited: r.edited ? "yes" : "",
      p10_mw: Math.round(r.floor),
      p90_mw: Math.round(r.ceil),
      wind_counted_mw: Math.round(r.counted),
      contracted_mw: Math.round(r.contracted),
      expected_short_mw: Math.round(r.expShortMw),
      expected_cashout_gbp: Math.round(r.expCashout),
      actual_mw: r.actual == null ? "" : Math.round(r.actual),
    }));
    download(`wind-desk-blotter-${day}-gate${gate.replace(":", "")}.csv`, toCsv(out));
    notify("Blotter exported");
  }, [rows, day, gate, notify]);

  const saveScenario = useCallback(() => {
    const s: SavedScenario = { name: `Scenario ${scenarios.length + 1}`, day, gate, params };
    const next = [...scenarios, s].slice(-12);
    setScenarios(next);
    try {
      localStorage.setItem(SCENARIO_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: keep for this session only */
    }
    notify(`${s.name} saved`);
  }, [scenarios, day, gate, params, notify]);

  const loadScenario = useCallback((s: SavedScenario) => {
    setParams(s.params);
    setGate(s.gate);
    go(view, s.day);
    notify(`${s.name} loaded`);
  }, [go, view, notify]);

  const value: TerminalState = {
    meta,
    view,
    setView: (v) => go(v, day),
    cycleView: (dir = 1) => {
      const i = VIEWS.findIndex((v) => v.id === view);
      go(VIEWS[(i + dir + VIEWS.length) % VIEWS.length].id, day);
    },
    day,
    setDay: (dd) => {
      if (!days.includes(dd)) return;
      setTouched(true);
      go(view, dd);
    },
    stepDay: (n) => {
      const i = days.indexOf(day) + n;
      if (i >= 0 && i < days.length) {
        setTouched(true);
        go(view, days[i]);
      }
    },
    gate,
    setGate,
    cycleGate: () => {
      const i = GATE_CYCLE.indexOf(gate);
      setGate(GATE_CYCLE[(i + 1) % GATE_CYCLE.length]);
    },
    calcStatus,
    calcProgress: progressOf(calcStatus),
    calcStep,
    calcStats,
    hasRunInitialCalc: hasRun,
    committed,
    staged,
    setStaged,
    compute,
    rehedge,
    rehedging,
    computeTick,
    resetToEmpty,
    params,
    applied,
    setParam,
    liveRecalc,
    setLiveRecalc,
    pending: params !== applied,
    recalc,
    recalcTick,
    detailed,
    toggleDetailed: () => setDetailed((v) => !v),
    basis,
    cycleBasis: () => setBasis((b) => BASES[(BASES.indexOf(b) + 1) % BASES.length]),
    showActuals,
    toggleActuals: () => setShowActuals((v) => !v),
    jitter,
    toggleJitter: () => setJitter((v) => !v),
    stressOn: params.stressPct > 0,
    toggleStress: () => setParam("stressPct", params.stressPct > 0 ? 0 : 20),
    toggleBias: () => setParam("biasOn", !params.biasOn),
    decision,
    periods,
    hindsightPeriods,
    rows,
    tot,
    overrides,
    setOverride,
    clearOverrides: () => setOverrides({}),
    selected,
    setSelected,
    drawer,
    setDrawer,
    scenarios,
    saveScenario,
    loadScenario,
    exportBlotter,
    notice,
    notify,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
