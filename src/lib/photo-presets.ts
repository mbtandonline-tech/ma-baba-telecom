export type PhotoSize = { id: string; label: string; w: number; h: number };

/** Photo sizes in millimetres. */
export const PHOTO_SIZES: PhotoSize[] = [
  { id: "passport-bd", label: "পাসপোর্ট 40×50 mm", w: 40, h: 50 },
  { id: "passport-15x19", label: "পাসপোর্ট 1.5×1.9 in", w: 38.1, h: 48.26 },
  { id: "passport-30x40", label: "পাসপোর্ট 30×40 mm", w: 30, h: 40 },
  { id: "passport-35x45", label: "পাসপোর্ট / শেনজেন ভিসা 35×45 mm", w: 35, h: 45 },
  { id: "stamp", label: "স্ট্যাম্প 20×25 mm", w: 20, h: 25 },
  { id: "stamp-small", label: "স্ট্যাম্প ছোট 19×23 mm", w: 19, h: 23 },
  { id: "visa-us", label: "ভিসা USA / India 2×2 in", w: 50.8, h: 50.8 },
  { id: "visa-china", label: "ভিসা China 33×48 mm", w: 33, h: 48 },
  { id: "visa-canada", label: "ভিসা Canada 50×70 mm", w: 50, h: 70 },
  { id: "visa-malaysia", label: "ভিসা Malaysia 35×50 mm", w: 35, h: 50 },
  { id: "id-card", label: "আইডি কার্ড 25×30 mm", w: 25, h: 30 },
  { id: "custom", label: "কাস্টম সাইজ", w: 40, h: 50 },
];

export type Paper = { id: string; label: string; w: number; h: number };
export const PAPERS: Paper[] = [
  { id: "a4", label: "A4 Sheet (210 × 297 mm)", w: 210, h: 297 },
  { id: "letter", label: "Letter (216 × 279 mm)", w: 215.9, h: 279.4 },
  { id: "4r", label: "4R Photo (4 × 6 in)", w: 101.6, h: 152.4 },
  { id: "5r", label: "5R Photo (5 × 7 in)", w: 127, h: 177.8 },
  { id: "a5", label: "A5 (148 × 210 mm)", w: 148, h: 210 },
];

export type AiPrompt = { id: string; title: string; hint: string; prompt: string; needsTwo?: boolean };

export const blueBgPrompt = (hex = "00C4FC") =>
  `Please transform the provided image into a professional 1.5x1.9 inch passport-size photo with a plain ${hex}  background. Ensure the subject's face is facing directly forward, with any turns to the side corrected. Remove any blemishes or spots from the face while maintaining a natural appearance. The overall style should be suitable for official passport use.`;

export const AI_PROMPTS: AiPrompt[] = [
  { id: "blue", title: "নীল ব্যাকগ্রাউন্ড", hint: "পাসপোর্ট ছবি, #00C4FC", prompt: blueBgPrompt() },
  {
    id: "white",
    title: "সাদা ব্যাকগ্রাউন্ড",
    hint: "পাসপোর্ট ছবি, সাদা",
    prompt:
      "Please transform the provided image into a professional 1.5x1.9 inch passport-size photo with a plain white background. Ensure the subject's face is facing directly forward, with any turns to the side corrected. Remove any blemishes or spots from the face while maintaining a natural appearance. The overall style should be suitable for official passport use.",
  },
  {
    id: "enhance",
    title: "কোয়ালিটি বৃদ্ধি (8K)",
    hint: "কিছু না বদলে শুধু পরিষ্কার",
    prompt:
      "Enhance the uploaded photo to an ultra-realistic 8K quality without changing any object, structure, shape, color, or composition. Do not add, remove, or alter anything in the scene. Only improve clarity, sharpness, edges, textures, and overall resolution. Repair blur, noise, pixel damage, and compression artifacts while keeping every element exactly the same. Maintain the original lighting, shadows, reflections, angle, and framing. Produce a clean, crisp, high-detail HD output that looks natural and lifelike. This prompt must work for any low-quality zoomed or blurry image.",
  },
  {
    id: "couple",
    title: "জোড়া পাসপোর্ট ছবি",
    hint: "স্বামী ও স্ত্রী — ২টি ছবি দিন",
    needsTwo: true,
    prompt:
      "Face 100% Match A highly realistic studio portrait of a South Asian married couple standing side by side against a smooth solid blue background. The man is on the left, looking straight at the camera with a neutral expression.\n\nThe woman is on the right, looking straight at the camera with a neutral expression.\n\nBoth subjects are front-facing with symmetrical framing, maintaining equal spacing, captured in a professional passport-style composition. Soft diffused studio lighting evenly illuminates both faces, eliminating harsh shadows and ensuring balanced brightness and contrast. Skin appears naturally smooth with subtle retouching, blemish removal, and realistic texture preserved.\n\nUltra sharp focus, natural skin tones, clean and noise-free image, high dynamic range, shadow removal, ultra HD, 8K resolution, professional photography, DSLR quality, highly detailed, color accurate.",
  },
];

export const BG_COLORS = [
  "#FFFFFF", "#00C4FC", "#1FB5D8", "#2563EB", "#4F46E5", "#84CC16",
  "#10B981", "#EF4444", "#EC4899", "#8B5CF6", "#D1D5DB",
];

export const THEMES = [
  { id: "ocean", label: "Ocean", color: "oklch(0.62 0.19 252)" },
  { id: "emerald", label: "Emerald", color: "oklch(0.66 0.16 160)" },
  { id: "amber", label: "Amber", color: "oklch(0.76 0.16 70)" },
  { id: "rose", label: "Rose", color: "oklch(0.64 0.21 15)" },
] as const;
