import { describe, expect, it } from "vitest";
import { atLeast, checkLookahead, progressOf, remainingSchedule, stepMessage } from "./pipeline";

describe("pipeline", () => {
  it("orders phases", () => {
    expect(atLeast("drawing_charts", "computing_metrics")).toBe(true);
    expect(atLeast("initializing", "drawing_charts")).toBe(false);
    expect(atLeast("empty", "initializing")).toBe(false);
    expect(progressOf("ready")).toBe(100);
  });
  it("schedules the remaining phases after a fast fetch", () => {
    const s = remainingSchedule(1350, 50);
    expect(s.map((x) => x.status)).toEqual(["computing_metrics", "drawing_charts", "populating_table", "ready"]);
    expect(s.map((x) => x.delay)).toEqual([200, 500, 900, 1300]);
  });
  it("lets a slow fetch eat into the staging but keeps steps readable", () => {
    const s = remainingSchedule(1350, 2000);
    expect(s[0].delay).toBe(60);
    expect(s[3].delay).toBe(240);
  });
  it("goes straight to ready in instant mode", () => {
    expect(remainingSchedule(0, 0)).toEqual([{ status: "ready", delay: 0 }]);
  });
  it("describes steps with real context", () => {
    const m = stepMessage("computing_metrics", { day: "2026-01-14", gate: "09:50", lookbackDays: 14, leadH: 14.5, rows: 48 });
    expect(m).toContain("14-day rolling bias at 15 h lead");
  });
  it("checks lookahead", () => {
    const pts = [{ publish_time: "2026-01-14T09:30:00Z" }, { publish_time: null }];
    expect(checkLookahead(pts, "2026-01-14T09:50:00Z")).toEqual({ checked: 1, ok: true });
    expect(checkLookahead([{ publish_time: "2026-01-14T10:30:00Z" }], "2026-01-14T09:50:00Z").ok).toBe(false);
  });
});
