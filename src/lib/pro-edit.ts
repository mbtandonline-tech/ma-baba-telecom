// Pure, testable image operations for the Pro Editor popup.
// Everything works on ImageData / canvases — no DOM beyond canvas creation.

export type Pt = { x: number; y: number };

/** Build a 256-entry LUT from Levels settings (GIMP-style). */
export function levelsLut(inBlack: number, gamma: number, inWhite: number, outBlack: number, outWhite: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const g = Math.max(0.1, Math.min(10, gamma || 1));
  const span = Math.max(1, inWhite - inBlack);
  for (let i = 0; i < 256; i++) {
    let v = (i - inBlack) / span;
    v = Math.pow(Math.max(0, Math.min(1, v)), 1 / g);
    lut[i] = outBlack + v * (outWhite - outBlack);
  }
  return lut;
}

/** Monotone cubic (Catmull-Rom-ish) curve through control points → 256 LUT. */
export function curveLut(points: Pt[]): Uint8ClampedArray {
  const pts = [...points].sort((a, b) => a.x - b.x);
  if (pts.length < 2) pts.splice(0, pts.length, { x: 0, y: 0 }, { x: 255, y: 255 });
  const lut = new Uint8ClampedArray(256);
  const n = pts.length;
  for (let x = 0; x < 256; x++) {
    let i = 0;
    while (i < n - 2 && x > pts[i + 1]!.x) i++;
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[Math.min(n - 1, i + 1)]!, p3 = pts[Math.min(n - 1, i + 2)]!;
    const span = Math.max(1e-6, p2.x - p1.x);
    const t = Math.max(0, Math.min(1, (x - p1.x) / span));
    const t2 = t * t, t3 = t2 * t;
    const y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
    lut[x] = Math.max(0, Math.min(255, Math.round(y)));
  }
  return lut;
}

/** Apply a per-channel LUT to image data (in place). */
export function applyLut(data: ImageData, lut: Uint8ClampedArray): void {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]!]!;
    d[i + 1] = lut[d[i + 1]!]!;
    d[i + 2] = lut[d[i + 2]!]!;
  }
}

/** Luminance histogram (256 bins). */
export function histogram(data: ImageData): Uint32Array {
  const h = new Uint32Array(256);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    h[Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!)]!++;
  }
  return h;
}

/** Auto levels: stretch histogram, clipping 0.5% at each end. */
export function autoLevels(data: ImageData): { inBlack: number; inWhite: number } {
  const h = histogram(data);
  const total = data.width * data.height;
  const clip = total * 0.005;
  let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && acc + h[lo]! < clip) { acc += h[lo]!; lo++; }
  acc = 0;
  while (hi > 0 && acc + h[hi]! < clip) { acc += h[hi]!; hi--; }
  return { inBlack: lo, inWhite: Math.max(hi, lo + 1) };
}

/** Dodge (lighten) / Burn (darken) soft brush stamp at (cx, cy). */
export function dodgeBurn(data: ImageData, cx: number, cy: number, radius: number, strength: number, softness: number, mode: "dodge" | "burn"): void {
  const { width: w, height: h } = data;
  const d = data.data;
  const r = Math.max(1, radius);
  const soft = Math.max(0.01, Math.min(1, softness / 100));
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  const amt = strength / 100;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x - cx, y - cy) / r;
      if (dist > 1) continue;
      // hardness: solid core then soft falloff
      const fall = dist <= 1 - soft ? 1 : 1 - (dist - (1 - soft)) / soft;
      const k = amt * fall * 0.35;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = d[i + c]!;
        d[i + c] = mode === "dodge" ? v + (255 - v) * k : v * (1 - k);
      }
    }
  }
}

/** Heal stamp: blend texture from source offset into target with soft edge. */
export function healStamp(data: ImageData, cx: number, cy: number, sx: number, sy: number, radius: number, strength: number, softness: number): void {
  const { width: w, height: h } = data;
  const d = data.data;
  const r = Math.max(1, radius);
  const soft = Math.max(0.01, Math.min(1, softness / 100));
  const amt = strength / 100;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x - cx, y - cy) / r;
      if (dist > 1) continue;
      const fall = dist <= 1 - soft ? 1 : 1 - (dist - (1 - soft)) / soft;
      const k = amt * fall;
      const gx = Math.round(x - cx + sx), gy = Math.round(y - cy + sy);
      if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
      const i = (y * w + x) * 4, j = (gy * w + gx) * 4;
      for (let c = 0; c < 3; c++) d[i + c] = d[i + c]! * (1 - k) + d[j + c]! * k;
    }
  }
}

