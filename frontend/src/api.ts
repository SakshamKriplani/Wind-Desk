import type { Accuracy, Decision, Meta, Series } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const url = `${BASE}${path}${qs.size ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => get<Meta>("/api/meta"),
  decision: (date: string, gate: string) => get<Decision>("/api/decision", { date, gate }),
  accuracy: (gate: string) => get<Accuracy>("/api/accuracy", { gate }),
  series: (start: string, end: string, horizon: number) =>
    get<Series>("/api/series", { start, end, horizon }),
};
