import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  images: z.array(z.string().startsWith("data:image/").max(12_000_000)).min(1).max(2),
  prompt: z.string().min(5).max(4000),
});

// Google Gemini native image editing (Nano Banana) — direct REST call,
// API key is server-only (Cloudflare secret GEMINI_API_KEY).
const MODEL = "gemini-2.5-flash-image";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
};

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  error?: { message?: string };
};

export const aiEditPhoto = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<{ image?: string; error?: string }> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { error: "GEMINI_API_KEY সার্ভারে সেট করা নেই। Cloudflare Dashboard-এ secret হিসেবে যোগ করুন।" };
    }
    const parts: GeminiPart[] = [{ text: data.prompt }];
    for (const url of data.images) {
      const [head = "", b64 = ""] = url.split(",");
      const mime = head.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
      parts.push({ inlineData: { mimeType: mime, data: b64 } });
    }
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ parts }] }),
      });
      if (!res.ok) {
        if (res.status === 429) return { error: "অনেক বেশি অনুরোধ। একটু পরে আবার চেষ্টা করুন।" };
        if (res.status === 401 || res.status === 403) {
          return { error: "API key অবৈধ বা অনুমতি নেই। GEMINI_API_KEY পরীক্ষা করুন।" };
        }
        const body = await res.text().catch(() => "");
        console.error("Gemini API error", res.status, body.slice(0, 500));
        return { error: `AI ত্রুটি (${res.status})। আবার চেষ্টা করুন।` };
      }
      const json = (await res.json()) as GeminiResponse;
      const candidate = json.candidates?.[0];
      const inline = candidate?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      if (!inline?.data) {
        const reason = candidate?.finishReason;
        if (reason === "SAFETY" || reason === "IMAGE_SAFETY" || reason === "PROHIBITED_CONTENT") {
          return { error: "নিরাপত্তা নীতির কারণে ছবিটি সম্পাদনা করা যায়নি। ভিন্ন ছবি বা প্রম্পট চেষ্টা করুন।" };
        }
        return { error: "AI কোনো ছবি ফেরত দেয়নি। আবার চেষ্টা করুন।" };
      }
      return { image: `data:${inline.mimeType ?? "image/png"};base64,${inline.data}` };
    } catch (e) {
      console.error("aiEditPhoto failed", e);
      return { error: "ছবি তৈরি করা যায়নি। আবার চেষ্টা করুন।" };
    }
  });
