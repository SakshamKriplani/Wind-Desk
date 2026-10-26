import { useEffect, useState } from "react";
import { BLOCKS, blockOf, slotLabel, toBasis, type Row } from "../calc";
import { Num } from "../components/tally/Num";
import { TallyBadge } from "../components/tally/TallyBadge";
import { TallyTable, type Column, type Group } from "../components/tally/TallyTable";
import { useTerminal } from "../context/TerminalStateContext";
import { addDays, gbp, int } from "../format";
import { BasisCell, basisUnit, shortClass } from "./shared";

/** Number cell that edits in place: Enter or blur commits, Esc reverts, empty clears the edit. */
function EditCell({ value, edited, onCommit, label }: {
  value: number; edited: boolean; onCommit: (v: number | undefined) => void; label: string;
}) {
  const [text, setText] = useState(String(Math.round(value)));
  useEffect(() => setText(String(Math.round(value))), [value]);
  const commit = () => {
    if (text.trim() === "") return onCommit(undefined);
    const v = Number(text);
    if (Number.isFinite(v) && Math.round(v) !== Math.round(value)) onCommit(Math.max(0, v));
  };
  return (
    <input
      className={`t-cell-input ${edited ? "t-cell-edited" : ""}`}
      aria-label={label}
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); }
        if (e.key === "Escape") { setText(String(Math.round(value))); (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
}

export function TerminalLedgerView() {
  const t = useTerminal();
  const [flash, setFlash] = useState<number | null>(null);
  const { rows, tot, applied: p, basis } = t;
  const d = t.decision.data;

  if (t.decision.error) return <p className="t-empty t-neg">Could not load the decision: {t.decision.error}</p>;
  if (!d) return <p className="t-empty">Loading the settlement ledger…</p>;

  const reprice = (r: Row) => {
    t.recalc();
    setFlash(r.t);
    window.setTimeout(() => setFlash(null), 700);
    t.notify(`SP ${r.sp} re-priced`);
  };
  const autoBalance = (r: Row) => {
    t.setOverride(r.t, { ...t.overrides[r.t], contracted: undefined });
    t.notify(`SP ${r.sp} balanced to the recommendation`);
  };
  const unit = basisUnit(basis);
  const blockSum = (rs: Row[], f: (r: Row) => number) => rs.reduce((s, r) => s + toBasis(f(r), r.hours, basis, p), 0);
  const fmtBasis = (v: number) => (basis === "£" ? gbp(v) : basis === "CF%" ? `${int(v, 1)}% avg` : int(v));

  const columns: Column<Row>[] = [
    { key: "sp", header: "SP", align: "left", width: 54, render: (r) => (r.spEnd !== r.sp ? `${r.sp}–${r.spEnd}` : r.sp) },
    { key: "slot", header: "TIME SLOT", align: "left", width: 100, render: (r) => slotLabel(r.t, r.hours) },
    {
      key: "fcst", header: "FORECAST (MW) ✎", width: 110,
      render: (r) => (
        <EditCell label={`Forecast SP ${r.sp}`} value={r.base} edited={r.edited}
          onCommit={(v) => t.setOverride(r.t, { ...t.overrides[r.t], forecast: v })} />
      ),
    },
    { key: "raw", header: `RAW (${unit})`, render: (r) => <BasisCell mw={r.forecast} r={r} /> },
    { key: "adj", header: `BIAS ADJ (${unit})`, render: (r) => <BasisCell mw={r.adjusted} r={r} /> },
    {
      key: "con", header: "CONTRACTED MW ✎", width: 120,
      render: (r) => (
        <EditCell label={`Contracted SP ${r.sp}`} value={r.contracted} edited={t.overrides[r.t]?.contracted != null}
          onCommit={(v) => t.setOverride(r.t, { ...t.overrides[r.t], contracted: v })} />
      ),
    },
    { key: "p10", header: `P10 FLOOR (${unit})`, render: (r) => <BasisCell mw={r.floor} r={r} /> },
    { key: "p90", header: `P90 CEIL (${unit})`, render: (r) => <BasisCell mw={r.ceil} r={r} /> },
    { key: "short", header: "EXP. SHORT (MW)", render: (r) => <Num value={r.expShortMw} format={(v) => int(v)} /> },
    {
      key: "exp", header: "EXP. CASHOUT EXPOSURE (£)",
      render: (r) => <Num value={-r.expCashout} format={gbp} />,
      cellClass: (r) => shortClass(r, p),
    },
  ];
  if (t.showActuals) {
    columns.push(
      { key: "act", header: `ACTUAL (${unit})`, render: (r) => (r.actual == null ? "–" : <BasisCell mw={r.actual} r={r} />) },
      { key: "real", header: "REALISED (£)", render: (r) => (r.realCashout == null ? "–" : gbp(-r.realCashout)), cellClass: () => "t-neg" },
    );
  }
  columns.push({
    key: "act-btns", header: "ACTIONS", align: "center", width: 170,
    render: (r) => (
      <span className="t-row-actions">
        <button type="button" className="t-mini" onClick={(e) => { e.stopPropagation(); reprice(r); }}>⟳ Re-price</button>
        <button type="button" className="t-mini" onClick={(e) => { e.stopPropagation(); autoBalance(r); }}>Auto-Balance</button>
      </span>
    ),
  });

  const order = ["peak", "overnight", "late"] as const;
  const groups: Group<Row>[] = order.map((id) => {
    const b = BLOCKS.find((x) => x.id === id)!;
    const rs = rows.filter((r) => blockOf(r.sp) === id);
    return {
      id,
      title: `${b.title}: ${rs.length} rows`,
      rows: rs,
      summary: {
        raw: fmtBasis(blockSum(rs, (r) => r.forecast) / (basis === "CF%" ? Math.max(1, rs.length) : 1)),
        adj: fmtBasis(blockSum(rs, (r) => r.adjusted) / (basis === "CF%" ? Math.max(1, rs.length) : 1)),
        con: `${int(rs.reduce((s, r) => s + r.contracted * r.hours, 0))} MWh`,
        exp: gbp(-rs.reduce((s, r) => s + r.expCashout, 0)),
      },
    };
  });

  const edits = Object.keys(t.overrides).length;
  return (
    <div className="t-view">
      <div className="t-ledger-head">
        <h1>Settlement period blotter, delivery {addDays(t.day, 1)}</h1>
        <div className="t-toolbar">
          <span>Basis <TallyBadge tone="info">{basis}</TallyBadge> <kbd>B</kbd></span>
          <span>Rows <TallyBadge tone="info">{t.detailed ? "48 SP" : "24 h"}</TallyBadge> <kbd>F5</kbd></span>
          <span>Hedge <TallyBadge tone={p.biasOn ? "info" : "warn"}>{p.biasOn ? "BIAS ADJ" : "RAW"}</TallyBadge> <kbd>F7</kbd></span>
          <span>Edits <TallyBadge tone={edits ? "warn" : "ok"}>{edits}</TallyBadge></span>
          <button type="button" className="t-btn" onClick={() => { t.clearOverrides(); t.notify("All periods balanced to the recommendation"); }}>Auto-Balance all</button>
          <button type="button" className="t-btn" onClick={t.exportBlotter}><kbd>F8</kbd> Export CSV</button>
        </div>
      </div>
      <p className="t-note">
        Edit a forecast to override the hedge base for that period; its P10 to P90 range moves with it. Edit a contracted volume to
        take a different position. Forecasts are hourly, so in 48-SP mode each half-hour is interpolated.
      </p>
      <TallyTable
        caption="Settlement period blotter"
        columns={columns}
        groups={groups}
        rowKey={(r) => r.t}
        selected={t.selected}
        onSelect={(k) => t.setSelected(k as number)}
        onActivate={(r) => t.setDrawer({ kind: "inspect", t: r.t })}
        rowClass={(r) => [r.t === flash ? "t-row-flash" : "", r.edited || t.overrides[r.t]?.contracted != null ? "t-edited" : ""].join(" ")}
        maxHeight="calc(100vh - 250px)"
        footer={{
          sp: "TOTAL",
          slot: `${rows.length} rows`,
          raw: basis === "CF%" ? undefined : fmtBasis(blockSum(rows, (r) => r.forecast)),
          adj: basis === "CF%" ? undefined : fmtBasis(blockSum(rows, (r) => r.adjusted)),
          con: `${int(tot.contractedMwh)} MWh`,
          short: `${int(tot.expShortMwh)} MWh`,
          exp: <span className="t-neg">Net risk {gbp(-tot.expCashout)}</span>,
          ...(t.showActuals ? {
            act: tot.actualMwh != null && basis === "MWh" ? int(tot.actualMwh) : undefined,
            real: tot.realCashout != null ? gbp(-tot.realCashout) : undefined,
          } : {}),
          "act-btns": t.showActuals && tot.wmaeMw != null ? `Wtd mean error ${int(tot.wmaeMw)} MW` : `DA cost ${gbp(tot.daCost)}`,
        }}
      />
    </div>
  );
}
