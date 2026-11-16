import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import tool from "../components/print-preview/print-tool.html?raw";

function arrange(second: Record<string, unknown> = {}, align = "l") {
  const imgs = [
    { w: 35, h: 45, copies: 2, gx: 3, gy: 0, cols: 0, nl: false },
    { w: 20, h: 25, copies: 3, gx: 8, gy: 0, cols: 0, nl: false, ...second },
  ];
  const code = tool.slice(tool.indexOf("function plan(g)"), tool.indexOf("function eff(m,g)"));
  return runInNewContext(`${code}; layout({uw:160,uh:250,ex:0})`, {
    S: { imgs, gb: 0, ha: align, va: "t" }, MM: () => 0,
  }) as { pages: Array<Array<{ i: number; x: number; y: number; w: number }>>; counts: number[] };
}

describe("Mixed passport and stamp print rows", () => {
  it("places two passport and three stamp copies on one row with independent gaps", () => {
    const result = arrange();
    expect(result.pages[0]?.map(p => p.x)).toEqual([0, 38, 81, 109, 137]);
    expect(result.pages[0]?.map(p => p.y)).toEqual([0, 0, 0, 0, 0]);
    expect(result.counts).toEqual([2, 3]);
  });
  it("fills only the remaining row space after two passport copies", () => {
    const result = arrange({ auto: true, lines: 1 });
    expect(result.counts).toEqual([2, 3]);
    expect(result.pages[0]).toHaveLength(5);
  });
  it("preserves explicitly chosen individual spacing in justified alignment", () => {
    expect(arrange({}, "j").pages[0]?.map(p => p.x)).toEqual([0, 38, 81, 109, 137]);
  });
  it("wraps copies that cannot fit without overlapping", () => {
    const result = arrange({ copies: 4 });
    expect(result.pages[0]?.[5]?.y).toBe(45);
    expect(result.pages[0]?.[5]?.x).toBe(0);
  });
});