/** Eraser stamp: fade toward the snapshot (original) pixels with soft edge. */
export function eraseStamp(data: ImageData, orig: ImageData, cx: number, cy: number, radius: number, strength: number, softness: number): void {
  const { width: w, height: h } = data;
  const d = data.data, o = orig.data;
  const r = Math.max(1, radius);
  const soft = Math.max(0.01, Math.min(1, softness / 100));
  const amt = strength / 100;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x - cx, y - cy) / r;
      if (dist > 1) continue;
      const fall = dist <= 1 - soft ? 1 : 1 - (dist - (1 - soft)) / soft;
      const k = amt * fall;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) d[i + c] = d[i + c]! * (1 - k) + o[i + c]! * k;
    }
  }
}

/** Brush stamp: paint a colour with soft edge. */
export function brushStamp(data: ImageData, cx: number, cy: number, radius: number, strength: number, softness: number, color: [number, number, number]): void {
  const { width: w, height: h } = data;
  const d = data.data;
  const r = Math.max(1, radius);
  const soft = Math.max(0.01, Math.min(1, softness / 100));
  const amt = strength / 100;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x - cx, y - cy) / r;
      if (dist > 1) continue;
      const fall = dist <= 1 - soft ? 1 : 1 - (dist - (1 - soft)) / soft;
      const k = amt * fall;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) d[i + c] = d[i + c]! * (1 - k) + color[c]! * k;
    }
  }
}

/** Solve homography mapping unit square corners (0,0)(1,0)(1,1)(0,1) → 4 quad points. */
export function homography(quad: [Pt, Pt, Pt, Pt]): number[] {
  // maps (u,v) in [0,1]² to quad; returns 8 coeffs [a,b,c,d,e,f,g,h]
  const [p0, p1, p2, p3] = quad;
  const px = p0.x - p1.x + p2.x - p3.x, py = p0.y - p1.y + p2.y - p3.y;
  let g = 0, h = 0;
  if (Math.abs(px) > 1e-9 || Math.abs(py) > 1e-9) {
    const A = p1.x - p2.x, B = p3.x - p2.x;
    const C = p1.y - p2.y, D = p3.y - p2.y;
    const den = A * D - B * C;
    g = (px * D - B * py) / den;
    h = (A * py - px * C) / den;
  }
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const c = p0.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  const f = p0.y;
  return [a, b, c, d, e, f, g, h];
}

/** Perspective-warp the quad region of src into an outW×outH rectangle (bilinear). */
export function perspectiveWarp(src: ImageData, quad: [Pt, Pt, Pt, Pt], outW: number, outH: number): ImageData {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = homography(quad);
  const out = new ImageData(outW, outH);
  const sd = src.data, od = out.data;
  const W = src.width, H = src.height;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const u = (x + 0.5) / outW, v = (y + 0.5) / outH;
      const den = g * u + h * v + 1;
      let sx = (a * u + b * v + c) / den;
      let sy = (d * u + e * v + f) / den;
      sx = Math.max(0, Math.min(W - 1.001, sx));
      sy = Math.max(0, Math.min(H - 1.001, sy));
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const fx = sx - x0, fy = sy - y0;
      const oi = (y * outW + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const p00 = sd[(y0 * W + x0) * 4 + ch]!, p10 = sd[(y0 * W + x0 + 1) * 4 + ch]!;
        const p01 = sd[((y0 + 1) * W + x0) * 4 + ch]!, p11 = sd[((y0 + 1) * W + x0 + 1) * 4 + ch]!;
        od[oi + ch] = p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
      }
      od[oi + 3] = 255;
    }
  }
  return out;
}

/** Crop a rectangle from image data. */
export function cropRect(src: ImageData, x: number, y: number, w: number, h: number): ImageData {
  const out = new ImageData(w, h);
  const sd = src.data, od = out.data;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const sx = Math.min(src.width - 1, Math.max(0, x + xx));
      const sy = Math.min(src.height - 1, Math.max(0, y + yy));
      const si = (sy * src.width + sx) * 4, di = (yy * w + xx) * 4;
      od[di] = sd[si]!; od[di + 1] = sd[si + 1]!; od[di + 2] = sd[si + 2]!; od[di + 3] = 255;
    }
  }
  return out;
}

/** Photo crop presets: width × height in inches at a resolution. */
export const CROP_PRESETS = [
  { id: "passport", label: "Passport 1.5 × 1.9 in", wIn: 1.5, hIn: 1.9 },
  { id: "stamp", label: "Stamp 1.0 × 1.2 in", wIn: 1.0, hIn: 1.2 },
  { id: "visa", label: "Visa 2 × 2 in", wIn: 2, hIn: 2 },
  { id: "free", label: "Free", wIn: 0, hIn: 0 },
] as const;

export const inToPx = (inch: number, dpi: number) => Math.round(inch * dpi);
