# MBT EDIT — AI পাসপোর্ট ও ভিসা ছবি স্টুডিও

পাসপোর্ট, ভিসা ও স্ট্যাম্প সাইজের ছবি তৈরি, রিটাচ ও প্রিন্ট করার ওয়েব অ্যাপ।

## স্ট্যাক

- **React 19** + **TanStack Start / TanStack Router** (SSR)
- **TypeScript**, **Vite 8**, **Tailwind CSS 4**
- **Nitro** — `cloudflare-module` প্রিসেটে Cloudflare Workers-এ ডিপ্লয়
- **Cloudflare Workers AI** (FLUX.2 — `flux-2-klein-9b` ডিফল্ট, `flux-2-klein-4b` দ্রুত) — AI ছবি এডিটিং (ফ্রি দৈনিক কোটা, zero data retention)
- MediaPipe (face landmarks + segmentation), Web Worker-ভিত্তিক রিটাচ পাইপলাইন

## লোকাল ডেভেলপমেন্ট

```bash
npm install
npm run dev      # http://localhost:8080
npm test         # vitest (৫৪টি টেস্ট)
npm run build    # .output/server (Worker) + .output/public (static)
```

## ডিপ্লয়

`main` ব্রাঞ্চে push করলে Cloudflare Workers Builds স্বয়ংক্রিয়ভাবে বিল্ড ও ডিপ্লয় করে।
লাইভ সাইট: https://ma-baba-telecom.mbtandonline.workers.dev

> **নোট:** Dashboard থেকে শুধু "Save version" করলে সাইট আপডেট হয় না — নতুন version অবশ্যই
> Deployments পেজ থেকে Promote/Rollback করে Active করতে হবে, অথবা build-এর জন্য push করতে হবে।

## সার্ভার সিক্রেট (Cloudflare Dashboard → Workers → Settings)

| নাম | বিবরণ |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID (Workers AI REST কলের জন্য) |
| `CLOUDFLARE_AI_TOKEN` | Workers AI permission-সহ API token (`cfut_...`) |

সিক্রেটগুলো শুধু সার্ভারে `process.env` থেকে পড়া হয়; ক্লায়েন্ট বান্ডলে যায় না।
নতুন build তৈরি হলে সিক্রেট স্বয়ংক্রিয়ভাবে অন্তর্ভুক্ত হয়।

## প্রধান ফিচার

- AI ব্যাকগ্রাউন্ড পরিবর্তন (নীল/সাদা/কাস্টম রং) — Workers AI
- AI প্রম্পট স্টুডিও — দুটি কোয়ালিটি মোড: **উন্নত** (FLUX 9B, ~৭টি/দিন) ও **দ্রুত** (FLUX 4B, ~৪০-৬০টি/দিন); প্রম্পটে identity-preserving ও beautification-মুক্ত নির্দেশনা
- প্রিন্ট প্রিভিউ (স্যান্ডবক্সড iframe) — স্বাধীন লেআউট কাস্টমাইজেশন
- Pro Editor (Curve, Levels, Heal, Crop) ও Skin Retouch (মাস্ক-ভিত্তিক)
- একাধিক ছবি, Undo/Redo, Compare, ৩০০ DPI প্রিন্ট লেআউট
