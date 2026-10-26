import { describe, expect, it } from "vitest";
import { addDays, biasPhrase, gwh, mw, signed, time, toCsv } from "./format";

describe("format", () => {
  it("formats power and energy", () => {
    expect(mw(12345.6)).toBe("12,346 MW");
    expect(mw(null)).toBe("–");
    expect(gwh(9800)).toBe("9.8 GWh");
  });
  it("shows UK local time", () => {
    expect(time("2026-01-15T09:50:00Z")).toBe("09:50"); // GMT in winter
    expect(time("2026-07-15T09:50:00Z")).toBe("10:50"); // BST in summer
  });
  it("signs values", () => {
    expect(signed(-1200, "MWh")).toBe("−1,200 MWh");
    expect(signed(300, "MW")).toBe("+300 MW");
  });
  it("steps calendar days across month ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });
  it("describes bias in plain words", () => {
    expect(biasPhrase(400)).toMatch(/Over-forecast/);
    expect(biasPhrase(-400)).toMatch(/Under-forecast/);
    expect(biasPhrase(10)).toBe("No meaningful bias");
  });
  it("builds CSV with escaping", () => {
    expect(toCsv([{ a: 1, b: "x,y" }])).toBe('a,b\n1,"x,y"');
  });
});

import { countdown, gbp, int, nextUkTime } from "./format";
describe("terminal formats", () => {
  it("formats money and counts", () => {
    expect(gbp(-2450.4)).toBe("−£2,450");
    expect(int(14210)).toBe("14,210");
    expect(countdown(4 * 60e3 + 12e3)).toBe("00:04:12");
  });
  it("finds the next UK gate time", () => {
    const now = Date.parse("2026-01-15T08:00:00Z"); // GMT
    expect(nextUkTime("09:50", now)).toBe(Date.parse("2026-01-15T09:50:00Z"));
    const summer = Date.parse("2026-07-15T10:00:00Z"); // 11:00 BST, gate passed
    expect(nextUkTime("09:50", summer)).toBe(Date.parse("2026-07-16T08:50:00Z"));
  });
});
