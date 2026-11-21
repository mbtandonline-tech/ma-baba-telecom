import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  images: z.array(z.string().startsWith("data:image/").max(12_000_000)).min(1).max(2),
  prompt: z.string().min(5).max(4000),
  width: z.number().int().min(256).max(1920).optional(),
  height: z.number().int().min(256).max(1920).optional(),
});

// Free AI photo editing via Cloudflare Workers AI (FLUX.2 [klein] 4B) — direct REST call.
// CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN are server-only secrets.
// Free tier: 10,000 neurons/day; this model is "Zero data retention" (photos are not stored).
const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

const MODEL_INPUT_MAX = 500; // Workers AI requires input images < 512x512

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

export const aiEditPhoto = createServerFn({ method: "POST" })
  .validator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<{ image?: string; error?: string }> => {
    const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"];
    const aiToken = process.env["CLOUDFLARE_AI_TOKEN"];
    if (!accountId || !aiToken) {
      return { error: "Cloudflare AI সিক্রেট সার্ভারে সেট করা নেই। CLOUDFLARE_ACCOUNT_ID ও CLOUDFLARE_AI_TOKEN যোগ করুন।" };
    }
    const form = new FormData();
    form.append("prompt", data.prompt);
    form.append("width", String(data.width ?? 1024));
    form.append("height", String(data.height ?? 1024));
    for (const [i, url] of data.images.entries()) {
      const b64 = url.split(",")[1] ?? "";
      form.append(`input_image_${i}`, base64ToBlob(b64));
    }
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${aiToken}` },
          body: form,
        },
      );
      if (!res.ok) {
        if (res.status === 429) {
          return { error: "আজকের ফ্রি AI কোটা শেষ। ০০:০০ UTC-তে কোটা রিসেট হবে, তারপর আবার চেষ্টা করুন।" };
        }
        if (res.status === 401 || res.status === 403) {
          return { error: "CLOUDFLARE_AI_TOKEN অবৈধ বা মেয়াদোত্তীর্ণ। Cloudflare Dashboard-এ token পরীক্ষা করুন।" };
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
      console.error("aiEditPhoto failed", e);
      return { error: "ছবি তৈরি করা যায়নি। আবার চেষ্টা করুন।" };
    }
  });
