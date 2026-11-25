// Parsing helpers for Google's Interactions API (Gemini image generation).
// Pure so they can be unit tested: the API returns either a single interaction
// object or a one-item array, and errors use a nested { error: { message } } shape.

export type GeminiContent = { type?: string; data?: string; mime_type?: string; text?: string };
export type GeminiStep = { type?: string; content?: GeminiContent[] };
export type GeminiInteraction = {
  status?: string;
  steps?: GeminiStep[];
  errors?: Array<{ message?: string }>;
  error?: { message?: string; status?: string };
};

/** First interaction from a response payload (object or array). */
export function firstInteraction(payload: unknown): GeminiInteraction {
  const first = Array.isArray(payload) ? payload[0] : payload;
  return first && typeof first === "object" ? (first as GeminiInteraction) : {};
}

/** Human-readable API error message, whatever wrapper the API used. */
export function geminiErrorMessage(payload: unknown, fallback = ""): string {
  const candidates = Array.isArray(payload) ? payload : [payload];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const obj = candidate as GeminiInteraction;
    const msg = obj.error?.message ?? obj.errors?.[0]?.message;
    if (msg) return msg;
  }
  return fallback;
}

export type GeminiErrorKind = "key" | "billing" | "rate" | "model" | "safety" | "other";

/**
 * Classify a failed Gemini call so the UI can explain it and decide whether
 * falling back to the free engine makes sense. Google reports a project with no
 * billing as 429 RESOURCE_EXHAUSTED, whose message mentions billing/plan, so the
 * message has to be checked before assuming a simple rate limit.
 */
export function geminiErrorKind(status: number, message: string): GeminiErrorKind {
  const m = message.toLowerCase();
  if (/api[_ ]?key[_ ]?(invalid|expired)|api key not valid|unauthenticated/.test(m)) return "key";
  if (/billing|free[_ ]tier|quota_limit_value.*0|enable billing|plan and billing/.test(m)) return "billing";
  if (status === 429) return "rate";
  if (status === 404) return "model";
  if (/safety|blocked|recitation|policy|prohibited/.test(m)) return "safety";
  if (status === 401 || status === 403) return "key";
  return "other";
}

/** Last generated image block of an interaction (thought images are skipped). */
export function findGeminiImage(payload: unknown): string | undefined {
  const steps = firstInteraction(payload).steps ?? [];
  for (let s = steps.length - 1; s >= 0; s--) {
    const step = steps[s];
    if (!step || step.type !== "model_output") continue;
    const content = step.content ?? [];
    for (let c = content.length - 1; c >= 0; c--) {
      const block = content[c];
      if (block?.type === "image" && block.data) return block.data;
    }
  }
  return undefined;
}
