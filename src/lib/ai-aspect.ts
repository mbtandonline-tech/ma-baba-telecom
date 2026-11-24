// Aspect ratios accepted by Google's Gemini image models (Nano Banana).
// Kept as a pure module so the mapping can be unit tested without the server runtime.
export const GEMINI_ASPECTS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
  "1:4",
  "4:1",
  "1:8",
  "8:1",
] as const;

export type GeminiAspect = (typeof GEMINI_ASPECTS)[number];

/**
 * Pick the supported Gemini aspect ratio closest to the requested width/height.
 * Compared in log space so 4:5 vs 3:4 is judged by relative difference, not pixels.
 */
export function closestAspect(width: number, height: number): GeminiAspect {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "1:1";
  }
  const target = Math.log(width / height);
  let best: GeminiAspect = "1:1";
  let bestDiff = Infinity;
  for (const aspect of GEMINI_ASPECTS) {
    const [aw, ah] = aspect.split(":").map(Number);
    const diff = Math.abs(target - Math.log((aw ?? 1) / (ah ?? 1)));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = aspect;
    }
  }
  return best;
}
