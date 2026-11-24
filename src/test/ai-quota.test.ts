import { describe, expect, it } from "vitest";
import {
  DAILY_NEURONS, NEURONS_PER_IMAGE, addUsage, emptyUsage, parseUsage, remainingImages, resolveAutoModel, utcDateKey,
} from "@/lib/ai-quota";

const day = (iso: string) => new Date(`${iso}T10:00:00Z`);

describe("utcDateKey", () => {
  it("uses the UTC day so the reset matches Cloudflare", () => {
    expect(utcDateKey(new Date("2026-03-01T23:30:00Z"))).toBe("2026-03-01");
    expect(utcDateKey(new Date("2026-03-02T00:10:00Z"))).toBe("2026-03-02");
  });
});

describe("parseUsage", () => {
  it("returns a fresh record when nothing is stored", () => {
    expect(parseUsage(null, day("2026-03-01"))).toEqual({ date: "2026-03-01", hq: 0, fast: 0 });
  });

  it("keeps counts from the same UTC day", () => {
    const raw = JSON.stringify({ date: "2026-03-01", hq: 3, fast: 5 });
    expect(parseUsage(raw, day("2026-03-01"))).toEqual({ date: "2026-03-01", hq: 3, fast: 5 });
  });

  it("resets after the UTC day rolls over", () => {
    const raw = JSON.stringify({ date: "2026-02-28", hq: 9, fast: 40 });
    expect(parseUsage(raw, day("2026-03-01"))).toEqual({ date: "2026-03-01", hq: 0, fast: 0 });
  });

  it("survives corrupt storage", () => {
    expect(parseUsage("{not json", day("2026-03-01"))).toEqual(emptyUsage(day("2026-03-01")));
  });
});

describe("addUsage", () => {
  it("counts one image per model", () => {
    const base = emptyUsage(day("2026-03-01"));
    expect(addUsage(base, "hq", day("2026-03-01"))).toEqual({ date: "2026-03-01", hq: 1, fast: 0 });
    expect(addUsage(addUsage(base, "fast", day("2026-03-01")), "fast", day("2026-03-01")))
      .toEqual({ date: "2026-03-01", hq: 0, fast: 2 });
  });

  it("starts over on a new UTC day", () => {
    const stale = { date: "2026-02-28", hq: 6, fast: 10 };
    expect(addUsage(stale, "hq", day("2026-03-01"))).toEqual({ date: "2026-03-01", hq: 1, fast: 0 });
  });
});

describe("remainingImages", () => {
  it("starts with the whole daily budget", () => {
    const left = remainingImages(emptyUsage(day("2026-03-01")));
    expect(left.neurons).toBe(DAILY_NEURONS);
    expect(left.hq).toBe(Math.floor(DAILY_NEURONS / NEURONS_PER_IMAGE.hq));
  });

  it("subtracts spent neurons and never goes negative", () => {
    const left = remainingImages({ date: "2026-03-01", hq: 6, fast: 0 });
    expect(left.neurons).toBe(DAILY_NEURONS - 6 * NEURONS_PER_IMAGE.hq);
    const spent = remainingImages({ date: "2026-03-01", hq: 99, fast: 99 });
    expect(spent).toEqual({ neurons: 0, hq: 0, fast: 0 });
  });
});

describe("resolveAutoModel", () => {
  it("picks the 9B model while the budget lasts", () => {
    expect(resolveAutoModel(emptyUsage(day("2026-03-01")))).toBe("hq");
    expect(resolveAutoModel({ date: "2026-03-01", hq: 4, fast: 0 })).toBe("hq");
  });

  it("falls back to the 4B model when 9B no longer fits", () => {
    expect(resolveAutoModel({ date: "2026-03-01", hq: 6, fast: 0 })).toBe("fast");
    expect(resolveAutoModel({ date: "2026-03-01", hq: 7, fast: 0 })).toBe("fast");
  });
});
