import { toBasis, type Basis, type Params, type Row } from "../calc";
import { Num } from "../components/tally/Num";
import { useTerminal } from "../context/TerminalStateContext";
import { gbp, int } from "../format";

export const basisUnit = (b: Basis) => (b === "MWh" ? "MWh" : b === "CF%" ? "CF %" : "£");

/** A MW figure shown in the current basis (MWh, capacity factor or £), flashing on change. */
export function BasisCell({ mw, r }: { mw: number; r: Row }) {
  const { basis, applied } = useTerminal();
  const v = toBasis(mw, r.hours, basis, applied);
  const fmt = basis === "£" ? gbp : basis === "CF%" ? (x: number | null | undefined) => `${int(x, 1)}%` : (x: number | null | undefined) => int(x);
  return <Num value={v} format={fmt} />;
}

/** Red when the period's expected shortfall cost outweighs its expected spill cost. */
export function shortClass(r: Row, p: Params): string {
  return r.expShortMw * p.penalty > r.expLongMw * p.longRate ? "t-neg" : "t-pos";
}
