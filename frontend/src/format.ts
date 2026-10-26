// Display helpers. All times are shown in UK local time.
const TZ = "Europe/London";

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts });
const hm = fmt({ hour: "2-digit", minute: "2-digit", hour12: false });
const dayLong = fmt({ weekday: "long", day: "numeric", month: "long" });
const dayShort = fmt({ weekday: "short", day: "numeric", month: "short" });
const dayNum = fmt({ day: "numeric", month: "short" });

const toDate = (v: string | number | Date) => (v instanceof Date ? v : new Date(v));

export const time = (v: string | number) => hm.format(toDate(v));
export const longDay = (v: string | number) => dayLong.format(toDate(v));
export const shortDay = (v: string | number) => dayShort.format(toDate(v));
export const dayMonth = (v: string | number) => dayNum.format(toDate(v));
export const dayTime = (v: string | number) => `${shortDay(v)}, ${time(v)}`;

/** A calendar date string (YYYY-MM-DD) as noon UTC so it never shifts across midnight. */
export const calendar = (d: string) => new Date(`${d}T12:00:00Z`);

export function mw(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return "–";
  return `${v.toLocaleString("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits })} MW`;
}

export function gwh(mwh: number | null | undefined, digits = 1): string {
  if (mwh == null || Number.isNaN(mwh)) return "–";
  return `${(mwh / 1000).toLocaleString("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits })} GWh`;
}

export function pct(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return "–";
  return `${v.toFixed(digits)}%`;
}

export function signed(v: number | null | undefined, unit: string, digits = 0): string {
  if (v == null || Number.isNaN(v)) return "–";
  const s = Math.abs(v).toLocaleString("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${s} ${unit}`;
}

export function hours(h: number | null | undefined): string {
  if (h == null) return "–";
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toFixed(h < 10 ? 1 : 0)} h`;
}

export function addDays(iso: string, n: number): string {
  const d = calendar(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Plain-language description of a mean error (forecast minus actual). */
export function biasPhrase(bias: number | null | undefined): string {
  if (bias == null) return "–";
  if (Math.abs(bias) < 50) return "No meaningful bias";
  return bias > 0 ? `Over-forecast by ${mw(bias)} on average` : `Under-forecast by ${mw(-bias)} on average`;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
