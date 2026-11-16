/** Pure face/region analysis: landmark polygons + optional AI segmentation classes. */
export type SkinPoint = { x: number; y: number };
export type SkinFace = SkinPoint[];
export const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
export const FEATURES = [
  [33,160,158,133,153,144], [362,385,387,263,373,380],
  [61,40,37,0,267,270,291,321,314,17,84,91],
  [70,63,105,66,107,55,65,52,53,46], [336,296,334,293,300,276,283,282,295,285],
];
export const REGION = { eyes: 1, brows: 2, lips: 4, hair: 8, beard: 16, glasses: 32, headwear: 64, clothes: 128 } as const;
export type RegionKey = keyof typeof REGION;
export const FEATURE_BITS = REGION.eyes | REGION.brows | REGION.lips;
export const ALL_REGIONS = 255;
/** Multiclass selfie segmentation: 0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 accessories. */
export type Segmentation = { classes: Uint8Array; skin: Float32Array; w: number; h: number };
export type RegionSummary = {
  faces: number; segmented: boolean; eyes: boolean; brows: boolean; lips: boolean;
  hair: boolean; beard: boolean; glasses: boolean; headwear: 'cap' | 'hijab' | null; clothes: boolean;
};
export type FaceRegions = { bits: Uint8Array; face: Uint8Array; skin: Float32Array | null; summary: RegionSummary };

