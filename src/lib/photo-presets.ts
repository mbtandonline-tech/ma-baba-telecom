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

const sizeLine = (size?: { w: number; h: number }) =>
  size ? ` Output size: ${size.w}×${size.h} mm at 300 DPI (portrait aspect ratio).` : "";

/**
 * Passport-style background edit prompt.
 * Written for FLUX.2 editing models: identity preservation and "no beautification"
 * are stated explicitly, otherwise distilled models tend to over-smooth faces.
 */
export const blueBgPrompt = (hex = "00C4FC", size?: { w: number; h: number }) =>
  `Edit this photo into a professional passport photograph.

Keep the person's identity exactly: same face, facial features, skin tone, hair, expression and natural skin texture. Do not beautify, smooth, reshape or alter the face.

Replace only the background with a flat, evenly lit solid #${hex} background — no gradient, texture or cast shadow on the wall.

Compose a head-and-shoulders portrait: head centered and upright, eyes level and looking straight into the camera, neutral expression, both ears visible.

Soft, even frontal studio lighting, realistic natural skin tones, true-to-life colour, sharp focus on the eyes, clean natural edges around the hair.${sizeLine(size)}`;

export const AI_PROMPTS: AiPrompt[] = [
  { id: "blue", title: "নীল ব্যাকগ্রাউন্ড", hint: "পাসপোর্ট ছবি, #00C4FC", prompt: blueBgPrompt() },
  {
    id: "white",
    title: "সাদা ব্যাকগ্রাউন্ড",
    hint: "পাসপোর্ট / ভিসা ছবি, সাদা",
    prompt: blueBgPrompt("FFFFFF"),
  },
  {
    id: "enhance",
    title: "কোয়ালিটি বৃদ্ধি",
    hint: "কিছু না বদলে শুধু পরিষ্কার",
    prompt:
      "Restore and sharpen this photo without changing anything. Keep the same person, face, pose, expression, background, colours and framing exactly. Recover fine detail and resolution, reduce noise and compression artifacts, and improve edge clarity. Keep skin texture natural and realistic — do not retouch, beautify, smooth or reshape the face. Output a clean, high-resolution version that looks like a professional camera photograph.",
  },
  {
    id: "suit",
    title: "ফরমাল পোশাক",
    hint: "স্যুট পরিয়ে পাসপোর্ট ছবি",
    prompt:
      "Edit this photo into a professional passport photograph. Keep the person's face, identity, facial features, skin tone, hair and natural skin texture exactly the same — do not beautify, smooth, reshape or alter the face. Dress the person in a well-fitted formal dark navy suit jacket with a crisp white shirt and a simple dark tie. Replace the background with a flat, evenly lit solid #FFFFFF background. Head-and-shoulders portrait, head centered, eyes level and looking straight into the camera, neutral expression. Soft, even studio lighting, realistic skin tones, sharp focus on the eyes.",
  },
  {
    id: "couple",
    title: "জোড়া পাসপোর্ট ছবি",
    hint: "স্বামী ও স্ত্রী — ২টি ছবি দিন",
    needsTwo: true,
    prompt:
      "Create a professional passport-style photograph of the two people from the reference images, standing side by side.\n\nKeep both identities exactly: same faces, facial features, skin tones, hair and natural skin texture. Do not beautify, smooth, reshape or alter either face.\n\nBoth face the camera, heads upright and level, neutral expressions, shoulders squared. Place them shoulder to shoulder with equal spacing and equal size, heads at the same height.\n\nReplace the background with a flat, evenly lit solid #00C4FC background. Soft, even studio lighting, realistic natural skin tones, sharp focus on the eyes. Output a landscape photo with both subjects fully in frame.",
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
