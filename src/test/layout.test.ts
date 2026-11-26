import { describe, expect, it } from "vitest";
import { layoutSheet, mmToPx, sheetPlacements } from "@/lib/render";

describe("print layout", () => {
  it("fits 25 passport 1.5x1.9in photos on portrait A4, 28 when auto picks landscape", () => {
    expect(layoutSheet(210, 297, 38.1, 48.26, "portrait").perSheet).toBe(25);
    expect(layoutSheet(210, 297, 38.1, 48.26, "auto").perSheet).toBe(28);
  });
  it("converts mm to 300 DPI pixels", () => {
    expect(mmToPx(25.4)).toBe(300);
  });
});

describe("centered sheet placements (Epson L8050)", () => {
  const pageW = mmToPx(210), pageH = mmToPx(297);
  const w = mmToPx(40), h = mmToPx(50), gap = mmToPx(2), margin = mmToPx(5);

  it("puts 8 copies in 2 columns x 4 rows, symmetric on A4", () => {
    const spots = sheetPlacements(8, 2, 4, w, h, gap, pageW, pageH, margin, true);
    expect(spots).toHaveLength(8);
    expect(spots.map((s) => s.x)).toEqual([756, 1252, 756, 1252, 756, 1252, 756, 1252]);
    expect(spots.map((s) => s.y)).toEqual([536, 536, 1151, 1151, 1766, 1766, 2381, 2381]);
    const left = Math.min(...spots.map((s) => s.x));
    const right = pageW - Math.max(...spots.map((s) => s.x + s.w));
    const top = Math.min(...spots.map((s) => s.y));
    const bottom = pageH - Math.max(...spots.map((s) => s.y + s.h));
    expect(left).toBe(right);
    expect(top).toBe(bottom);
    expect(left).toBeGreaterThanOrEqual(margin);
  });

  it("stacks 4 copies in one centered column", () => {
    const spots = sheetPlacements(4, 1, 4, w, h, gap, pageW, pageH, margin, true);
    expect(spots).toHaveLength(4);
    expect(new Set(spots.map((s) => s.x)).size).toBe(1);
    expect(spots[0].x).toBe(Math.round((pageW - w) / 2));
  });

  it("never places more than the grid can hold and keeps top-left when not centered", () => {
    const spots = sheetPlacements(20, 2, 4, w, h, gap, pageW, pageH, margin, false);
    expect(spots).toHaveLength(8);
    expect(spots[0]).toMatchObject({ x: margin, y: margin, w, h });
  });

  it("reports how many copies fit in one vertical column on the tall side", () => {
    // Stamp 20x25: ten stack under each other on portrait A4.
    expect(layoutSheet(210, 297, 20, 25, "portrait").rows).toBe(10);
    // Passport 40x50: only five fit, so 8 copies need a second column.
    expect(layoutSheet(210, 297, 40, 50, "portrait").rows).toBe(5);
  });
});
