import { describe, expect, it } from "vitest";

// Node test env has no ImageData — minimal stand-in.
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as Record<string, unknown>)["ImageData"] = class {
    data: Uint8ClampedArray;
    constructor(public width: number, public height: number) {
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  };
}
import {
  applyLut, autoLevels, brushStamp, cropRect, curveLut, dodgeBurn, eraseStamp, healStamp,
  histogram, homography, inToPx, levelsLut, perspectiveWarp,
} from "../lib/pro-edit";

function makeData(w: number, h: number, fill: (x: number, y: number) => [number, number, number]): ImageData {
  const d = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = fill(x, y);
      d.data[i] = r; d.data[i + 1] = g; d.data[i + 2] = b; d.data[i + 3] = 255;
    }
  }
  return d;
}

describe("levelsLut", () => {
  it("identity when defaults", () => {
    const lut = levelsLut(0, 1, 255, 0, 255);
    expect(lut[0]).toBe(0);
    expect(lut[128]).toBe(128);
    expect(lut[255]).toBe(255);
  });
  it("clips below input black and above input white", () => {
    const lut = levelsLut(50, 1, 200, 0, 255);
    expect(lut[10]).toBe(0);
    expect(lut[250]).toBe(255);
    expect(lut[125]!).toBeGreaterThan(100);
    expect(lut[125]!).toBeLessThan(155);
  });
  it("gamma > 1 brightens midtones (GIMP semantics)", () => {
    const lut = levelsLut(0, 2, 255, 0, 255);
    expect(lut[128]!).toBeGreaterThan(128);
  });
});

