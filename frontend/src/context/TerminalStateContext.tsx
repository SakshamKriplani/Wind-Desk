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
import { useAsync, type AsyncState } from "../hooks";
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
  useEffect(() => {
    setOverrides({});
    setSelected(null);
  }, [day, gate]);

  // live recalculation: inputs apply immediately, otherwise wait for Recalc
  useEffect(() => {
    if (liveRecalc) {
      setApplied(params);
      setRecalcTick((n) => n + 1);
    }
  }, [params, liveRecalc]);
  const recalc = useCallback(() => {
    setApplied(params);
    setRecalcTick((n) => n + 1);
  }, [params]);

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
  const decision = useAsync(() => api.decision(day, gate), [day, gate]);
  const d = decision.data;
  const series = useAsync(
    () => (d ? api.series(d.delivery_start, d.delivery_end, 0) : Promise.resolve(null)),
    [d?.delivery_start],
  );
  const halfHourActuals = useMemo(() => {
    if (!series.data) return null;
    return new Map(series.data.actual.filter((a) => a.mw != null).map((a) => [new Date(a.t).getTime(), a.mw!]));
  }, [series.data]);

  const hindsightPeriods = useMemo(
    () => (d ? buildPeriods(d, halfHourActuals, detailed, noise) : []),
    [d, halfHourActuals, detailed, noise],
  );
  const periods = useMemo(
    () => (showActuals ? hindsightPeriods : hindsightPeriods.map((p) => ({ ...p, actual: null }))),
    [hindsightPeriods, showActuals],
  );
  const rows = useMemo(() => computeRows(periods, applied, overrides), [periods, applied, overrides]);
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
    setDay: (dd) => days.includes(dd) && go(view, dd),
    stepDay: (n) => {
      const i = days.indexOf(day) + n;
      if (i >= 0 && i < days.length) go(view, days[i]);
    },
    gate,
    setGate,
    cycleGate: () => {
      const i = GATE_CYCLE.indexOf(gate);
      setGate(GATE_CYCLE[(i + 1) % GATE_CYCLE.length]);
    },
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
