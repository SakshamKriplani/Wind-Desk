import { useEffect, useState } from "react";
import { api } from "./api";
import { Failed, Loading } from "./components/Status";
import { dayTime } from "./format";
import { useAsync } from "./hooks";
import { AccuracyView } from "./views/AccuracyView";
import { BriefView } from "./views/BriefView";
import { ExploreView } from "./views/ExploreView";

type Tab = "brief" | "accuracy" | "explore";

const TABS: { id: Tab; label: string }[] = [
  { id: "brief", label: "Day-ahead brief" },
  { id: "accuracy", label: "Forecast accuracy" },
  { id: "explore", label: "Explorer" },
];

/** Routes live in the URL hash so views can be bookmarked: #/brief/2026-01-15 */
function readHash(): { tab: Tab; day?: string } {
  const [, tab, day] = window.location.hash.split("/");
  const t = TABS.some((x) => x.id === tab) ? (tab as Tab) : "brief";
  return { tab: t, day: /^\d{4}-\d{2}-\d{2}$/.test(day ?? "") ? day : undefined };
}

export default function App() {
  const meta = useAsync(() => api.meta(), []);
  const [route, setRoute] = useState(readHash);
  const [gate, setGate] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const m = meta.data;
  const days = m?.decision_days ?? [];
  const day = route.day && days.includes(route.day) ? route.day : days[14];
  const gateTime = gate ?? m?.default_gate_closure ?? "09:50";
  const go = (tab: Tab, d?: string) => {
    window.location.hash = tab === "brief" ? `/brief/${d ?? day}` : `/${tab}`;
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="6" fill="#13262F" />
            <path d="M5 20c4-6 8-6 11 0s7 6 11 0" fill="none" stroke="#7FC0D6" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M5 13c4-6 8-6 11 0s7 6 11 0" fill="none" stroke="#E2A23B" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="1 4.5" />
          </svg>
          Wind Desk
        </div>
        <nav className="tabs" aria-label="Views">
          {TABS.map((t) => (
            <a key={t.id} href={t.id === "brief" ? `#/brief/${day ?? ""}` : `#/${t.id}`}
              aria-current={route.tab === t.id ? "page" : undefined}>
              {t.label}
            </a>
          ))}
        </nav>
        {m && (
          <span className="source">
            GB national wind, Elexon BMRS (FUELHH, WINDFOR)
            {m.fetched_at ? `, fetched ${dayTime(m.fetched_at)}` : ""}
          </span>
        )}
      </header>
      {m && m.source !== "elexon-bmrs" && (
        <p className="warning" role="alert">
          This instance is running on test data ({m.source}), not Elexon data. Run backend/scripts/fetch_data.py to load the real feeds.
        </p>
      )}

      <main>
        {meta.error && <Failed message={meta.error} />}
        {meta.loading && <Loading what="data" />}
        {m && route.tab === "brief" && day && (
          <BriefView meta={m} day={day} gate={gateTime} onDay={(d) => go("brief", d)} onGate={setGate} />
        )}
        {m && route.tab === "accuracy" && (
          <AccuracyView gate={gateTime} onGate={setGate} onOpenDay={(d) => go("brief", d)} />
        )}
        {m && route.tab === "explore" && <ExploreView meta={m} />}
      </main>

      {m && (
        <footer>
          Decisions on each day of January 2026 for delivery the following day (00:00–24:00 UK). Default gate
          closure 09:50 UK, the GB day-ahead auction. {m.forecast_runs.toLocaleString("en-GB")} forecast runs,
          {" "}{m.actual_rows.toLocaleString("en-GB")} half-hours of outturn.
        </footer>
      )}
    </>
  );
}
