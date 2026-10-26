import { useTerminal } from "../../context/TerminalStateContext";

export interface RailItem {
  key: string;
  label: string;
  run: () => void;
  active?: boolean;
  state?: string;
}

/** The function-key actions, shared by the right rail and the global hotkey handler. */
export function useRailItems(): { main: RailItem[]; secondary: RailItem[] } {
  const t = useTerminal();
  return {
    main: [
      { key: "F2", label: "Period / Date", run: () => t.setDrawer({ kind: "date" }) },
      { key: "F3", label: "Gate Time", run: t.cycleGate, state: t.gate },
      { key: "F4", label: "Re-Simulate", run: () => { t.recalc(); t.notify("Recalculated"); } },
      { key: "F5", label: t.detailed ? "Detailed (48 SP)" : "Condensed (24 h)", run: t.toggleDetailed, active: t.detailed },
      { key: "F6", label: "Imbalance Stress", run: t.toggleStress, active: t.stressOn, state: t.stressOn ? `−${t.params.stressPct}%` : "off" },
      { key: "F7", label: "Bias Correction", run: t.toggleBias, active: t.params.biasOn, state: t.params.biasOn ? "on" : "raw" },
      { key: "F8", label: "Export CSV", run: t.exportBlotter },
    ],
    secondary: [
      { key: "B", label: "Basis of Values", run: t.cycleBasis, state: t.basis },
      { key: "H", label: "Change View", run: () => t.cycleView(1) },
      { key: "L", label: "Save Scenario", run: t.saveScenario },
      { key: "F12", label: "Configure", run: () => t.setDrawer({ kind: "config" }) },
    ],
  };
}

export function TallyActionRail() {
  const { main, secondary } = useRailItems();
  const item = (i: RailItem) => (
    <button key={i.key} type="button" className={`t-rail-btn ${i.active ? "t-on" : ""}`} onClick={i.run}>
      <kbd>{i.key}</kbd>
      <span>{i.label}</span>
      {i.state && <em>{i.state}</em>}
    </button>
  );
  return (
    <nav className="t-rail" aria-label="Function keys">
      {main.map(item)}
      <hr />
      {secondary.map(item)}
    </nav>
  );
}
