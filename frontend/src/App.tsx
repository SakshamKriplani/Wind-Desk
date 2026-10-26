import { api } from "./api";
import { TallyShell } from "./components/tally/TallyShell";
import { TerminalProvider, useTerminal } from "./context/TerminalStateContext";
import { useAsync } from "./hooks";
import { TerminalAccuracyView } from "./views/TerminalAccuracyView";
import { TerminalBriefView } from "./views/TerminalBriefView";
import { TerminalLedgerView } from "./views/TerminalLedgerView";
import { TerminalSimulatorView } from "./views/TerminalSimulatorView";

function CurrentView() {
  const { view } = useTerminal();
  switch (view) {
    case "ledger": return <TerminalLedgerView />;
    case "accuracy": return <TerminalAccuracyView />;
    case "simulator": return <TerminalSimulatorView />;
    default: return <TerminalBriefView />;
  }
}

export default function App() {
  const meta = useAsync(() => api.meta(), []);
  if (meta.error) {
    return (
      <div className="t-boot t-neg" role="alert">
        Couldn't reach the Wind Desk API ({meta.error}). Start the backend on port 8000, then reload.
      </div>
    );
  }
  if (!meta.data) return <div className="t-boot">Loading Wind Desk terminal…</div>;
  return (
    <TerminalProvider meta={meta.data}>
      <TallyShell>
        <CurrentView />
      </TallyShell>
    </TerminalProvider>
  );
}
