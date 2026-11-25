# MBT EDIT — AI পাসপোর্ট ও ভিসা ছবি স্টুডিও

পাসপোর্ট, ভিসা ও স্ট্যাম্প সাইজের ছবি তৈরি, রিটাচ ও প্রিন্ট করার ওয়েব অ্যাপ।

## স্ট্যাক

- **React 19** + **TanStack Start / TanStack Router** (SSR)
- **TypeScript**, **Vite 8**, **Tailwind CSS 4**
- **Nitro** — `cloudflare-module` প্রিসেটে Cloudflare Workers-এ ডিপ্লয়
- **Cloudflare Workers AI** (FLUX.2 — `flux-2-klein-9b` ডিফল্ট, `flux-2-klein-4b` দ্রুত) — AI ছবি এডিটিং (ফ্রি দৈনিক কোটা, zero data retention)
- **Google Gemini** (`gemini-nano-banana-2.1` / Nano Banana 2.1) — ঐচ্ছিক প্রিমিয়াম ইঞ্জিন, সেরা identity preservation (পেইড API)
- MediaPipe (face landmarks + segmentation), Web Worker-ভিত্তিক রিটাচ পাইপলাইন

## লোকাল ডেভেলপমেন্ট

```bash
npm install
npm run dev      # http://localhost:8080
npm test         # vitest (৭৮টি টেস্ট)
npm run build    # .output/server (Worker) + .output/public (static)
```

## ডিপ্লয়

`main` ব্রাঞ্চে push করলে Cloudflare Workers Builds স্বয়ংক্রিয়ভাবে বিল্ড ও ডিপ্লয় করে।
লাইভ সাইট: https://ma-baba-telecom.mbtandonline.workers.dev

> **নোট:** Dashboard থেকে শুধু "Save version" করলে সাইট আপডেট হয় না — নতুন version অবশ্যই
> Deployments পেজ থেকে Promote/Rollback করে Active করতে হবে, অথবা build-এর জন্য push করতে হবে।

## সার্ভার সিক্রেট (Cloudflare Dashboard → Workers → Settings)

| নাম                     | বিবরণ                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID (Workers AI REST কলের জন্য)                                             |
| `CLOUDFLARE_AI_TOKEN`   | Workers AI permission-সহ API token (`cfut_...`)                                              |
| `GEMINI_API_KEY`        | ঐচ্ছিক — Google AI Studio key (বিলিং চালু থাকতে হবে)। UI-তে “Gemini” ইঞ্জিন বাছাই করলে ব্যবহৃত হয় |

Gemini-র ইমেজ API-তে ফ্রি টিয়ার নেই। ১টি ছবি ≈ **$০.০৩৪ (1K)** / **$০.০৫ (2K)**; key না থাকলে অ্যাপ ফ্রি Cloudflare ইঞ্জিনেই চলে।

সিক্রেটগুলো শুধু সার্ভারে `process.env` থেকে পড়া হয়; ক্লায়েন্ট বান্ডলে যায় না।
নতুন build তৈরি হলে সিক্রেট স্বয়ংক্রিয়ভাবে অন্তর্ভুক্ত হয়।

## প্রধান ফিচার

- AI ব্যাকগ্রাউন্ড পরিবর্তন (নীল/সাদা/কাস্টম রং) — Workers AI
- AI প্রম্পট স্টুডিও — **এক ক্লিক, সেরা যা পাওয়া যায়**: ডিফল্ট **সেরা (অটো)** ক্রমে চেষ্টা করে Gemini (Nano Banana 2.1) → FLUX 9B → FLUX 4B, কোনো ইঞ্জিন বন্ধ/কোটা শেষ হলে নিজে থেকেই পরেরটায় নামে (কোনো ত্রুটি বা বাছাই ছাড়া)। ফ্রি কোটা কাউন্টার ও Gemini-তে 1K/2K নির্বাচন আছে। প্রম্পটে identity-preserving ও beautification-মুক্ত নির্দেশনা
- **ছবি কপি / প্রম্পট কপি** — ঐচ্ছিক, লুকানো “অন্য উপায়” অংশে: Gemini বা ChatGPT-এর ফ্রি ওয়েব অ্যাপে হাতে দেওয়ার জন্য (ওদের ইমেজ API-তে ফ্রি টিয়ার নেই)
- প্রিন্ট প্রিভিউ (স্যান্ডবক্সড iframe) — স্বাধীন লেআউট কাস্টমাইজেশন
- Pro Editor (Curve, Levels, Heal, Crop) ও Skin Retouch (মাস্ক-ভিত্তিক)
- একাধিক ছবি, Undo/Redo, Compare, ৩০০ DPI প্রিন্ট লেআউট
