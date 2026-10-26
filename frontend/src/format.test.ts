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
