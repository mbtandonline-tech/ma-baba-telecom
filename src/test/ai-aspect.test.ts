import { describe, it, expect } from "vitest";
import { closestAspect, GEMINI_ASPECTS } from "../lib/ai-aspect";

describe("gemini aspect mapping", () => {
  it("maps the 40x50 print size to 4:5", () => {
    expect(closestAspect(800, 1000)).toBe("4:5");
    expect(closestAspect(40, 50)).toBe("4:5");
  });
  it("keeps square and landscape requests", () => {
    expect(closestAspect(1024, 1024)).toBe("1:1");
    expect(closestAspect(1920, 1080)).toBe("16:9");
    expect(closestAspect(2560, 1080)).toBe("21:9");
  });
  it("maps portrait passport crops to the nearest tall ratio", () => {
    expect(closestAspect(600, 800)).toBe("3:4");
    expect(closestAspect(1024, 1536)).toBe("2:3");
  });
  it("falls back to 1:1 for invalid sizes", () => {
    expect(closestAspect(0, 0)).toBe("1:1");
    expect(closestAspect(Number.NaN, 800)).toBe("1:1");
  });
  it("only returns ratios the image models accept", () => {
    for (const [w, h] of [
      [500, 500],
      [700, 1000],
      [1000, 700],
      [300, 1200],
      [1200, 300],
    ]) {
      expect(GEMINI_ASPECTS).toContain(closestAspect(w!, h!));
    }
  });
});
