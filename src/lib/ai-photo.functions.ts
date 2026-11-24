import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { closestAspect } from "./ai-aspect";
import { findGeminiImage, firstInteraction, geminiErrorMessage } from "./gemini-image";

const Input = z.object({
  images: z.array(z.string().startsWith("data:image/").max(12_000_000)).min(1).max(2),
  prompt: z.string().min(5).max(4000),
  width: z.number().int().min(256).max(1920).optional(),
  height: z.number().int().min(256).max(1920).optional(),
  model: z.enum(["fast", "hq"]).optional(),
  provider: z.enum(["free", "gemini"]).optional(),
  guidance: z.number().min(1).max(10).optional(),
});

type AiInput = z.infer<typeof Input>;
type AiResult = { image?: string; error?: string };

// Free AI photo editing via Cloudflare Workers AI (FLUX.2 [klein]) — direct REST call.
// CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN are server-only secrets.
// Free tier: 10,000 neurons/day. "fast" (4B) ≈ 26 neurons/output tile (~40-60 edits/day),
// "hq" (9B) ≈ 1364 neurons per first megapixel (~7 edits/day). Both are zero data retention.
const MODELS = {
  fast: "@cf/black-forest-labs/flux-2-klein-4b",
  hq: "@cf/black-forest-labs/flux-2-klein-9b",
} as const;

// Inference tuning per model. Higher steps/guidance follow the prompt more closely,
// which keeps identity and the flat background intact (pricing is per megapixel, not per step).
const MODEL_TUNING = {
  fast: { steps: 20, guidance: 3.5 },
  hq: { steps: 28, guidance: 4 },
} as const;

const MODEL_INPUT_MAX = 500; // Workers AI requires input images < 512x512

// Google Gemini "Nano Banana" image editing — paid API (no free tier), best identity
// preservation. 1K ≈ $0.0336/image, 2K ≈ $0.0504/image (Nov 2026 pricing).
// GEMINI_API_KEY is a server-only secret (Google AI Studio key with billing enabled).
const GEMINI_MODEL = "gemini-nano-banana-2.1";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

type WorkersAiResponse = {
  success?: boolean;
  result?: { image?: string };
  errors?: Array<{ message?: string } | string>;
};

/** Detect the mime type of a base64 image from its magic bytes. */
function detectMime(b64: string): string {
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("UklGR")) return "image/webp";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  return "image/png";
}

