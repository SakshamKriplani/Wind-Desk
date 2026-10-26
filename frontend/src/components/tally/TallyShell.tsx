import { useEffect, useState, type ReactNode } from "react";
import { RISK_PRESETS, VIEWS, useTerminal } from "../../context/TerminalStateContext";
import { calendar, countdown, dayTime, nextUkTime, shortDay, time, addDays } from "../../format";
import { TallyActionRail, useRailItems } from "./TallyActionRail";
import { TallyBadge } from "./TallyBadge";
import { Drawers } from "./Drawers";

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

function useViewport() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return size;
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA");

/** Global keyboard map. Function keys work everywhere; letter keys only outside inputs. */
function useHotkeys() {
  const t = useTerminal();
  const { main, secondary } = useRailItems();
  useEffect(() => {
    const byKey = new Map([...main, ...secondary].map((i) => [i.key, i.run]));
    const cycleRisk = () => {
      const i = RISK_PRESETS.findIndex((p) => p.value === t.params.risk);
      const next = RISK_PRESETS[(i + 1) % RISK_PRESETS.length];
      t.setParam("risk", next.value);
      t.notify(`Risk tolerance: ${next.label}`);
    };
    const letters: Record<string, () => void> = {
      b: byKey.get("B")!,
      h: byKey.get("H")!,
      l: byKey.get("L")!,
      k: () => t.setDrawer({ kind: "date" }),
      y: t.cycleGate,
      z: cycleRisk,
      o: t.toggleActuals,
      e: t.exportBlotter,
      m: t.toggleJitter,
      q: () => { t.setDrawer(null); t.setSelected(null); t.setView("brief"); },
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (t.drawer) t.setDrawer(null);
        else t.setSelected(null);
        return;
      }
      if (t.drawer) return;
      if (e.altKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        t.setDrawer({ kind: "goto" });
        return;
      }
      if (e.key === "F1") {
        e.preventDefault();
        t.setDrawer({ kind: "help" });
        return;
      }
      const fn = /^F\d+$/.test(e.key) ? byKey.get(e.key) : undefined;
      if (fn) {
        e.preventDefault();
        fn();
        return;
      }
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const act = letters[e.key.toLowerCase()];
      if (act) {
        e.preventDefault();
        act();
        return;
      }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !(e.target as HTMLElement).closest?.(".t-table-wrap")) {
        const tiles = [...document.querySelectorAll<HTMLElement>("[data-tile]")];
        if (!tiles.length) return;
        const i = tiles.indexOf(document.activeElement as HTMLElement);
        const n = e.key === "ArrowRight" ? (i + 1) % tiles.length : (i - 1 + tiles.length) % tiles.length;
        e.preventDefault();
        tiles[n].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t, main, secondary]);
}

