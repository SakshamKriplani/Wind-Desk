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

/** Whole number with thousands separators, or a dash. */
export function int(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return "–";
  return v.toLocaleString("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Pounds sterling; negative values get a leading minus. */
export function gbp(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "–";
  const s = Math.abs(Math.round(v)).toLocaleString("en-GB");
  return `${v < 0 ? "−" : ""}£${s}`;
}

/** "hh:mm:ss" countdown from milliseconds. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Next occurrence of a UK wall-clock time ("09:50") after `now`, as epoch ms. */
export function nextUkTime(hhmm: string, now: number): number {
  const [h, m] = hhmm.split(":").map(Number);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const ukNowAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  const offset = ukNowAsUtc - Math.floor(now / 1000) * 1000; // UK offset from UTC
  let target = Date.UTC(get("year"), get("month") - 1, get("day"), h, m) - offset;
  if (target <= now) target += 24 * 3600e3;
  return target;
}