describe("curveLut", () => {
  it("is identity for two corner points", () => {
    const lut = curveLut([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
    expect(Math.abs(lut[128]! - 128)).toBeLessThanOrEqual(2);
  });
  it("passes through a middle control point", () => {
    const lut = curveLut([{ x: 0, y: 0 }, { x: 128, y: 180 }, { x: 255, y: 255 }]);
    expect(Math.abs(lut[128]! - 180)).toBeLessThanOrEqual(3);
  });
  it("stays within 0..255", () => {
    const lut = curveLut([{ x: 0, y: 200 }, { x: 60, y: 10 }, { x: 255, y: 255 }]);
    for (let i = 0; i < 256; i++) {
      expect(lut[i]!).toBeGreaterThanOrEqual(0);
      expect(lut[i]!).toBeLessThanOrEqual(255);
    }
  });
});

describe("histogram / autoLevels", () => {
  it("counts luminance into 256 bins", () => {
    const d = makeData(4, 4, () => [128, 128, 128]);
    const h = histogram(d);
    expect(h[128]).toBe(16);
    expect(h.reduce((a, b) => a + b, 0)).toBe(16);
  });
  it("auto levels finds the used range", () => {
    const d = makeData(20, 20, (x) => [100 + x, 100 + x, 100 + x]);
    const { inBlack, inWhite } = autoLevels(d);
    expect(inBlack).toBeGreaterThanOrEqual(100);
    expect(inWhite).toBeLessThanOrEqual(119);
    expect(inWhite).toBeGreaterThan(inBlack);
  });
});

describe("brush tools", () => {
  it("dodge lightens and burn darkens inside the radius", () => {
    const d1 = makeData(40, 40, () => [100, 100, 100]);
    dodgeBurn(d1, 20, 20, 10, 100, 50, "dodge");
    expect(d1.data[(20 * 40 + 20) * 4]!).toBeGreaterThan(100);
    expect(d1.data[(0 * 40 + 0) * 4]!).toBe(100); // corner untouched
    const d2 = makeData(40, 40, () => [100, 100, 100]);
    dodgeBurn(d2, 20, 20, 10, 100, 50, "burn");
    expect(d2.data[(20 * 40 + 20) * 4]!).toBeLessThan(100);
  });
  it("heal copies from the source offset", () => {
    const d = makeData(40, 40, (x) => (x < 20 ? [255, 0, 0] : [0, 0, 255]));
    healStamp(d, 30, 20, 10, 20, 6, 100, 100);
    expect(d.data[(20 * 40 + 30) * 4]!).toBeGreaterThan(200); // red copied in
  });
  it("eraser fades back toward the original", () => {
    const orig = makeData(40, 40, () => [200, 200, 200]);
    const d = makeData(40, 40, () => [50, 50, 50]);
    eraseStamp(d, orig, 20, 20, 8, 100, 100);
    expect(d.data[(20 * 40 + 20) * 4]!).toBe(200);
  });
  it("brush paints the chosen colour", () => {
    const d = makeData(40, 40, () => [0, 0, 0]);
    brushStamp(d, 20, 20, 8, 100, 100, [10, 20, 30]);
    const i = (20 * 40 + 20) * 4;
    expect([d.data[i], d.data[i + 1], d.data[i + 2]]).toEqual([10, 20, 30]);
  });
});

describe("homography / perspectiveWarp", () => {
  it("identity quad reproduces the image", () => {
    const src = makeData(20, 10, (x, y) => [x * 10, y * 20, 60]);
    const out = perspectiveWarp(src, [{ x: 0, y: 0 }, { x: 19, y: 0 }, { x: 19, y: 9 }, { x: 0, y: 9 }], 20, 10);
    expect(out.width).toBe(20);
    expect(out.height).toBe(10);
    const si = (5 * 20 + 10) * 4;
    expect(Math.abs(out.data[si]! - src.data[si]!)).toBeLessThanOrEqual(12);
  });
  it("maps a shifted quad back to a rectangle", () => {
    // white square at (5..14, 5..14); quad picks that tilted region
    const src = makeData(30, 30, (x, y) => (x >= 5 && x < 15 && y >= 5 && y < 15 ? [255, 255, 255] : [0, 0, 0]));
    const out = perspectiveWarp(src, [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }], 10, 10);
    expect(out.data[(5 * 10 + 5) * 4]!).toBeGreaterThan(200);
  });
  it("homography maps unit corners to the quad points", () => {
    const quad: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] =
      [{ x: 10, y: 20 }, { x: 110, y: 25 }, { x: 105, y: 220 }, { x: 5, y: 210 }];
    const [a, b, c, d, e, f, g, h] = homography(quad);
    const map = (u: number, v: number) => ({
      x: (a! * u + b! * v + c!) / (g! * u + h! * v + 1),
      y: (d! * u + e! * v + f!) / (g! * u + h! * v + 1),
    });
    for (const [i, [u, v]] of [[0, 0], [1, 0], [1, 1], [0, 1]].entries()) {
      const p = map(u!, v!);
      expect(Math.abs(p.x - quad[i]!.x)).toBeLessThan(0.5);
      expect(Math.abs(p.y - quad[i]!.y)).toBeLessThan(0.5);
    }
  });
});

describe("cropRect / inToPx", () => {
  it("crops the requested rectangle", () => {
    const src = makeData(10, 10, (x, y) => [x * 20, y * 20, 0]);
    const out = cropRect(src, 2, 3, 4, 5);
    expect(out.width).toBe(4);
    expect(out.height).toBe(5);
    expect(out.data[0]).toBe(40); // x=2 → 40
    expect(out.data[1]).toBe(60); // y=3 → 60
  });
  it("passport 1.5×1.9in at 300dpi is 450×570 px", () => {
    expect(inToPx(1.5, 300)).toBe(450);
    expect(inToPx(1.9, 300)).toBe(570);
  });
});

describe("applyLut", () => {
  it("remaps channels, keeps alpha", () => {
    const d = makeData(2, 1, () => [10, 20, 30]);
    const lut = new Uint8ClampedArray(256).map((_, i) => 255 - i);
    applyLut(d, lut);
    expect([d.data[0], d.data[1], d.data[2], d.data[3]]).toEqual([245, 235, 225, 255]);
  });
});