function base64ToBlob(b64: string, mime = "image/jpeg"): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function freeEdit(data: AiInput): Promise<AiResult> {
  const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"];
  const aiToken = process.env["CLOUDFLARE_AI_TOKEN"];
  if (!accountId || !aiToken) {
    return {
      error:
        "Cloudflare AI সিক্রেট সার্ভারে সেট করা নেই। CLOUDFLARE_ACCOUNT_ID ও CLOUDFLARE_AI_TOKEN যোগ করুন।",
    };
  }
  const modelKey = data.model ?? "hq";
  const model = MODELS[modelKey];
  const tuning = MODEL_TUNING[modelKey];
  const form = new FormData();
  form.append("prompt", data.prompt);
  form.append("width", String(data.width ?? 1024));
  form.append("height", String(data.height ?? 1024));
  form.append("steps", String(tuning.steps));
  form.append("guidance", String(data.guidance ?? tuning.guidance));
  for (const [i, url] of data.images.entries()) {
    const b64 = url.split(",")[1] ?? "";
    form.append(`input_image_${i}`, base64ToBlob(b64));
  }
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${aiToken}` },
        body: form,
      },
    );
    if (!res.ok) {
      if (res.status === 429) {
        return {
          error:
            "আজকের ফ্রি AI কোটা (১০,০০০ neurons) শেষ। প্রতিদিন ০০:০০ UTC-তে রিসেট হয়। বেশি ছবির জন্য Cloudflare Workers Paid ($5/মাস) নিন — ৯B মডেলে প্রতি ছবি প্রায় $০.০১৭, কার্যত আনলিমিটেড। অথবা Gemini ইঞ্জিন বেছে নিন।",
        };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          error:
            "CLOUDFLARE_AI_TOKEN অবৈধ বা মেয়াদোত্তীর্ণ। Cloudflare Dashboard-এ token পরীক্ষা করুন।",
        };
      }
      const body = await res.text().catch(() => "");
      console.error("Workers AI error", res.status, body.slice(0, 500));
      return { error: `AI ত্রুটি (${res.status})। আবার চেষ্টা করুন।` };
    }
    const json = (await res.json()) as WorkersAiResponse;
    const b64 = json.result?.image;
    if (!b64) {
      const err = json.errors?.[0];
      const msg = typeof err === "string" ? err : err?.message;
      console.error("Workers AI returned no image", msg);
      return { error: "AI কোনো ছবি ফেরত দেয়নি। আবার চেষ্টা করুন।" };
    }
    return { image: `data:${detectMime(b64)};base64,${b64}` };
  } catch (e) {
    console.error("freeEdit failed", e);
    return { error: "ছবি তৈরি করা যায়নি। আবার চেষ্টা করুন।" };
  }
}

async function geminiEdit(data: AiInput, apiKey: string): Promise<AiResult> {
  const input: Array<Record<string, string>> = [{ type: "text", text: data.prompt }];
  for (const url of data.images) {
    const b64 = url.split(",")[1] ?? "";
    if (!b64) continue;
    input.push({ type: "image", mime_type: detectMime(b64), data: b64 });
  }
  const body = {
    model: GEMINI_MODEL,
    input,
    response_format: {
      type: "image",
      mime_type: "image/jpeg",
      // Compose for the final print aspect so the later cover-crop keeps the face.
      aspect_ratio: closestAspect(data.width ?? 1024, data.height ?? 1024),
      // "উন্নত" = 2K for larger prints, "দ্রুত" = 1K (cheaper).
      image_size: data.model === "fast" ? "1K" : "2K",
    },
  };
  try {
    const res = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
        "Api-Revision": "2026-05-20",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => "");
    let payload: unknown = null;
    try {
      payload = JSON.parse(text);
    } catch {
      // non-JSON error body, handled below
    }
    if (!res.ok) {
      const msg = geminiErrorMessage(payload, text.slice(0, 300));
      console.error("Gemini error", res.status, msg);
      if (
        res.status === 400 &&
        /API[_ ]KEY[_ ]INVALID|API key not valid|API key expired/i.test(msg)
      ) {
        return {
          error:
            "GEMINI_API_KEY অবৈধ বা মেয়াদোত্তীর্ণ। Google AI Studio (aistudio.google.com/apikey) থেকে নতুন key নিয়ে Cloudflare-এ GEMINI_API_KEY সিক্রেট হিসেবে যোগ করুন।",
        };
      }
      if (res.status === 403) {
        return {
          error:
            "Gemini API অনুমতি দিচ্ছে না (403)। Google Cloud প্রজেক্টে বিলিং চালু আছে এবং key-তে Generative Language API অনুমোদিত কি না দেখুন।",
        };
      }
      if (res.status === 429) {
        return { error: "Gemini-র কোটা বা রেট লিমিট শেষ (429)। এক মিনিট পর আবার চেষ্টা করুন।" };
      }
      if (res.status === 404) {
        return { error: "Gemini ইমেজ মডেল পাওয়া যায়নি (404)। API সংস্করণ বদলেছে কি না দেখুন।" };
      }
      return { error: `Gemini ত্রুটি (${res.status})। আবার চেষ্টা করুন।` };
    }
    const b64 = findGeminiImage(payload);
    if (!b64) {
      const msg = geminiErrorMessage(payload);
      console.error("Gemini returned no image", firstInteraction(payload).status, msg);
      return {
        error:
          "Gemini কোনো ছবি ফেরত দেয়নি (সম্ভবত সেফটি ফিল্টার বা প্রম্পট সমস্যা)। প্রম্পট বদলে আবার চেষ্টা করুন।",
      };
    }
    return { image: `data:${detectMime(b64)};base64,${b64}` };
  } catch (e) {
    console.error("geminiEdit failed", e);
    return { error: "Gemini-তে ছবি তৈরি করা যায়নি। ইন্টারনেট/API key পরীক্ষা করে আবার চেষ্টা করুন।" };
  }
}

export const aiEditPhoto = createServerFn({ method: "POST" })
  .validator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<AiResult> => {
    if (data.provider === "gemini") {
      const apiKey = process.env["GEMINI_API_KEY"];
      if (!apiKey) {
        return {
          error:
            "Gemini ব্যবহার করতে সার্ভারে GEMINI_API_KEY সেট করতে হবে। Google AI Studio (aistudio.google.com/apikey) থেকে key নিয়ে Cloudflare Worker-এ সিক্রেট হিসেবে যোগ করুন, অথবা ফ্রি ইঞ্জিন বেছে নিন।",
        };
      }
      return geminiEdit(data, apiKey);
    }
    return freeEdit(data);
  });
