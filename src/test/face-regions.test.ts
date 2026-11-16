import { describe, expect, it } from 'vitest';
import { buildRegions, REGION, type SkinFace } from '../lib/face-regions';
import { DEFAULT_SKIN, maskFromRegions, parseSkinPreset } from '../lib/skin-retouch';

const W = 40, H = 40;
const skinPixels = () => { const d = new Uint8ClampedArray(W * H * 4); for (let p = 0; p < W * H; p++) d.set([200, 150, 120, 255], p * 4); return d; };
// Synthetic segmentation: top rows hair (1), centre face skin (3), bottom rows clothes (4).
const seg = () => { const classes = new Uint8Array(W * H), skin = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; classes[p] = y < 8 ? 1 : y > 32 ? 4 : 3; skin[p] = classes[p] === 3 ? 1 : 0; }
  return { classes, skin, w: W, h: H }; };

describe('AI face regions', () => {
  it('protects segmented hair and clothes from skin retouching', () => {
    const regions = buildRegions(skinPixels(), W, H, [], seg());
    expect(regions.summary.hair).toBe(true);
    expect(regions.summary.clothes).toBe(true);
    const mask = maskFromRegions(skinPixels(), W, H, regions, { ...DEFAULT_SKIN, feather: 0 });
    expect(mask[2 * W + 20]).toBe(0);   // hair
    expect(mask[36 * W + 20]).toBe(0);  // clothes
    expect(mask[20 * W + 20]).toBeGreaterThan(.5); // face skin
  });
  it('turning off hair protection lets the user retouch it', () => {
    const regions = buildRegions(skinPixels(), W, H, [], seg());
    const mask = maskFromRegions(skinPixels(), W, H, regions, { ...DEFAULT_SKIN, feather: 0, guard: 255 & ~REGION.hair }, new Int8Array(W * H).fill(1));
    expect(mask[2 * W + 20]).toBe(1);
  });
  it('detects no beard, glasses or headwear on a plain face', () => {
    const face: SkinFace = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }));
    const s = buildRegions(skinPixels(), W, H, [face], seg()).summary;
    expect([s.beard, s.glasses, s.headwear]).toEqual([false, false, null]);
  });
  it('presets keep a valid protection mask', () => {
    expect(parseSkinPreset({ ...DEFAULT_SKIN, guard: 7 }).guard).toBe(7);
    expect(() => parseSkinPreset({ ...DEFAULT_SKIN, guard: 999 })).toThrow();
  });
});
