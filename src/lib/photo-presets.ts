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
  size ? `\n\nFrame it for a ${size.w}×${size.h} mm passport photo.` : "";

const RETOUCH = `Apply light, professional studio retouching only: even out the skin tone, soften temporary blemishes and harsh shadows, lighten under-eye shadows, brighten and sharpen the eyes, and tidy flyaway hair. Preserve permanent features such as freckles, moles and birthmarks, and keep the skin texture and pores crisp and visible — do not over-smooth, airbrush or plasticise the skin.`;

/**
 * Passport-style background edit prompt.
 * Tuned for FLUX.2 editing models: asks for flattering but natural studio
 * retouching (not "beautified") and explicit identity preservation.
 */
export const blueBgPrompt = (hex = "00C4FC", size?: { w: number; h: number }) =>
  `Create a professional studio passport photograph from this photo. Keep the person's identity exactly — same face shape, facial features, skin tone, hair and expression, clearly the same person.

${RETOUCH}

Replace the background with a flat, evenly lit solid #${hex} background — no gradient, texture or cast shadow on the wall.

Compose a head-and-shoulders portrait: head centred and upright, eyes level looking straight into the camera, calm friendly neutral expression, both ears visible, shoulders squared.

Soft, flattering frontal studio lighting, realistic natural colour, sharp focus on the eyes, clean natural edges around the hair.${sizeLine(size)}`;

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
      `Restore and enhance this photo without changing the person or scene. Keep the same face, pose, expression, background, colours and framing exactly. Recover fine detail and resolution, reduce noise and compression artifacts, improve edge clarity and balance the lighting. ${RETOUCH} Do not reshape the face or change the identity. Output a clean, sharp, high-resolution professional photograph.`,
  },
  {
    id: "suit",
    title: "ফরমাল পোশাক",
    hint: "স্যুট পরিয়ে পাসপোর্ট ছবি",
    prompt:
      `Create a professional studio passport photograph from this photo. Keep the person's identity exactly — same face shape, facial features, skin tone, hair and expression. ${RETOUCH} Dress the person in a well-fitted formal dark navy suit jacket with a crisp white shirt and a simple dark tie. Replace the background with a flat, evenly lit solid #FFFFFF background. Head-and-shoulders portrait: head centred, eyes level looking straight into the camera, calm friendly neutral expression, shoulders squared. Soft, flattering frontal studio lighting, realistic natural colour, sharp focus on the eyes.`,
  },
  {
    id: "couple",
    title: "জোড়া পাসপোর্ট ছবি",
    hint: "স্বামী ও স্ত্রী — ২টি ছবি দিন",
    needsTwo: true,
    prompt:
      `Create a professional studio photograph of the two people from the reference images, standing side by side.\n\nKeep both identities exactly — same faces, facial features, skin tones, hair and expressions. ${RETOUCH}\n\nBoth face the camera, heads upright and level, calm friendly neutral expressions, shoulders squared. Place them shoulder to shoulder with equal spacing and equal size, heads at the same height.\n\nReplace the background with a flat, evenly lit solid #00C4FC background. Soft, flattering studio lighting, realistic natural colour, sharp focus on the eyes. Output a landscape photo with both subjects fully in frame.`,
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