export function insidePoly(x: number, y: number, poly: SkinPoint[]): boolean {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a && b && (a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) yes = !yes;
  }
  return yes;
}
export function polygon(face: SkinFace, ids: number[], padding = 1): SkinPoint[] {
  const p = ids.flatMap(id => face[id] ? [face[id]] : []);
  if (!p.length) return [];
  const cx = p.reduce((s, v) => s + v.x, 0) / p.length, cy = p.reduce((s, v) => s + v.y, 0) / p.length;
  return p.map(v => ({ x: cx + (v.x - cx) * padding, y: cy + (v.y - cy) * padding }));
}
function fill(target: Uint8Array, w: number, h: number, poly: SkinPoint[], value: number): number {
  if (poly.length < 3) return 0;
  const xs = poly.map(p => p.x * w), ys = poly.map(p => p.y * h);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(w - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (insidePoly(x / w, y / h, poly)) { target[y * w + x] = (target[y * w + x] ?? 0) | value; n++; }
  return n;
}
const lumAt = (d: Uint8ClampedArray, p: number) => .2126 * (d[p * 4] ?? 0) + .7152 * (d[p * 4 + 1] ?? 0) + .0722 * (d[p * 4 + 2] ?? 0);

type Geometry = { left: number; right: number; top: number; chin: number; nose: number; browY: number; eyeY: number; fw: number; fh: number; bridge: [number, number] };
function geometry(f: SkinFace, w: number, h: number): Geometry | null {
  const oval = polygon(f, FACE_OVAL);
  if (oval.length < 3) return null;
  const xs = oval.map(p => p.x * w), ys = oval.map(p => p.y * h);
  const y = (id: number) => f[id] ? (f[id]?.y ?? 0) * h : undefined, x = (id: number) => f[id] ? (f[id]?.x ?? 0) * w : undefined;
  const left = Math.min(...xs), right = Math.max(...xs), top = y(10) ?? Math.min(...ys), chin = y(152) ?? Math.max(...ys);
  const brows = [...polygon(f, FEATURES[3] ?? []), ...polygon(f, FEATURES[4] ?? [])].map(p => p.y * h);
  const browY = brows.length ? Math.min(...brows) : top + (chin - top) * .3;
  const eyeY = ((y(159) ?? browY) + (y(386) ?? browY)) / 2;
  const geo = { left, right, top, chin, nose: y(2) ?? top + (chin - top) * .62, browY, eyeY, fw: right - left, fh: chin - top,
    bridge: [Math.min(x(133) ?? 0, x(362) ?? 0), Math.max(x(133) ?? 0, x(362) ?? 0)] as [number, number] };
  return geo.fw > 2 && geo.fh > 2 ? geo : null;
}

/**
 * Builds protection regions: eyes/brows/lips from landmarks; hair, beard, glasses,
 * cap/hijab and clothes from AI segmentation classes plus landmark geometry.
 */
export function buildRegions(data: Uint8ClampedArray, w: number, h: number, faces: SkinFace[], seg?: Segmentation | null): FaceRegions {
  const bits = new Uint8Array(w * h), face = new Uint8Array(w * h), wide = new Uint8Array(w * h);
  let eyes = 0, brows = 0, lips = 0;
  for (const f of faces) {
    fill(face, w, h, polygon(f, FACE_OVAL), 1); fill(wide, w, h, polygon(f, FACE_OVAL, 1.15), 1);
    eyes += fill(bits, w, h, polygon(f, FEATURES[0] ?? [], 1.45), REGION.eyes) + fill(bits, w, h, polygon(f, FEATURES[1] ?? [], 1.45), REGION.eyes);
    lips += fill(bits, w, h, polygon(f, FEATURES[2] ?? [], 1.45), REGION.lips);
    brows += fill(bits, w, h, polygon(f, FEATURES[3] ?? [], 1.45), REGION.brows) + fill(bits, w, h, polygon(f, FEATURES[4] ?? [], 1.45), REGION.brows);
  }
  const geo = faces.map(f => geometry(f, w, h)).filter((g): g is Geometry => !!g);
  let lumSum = 0, lumCount = 0;
  for (let p = 0; p < w * h; p += 2) if (face[p] && !((bits[p] ?? 0) & FEATURE_BITS)) { lumSum += lumAt(data, p); lumCount++; }
  const skinLum = lumCount ? lumSum / lumCount : 150;
  let cls: Uint8Array | null = null, skin: Float32Array | null = null;
  if (seg && seg.w > 0 && seg.h > 0) {
    cls = new Uint8Array(w * h); skin = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { const row = Math.min(seg.h - 1, Math.floor(y * seg.h / h)) * seg.w;
      for (let x = 0; x < w; x++) { const q = row + Math.min(seg.w - 1, Math.floor(x * seg.w / w)); cls[y * w + x] = seg.classes[q] ?? 0; skin[y * w + x] = seg.skin[q] ?? 0; } }
  }
  const head = new Uint8Array(w * h), glassCand = new Uint8Array(w * h);
  const bandHits = geo.map(() => 0), bandSeg = geo.map(() => 0), bridgeCols = geo.map(() => new Set<number>()), chinHair = geo.map(() => 0), chinArea = geo.map(() => 0);
  let hair = 0, beard = 0, clothes = 0, capPixels = 0, sidePixels = 0;
  const headLimit = geo.length ? Math.max(...geo.map(g => g.chin + .3 * g.fh)) : h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, c = cls ? (cls[p] ?? 0) : 255, l = lumAt(data, p), feature = (bits[p] ?? 0) & FEATURE_BITS;
    let inBeard = false, band = -1, inHead = false, above = false, side = false, bridge = -1, chinZone = -1;
    for (let i = 0; i < geo.length; i++) { const g = geo[i]; if (!g) continue;
      if ((wide[p] || (x >= g.left && x <= g.right && y > g.chin)) && y >= g.nose && y <= g.chin + .35 * g.fh) inBeard = true;
      if (x >= g.left + .3 * g.fw && x <= g.right - .3 * g.fw && y >= g.chin - .12 * g.fh && y <= g.chin + .02 * g.fh) chinZone = i;
      if (x >= g.bridge[0] + .02 * g.fw && x <= g.bridge[1] - .02 * g.fw && y >= g.eyeY - .07 * g.fh && y <= g.eyeY + .05 * g.fh) bridge = i;
      if (x >= g.left + .03 * g.fw && x <= g.right - .03 * g.fw && y >= g.browY - .02 * g.fh && y <= g.eyeY + .17 * g.fh) band = i;
      if (x >= g.left - .7 * g.fw && x <= g.right + .7 * g.fw && y >= g.top - .9 * g.fh) {
        inHead = true; if (y < g.browY) above = true;
        if ((x < g.left || x > g.right) && y > g.eyeY && y < g.chin) side = true;
      }
    }
    if (chinZone >= 0 && !feature && c !== 4 && c !== 5 && (face[p] || c === 1)) { chinArea[chinZone] = (chinArea[chinZone] ?? 0) + 1; if (c === 1 || l < skinLum * .5) chinHair[chinZone] = (chinHair[chinZone] ?? 0) + 1; }
    if (c === 1) { if (inBeard && !feature) { bits[p] = (bits[p] ?? 0) | REGION.beard; beard++; } else if (!feature) { bits[p] = (bits[p] ?? 0) | REGION.hair; hair++; } continue; }
    // Dark facial hair the segmenter labels as face skin.
    if (inBeard && !feature && face[p] && (c === 255 || c === 3 || c === 2) && l < skinLum * .5) { bits[p] = (bits[p] ?? 0) | REGION.beard; beard++; continue; }
    if (c === 5 && band >= 0) { glassCand[p] = 1; bandSeg[band] = (bandSeg[band] ?? 0) + 1; continue; }
    if (c === 4 || c === 5) {
      if (inHead) { head[p] = above ? 2 : y <= headLimit ? 1 : 3; if (above) capPixels++; if (side) sidePixels++; }
      else { bits[p] = (bits[p] ?? 0) | REGION.clothes; clothes++; }
      continue;
    }
    if (band >= 0 && !feature && l < skinLum * .58 && x > 0 && y > 0 && x < w - 1 && y < h - 1) {
      const grad = Math.max(Math.abs(l - lumAt(data, p - 1)), Math.abs(l - lumAt(data, p + 1)), Math.abs(l - lumAt(data, p - w)), Math.abs(l - lumAt(data, p + w)));
      if (grad > 22) { glassCand[p] = 1; bandHits[band] = (bandHits[band] ?? 0) + 1; if (bridge === band) bridgeCols[band]?.add(x); }
    }
  }
  // A beard covers the chin; hair falling over the cheeks is only hair.
  const bearded = geo.some((_, i) => (chinHair[i] ?? 0) > (chinArea[i] ?? 0) * .25 && (chinArea[i] ?? 0) > 0);
  if (!bearded) for (let p = 0; p < w * h; p++) if ((bits[p] ?? 0) & REGION.beard) { bits[p] = ((bits[p] ?? 0) & ~REGION.beard) | (cls?.[p] === 1 ? REGION.hair : 0); }
  // Glasses: thin dark frame edges or segmented accessories across the eye band.
  let glasses = false;
  geo.forEach((g, i) => { const area = g.fw * .94 * (g.eyeY + .19 * g.fh - g.browY);
    // A frame crosses the nose bridge; eyeliner, lashes and brows do not.
    const bridgeW = Math.max(1, g.bridge[1] - g.bridge[0] - .04 * g.fw);
    if (((bandHits[i] ?? 0) > area * .012 && (bridgeCols[i]?.size ?? 0) > bridgeW * .6) || (bandSeg[i] ?? 0) > area * .01) glasses = true; });
  let glassPixels = 0;
  if (glasses) { const r = Math.max(1, Math.round(Math.min(w, h) / 500));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!glassCand[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
        const q = yy * w + xx; if (!((bits[q] ?? 0) & REGION.eyes)) { bits[q] = (bits[q] ?? 0) | REGION.glasses; glassPixels++; } } } }
  const faceArea = geo.reduce((s, g) => s + g.fw * g.fh, 0) || 1;
  const headwear: RegionSummary['headwear'] = sidePixels > faceArea * .05 ? 'hijab' : capPixels > faceArea * .025 ? 'cap' : null;
  let headPixels = 0;
  for (let p = 0; p < w * h; p++) { const v = head[p] ?? 0; if (!v) continue;
    if ((headwear === 'hijab') || (headwear === 'cap' && v === 2)) { bits[p] = (bits[p] ?? 0) | REGION.headwear; headPixels++; }
    else { bits[p] = (bits[p] ?? 0) | REGION.clothes; clothes++; } }
  const tiny = Math.max(8, w * h * .0005);
  return { bits, face, skin, summary: {
    faces: faces.length, segmented: !!cls, eyes: eyes > 0, brows: brows > 0, lips: lips > 0,
    hair: hair > tiny, beard: bearded && beard > faceArea * .03, glasses: glasses && glassPixels > 0,
    headwear: headPixels > tiny ? headwear : null, clothes: clothes > tiny,
  } };
}
