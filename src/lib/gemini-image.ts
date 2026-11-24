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
