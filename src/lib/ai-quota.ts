// Approximate daily free-quota bookkeeping for Cloudflare Workers AI.
// The real limit is account-wide (10,000 neurons/day, reset 00:00 UTC) and the
// API does not expose remaining usage, so this counts this browser's edits only.
// Pure helpers: storage access is guarded and dates are injectable for tests.

export const DAILY_NEURONS = 10_000;
export const NEURONS_PER_IMAGE = { hq: 1545, fast: 126 } as const;
export type AiModel = keyof typeof NEURONS_PER_IMAGE;
export type AiUsage = { date: string; hq: number; fast: number };

const STORAGE_KEY = "mbt-ai-usage";
// Keep budget for a few fast edits before spending the rest on 9B images.
const FAST_RESERVE = 6;

export function utcDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function emptyUsage(now = new Date()): AiUsage {
  return { date: utcDateKey(now), hq: 0, fast: 0 };
}

export function parseUsage(raw: string | null, now = new Date()): AiUsage {
  if (!raw) return emptyUsage(now);
  try {
    const parsed = JSON.parse(raw) as Partial<AiUsage>;
    if (parsed.date !== utcDateKey(now)) return emptyUsage(now);
    return {
      date: parsed.date,
      hq: Math.max(0, Math.floor(Number(parsed.hq) || 0)),
      fast: Math.max(0, Math.floor(Number(parsed.fast) || 0)),
    };
  } catch {
    return emptyUsage(now);
  }
}

export function readUsage(now = new Date()): AiUsage {
  if (typeof localStorage === "undefined") return emptyUsage(now);
  try {
    return parseUsage(localStorage.getItem(STORAGE_KEY), now);
  } catch {
    return emptyUsage(now);
  }
}

export function writeUsage(usage: AiUsage): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // storage full or blocked: quota display is best-effort
  }
}

export function addUsage(usage: AiUsage, model: AiModel, now = new Date()): AiUsage {
  const base = usage.date === utcDateKey(now) ? usage : emptyUsage(now);
  return model === "hq" ? { ...base, hq: base.hq + 1 } : { ...base, fast: base.fast + 1 };
}

export function remainingImages(usage: AiUsage): { hq: number; fast: number; neurons: number } {
  const used = usage.hq * NEURONS_PER_IMAGE.hq + usage.fast * NEURONS_PER_IMAGE.fast;
  const neurons = Math.max(0, DAILY_NEURONS - used);
  return {
    neurons,
    hq: Math.floor(neurons / NEURONS_PER_IMAGE.hq),
    fast: Math.floor(neurons / NEURONS_PER_IMAGE.fast),
  };
}

/** 9B while the best model still fits with a few fast edits reserved, then 4B. */
export function resolveAutoModel(usage: AiUsage): AiModel {
  const { neurons } = remainingImages(usage);
  return neurons >= NEURONS_PER_IMAGE.hq + FAST_RESERVE * NEURONS_PER_IMAGE.fast ? "hq" : "fast";
}