export function TallyShell({ children }: { children: ReactNode }) {
  const t = useTerminal();
  const now = useNow();
  const vp = useViewport();
  useHotkeys();
  const d = t.decision.data;
  const run = d?.summary.latest_publish_time;
  const viewLabel = VIEWS.find((v) => v.id === t.view)!.label;
  const delivery = addDays(t.day, 1);
  const risk = RISK_PRESETS.find((p) => p.value === t.params.risk)?.label ?? `${Math.round(t.params.risk * 100)}% to P10`;

  const pill = (k: string, label: string, onClick: () => void, value?: string, on?: boolean) => (
    <button type="button" className={`t-pill ${on ? "t-on" : ""}`} onClick={onClick}>
      <kbd>{k}</kbd>{label}{value && <b>{value}</b>}
    </button>
  );

  return (
    <div className="t-app">
      <header className="t-master">
        <div className="t-brand">
          Wind Desk <span className="t-edition">TERMINAL</span>
        </div>
        <button type="button" className="t-search" onClick={() => t.setDrawer({ kind: "goto" })}>
          🔍 Find views, delivery dates or settlement periods… <kbd>Alt+G</kbd>
        </button>
        <button type="button" className={`t-pill t-pill-dark ${t.liveRecalc ? "t-on" : ""}`}
          onClick={() => t.setLiveRecalc(!t.liveRecalc)} title="When off, input changes wait for F4 or ⚡ Recalc">
          ⚡ Live Recalc: <b>{t.liveRecalc ? "ON" : "OFF"}</b>
        </button>
        {!t.liveRecalc && (
          <button type="button" className={`t-pill t-pill-dark ${t.pending ? "t-pending" : ""}`} onClick={t.recalc}>
            ⚡ Recalc{t.pending ? " (pending)" : ""}
          </button>
        )}
        <button type="button" className={`t-pill t-pill-dark ${t.jitter ? "t-sim" : ""}`} onClick={t.toggleJitter}
          title="Demo mode: nudges forecast values every 8 seconds. Not real data.">
          ⟳ Jitter: <b>{t.jitter ? "ON 8s" : "OFF"}</b>
        </button>
        <div className="t-ticker" aria-label="Status ticker">
          <span className="t-dot" /> SNAPSHOT {t.meta.fetched_at ? dayTime(t.meta.fetched_at) : "–"}
          <span className="t-sep">|</span> RUN {run ? time(run) : "–"}
          <span className="t-sep">|</span> NEXT {t.gate} GATE IN <b>{countdown(nextUkTime(t.gate, now) - now)}</b>
        </div>
      </header>

      <div className="t-subbar">
        <nav className="t-crumbs" aria-label="Breadcrumb">
          <button type="button" onClick={() => t.setView("brief")}>Wind Desk</button>
          <span>›</span>
          <button type="button" onClick={() => t.cycleView(1)} title="H: change view">{viewLabel}</button>
          <span>›</span>
          <span>Delivery: {delivery} [Gate: {t.gate} UK]</span>
        </nav>
        <div className="t-pills">
          {pill("K", "Settlement Day", () => t.setDrawer({ kind: "date" }), shortDay(calendar(delivery).getTime()))}
          {pill("Y", "Gate Closure", t.cycleGate, `${t.gate} UK`)}
          {pill("Z", "Risk", () => {
            const i = RISK_PRESETS.findIndex((p) => p.value === t.params.risk);
            t.setParam("risk", RISK_PRESETS[(i + 1) % RISK_PRESETS.length].value);
          }, risk)}
          {pill("O", "Actuals", t.toggleActuals, t.showActuals ? "shown" : "hidden", t.showActuals)}
          {pill("E", "Export Blotter", t.exportBlotter)}
          {pill("M", "Simulate Jitter", t.toggleJitter, t.jitter ? "on" : "off", t.jitter)}
          {pill("F1", "Help", () => t.setDrawer({ kind: "help" }))}
        </div>
      </div>

      <div className="t-body">
        <main className="t-main" id="main">{children}</main>
        <TallyActionRail />
      </div>

      <footer className="t-status">
        <span><kbd>Q</kbd> Quit</span>
        <span><kbd>←</kbd> Prev Tile</span>
        <span><kbd>→</kbd> Next Tile</span>
        <span><kbd>↑↓</kbd> Move</span>
        <span><kbd>Space</kbd> Select Row</span>
        <span><kbd>Enter</kbd> Drilldown</span>
        <span><kbd>Esc</kbd> Back</span>
        <span className="t-status-flags">
          {t.notice && <span className="t-notice">{t.notice}</span>}
          {t.jitter && <TallyBadge tone="sim">SIMULATED JITTER</TallyBadge>}
          {t.stressOn && <TallyBadge tone="crit">STRESS −{t.params.stressPct}% WIND</TallyBadge>}
          <TallyBadge tone={t.params.biasOn ? "info" : "warn"}>{t.params.biasOn ? "BIAS ADJ" : "RAW FCST"}</TallyBadge>
          {t.showActuals && <TallyBadge tone="warn">HINDSIGHT</TallyBadge>}
          {t.meta.source !== "elexon-bmrs" && <TallyBadge tone="crit">TEST DATA</TallyBadge>}
          <span className="t-vp">{vp.w.toLocaleString("en-GB")} × {vp.h.toLocaleString("en-GB")}</span>
        </span>
      </footer>
      <Drawers />
    </div>
  );
}
