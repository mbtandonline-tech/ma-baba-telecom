import { describe, expect, it } from "vitest";
import { layoutSheet, mmToPx } from "@/lib/render";

describe("print layout", () => {
  it("fits 25 passport 1.5x1.9in photos on portrait A4, 28 when auto picks landscape", () => {
    expect(layoutSheet(210, 297, 38.1, 48.26, "portrait").perSheet).toBe(25);
    expect(layoutSheet(210, 297, 38.1, 48.26, "auto").perSheet).toBe(28);
  });
  it("converts mm to 300 DPI pixels", () => {
    expect(mmToPx(25.4)).toBe(300);
  });
});
