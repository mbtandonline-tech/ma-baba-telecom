import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  images: z.array(z.string().startsWith("data:image/").max(12_000_000)).min(1).max(2),
  prompt: z.string().min(5).max(4000),
});

function dataUrlToBlob(url: string): Blob {
  const [head = "", b64 = ""] = url.split(",");
  const mime = head.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export const aiEditPhoto = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<{ image?: string; error?: string }> => {
    const { editImage, GatewayError, PaymentRequiredError, RateLimitError } = await import("@lovable.dev/ai-gateway");
    try {
      const res = await editImage({
        model: "openai/gpt-image-2.5-sunburst",
        image: data.images.map(dataUrlToBlob),
        prompt: data.prompt,
        size: "1024x1536",
        quality: "medium",
        output_format: "jpeg",
      });
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) return { error: "AI কোনো ছবি ফেরত দেয়নি। আবার চেষ্টা করুন।" };
      return { image: `data:image/jpeg;base64,${b64}` };
    } catch (e) {
      console.error("aiEditPhoto failed", e);
      if (e instanceof PaymentRequiredError) return { error: "AI ক্রেডিট শেষ। ক্রেডিট যোগ করে আবার চেষ্টা করুন।" };
      if (e instanceof RateLimitError) return { error: "অনেক বেশি অনুরোধ। একটু পরে আবার চেষ্টা করুন।" };
      if (e instanceof GatewayError) return { error: `AI ত্রুটি: ${e.message}` };
      return { error: "ছবি তৈরি করা যায়নি। আবার চেষ্টা করুন।" };
    }
  });
