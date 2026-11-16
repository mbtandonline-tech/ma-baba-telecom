import model from '@/assets/face-landmarker.task.asset.json';
import segModel from '@/assets/selfie-multiclass.tflite.asset.json';
import simd from '@/assets/vision_wasm_internal.wasm.asset.json';
import basic from '@/assets/vision_wasm_nosimd_internal.wasm.asset.json';
import type { Segmentation, SkinFace } from './face-regions';

type Vision = typeof import('@mediapipe/tasks-vision');
let fileset: Promise<{ vision: Vision; simd: boolean }> | undefined;
let detector: Promise<import('@mediapipe/tasks-vision').FaceLandmarker> | undefined;
let segmenter: Promise<import('@mediapipe/tasks-vision').ImageSegmenter> | undefined;

async function buffer(url: string, label: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} লোড হয়নি—AI Detect দিয়ে আবার চেষ্টা করুন`);
  return new Uint8Array(await response.arrayBuffer());
}
const files = (useSimd: boolean) => ({
  wasmLoaderPath: useSimd ? '/vision/vision_wasm_internal.js' : '/vision/vision_wasm_nosimd_internal.js',
  wasmBinaryPath: useSimd ? simd.url : basic.url,
});
function vision() {
  fileset ??= (async () => { const v = await import('@mediapipe/tasks-vision'); return { vision: v, simd: await v.FilesetResolver.isSimdSupported() }; })();
  fileset.catch(() => { fileset = undefined; });
  return fileset;
}
async function withFallback<T>(create: (useSimd: boolean) => Promise<T>): Promise<T> {
  const { simd: ok } = await vision();
  try { return await create(ok); } catch (error) { if (!ok) throw error; return create(false); }
}
function getDetector() {
  detector ??= (async () => {
    const { vision: v } = await vision(), modelAssetBuffer = await buffer(model.url, 'ফেস মডেল');
    return withFallback(useSimd => v.FaceLandmarker.createFromOptions(files(useSimd), {
      baseOptions: { modelAssetBuffer, delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 8,
      minFaceDetectionConfidence: .3, minFacePresenceConfidence: .3, minTrackingConfidence: .3,
    }));
  })();
  detector.catch(() => { detector = undefined; });
  return detector;
}
function getSegmenter() {
  segmenter ??= (async () => {
    const { vision: v } = await vision(), modelAssetBuffer = await buffer(segModel.url, 'চুল/পোশাক মডেল');
    return withFallback(useSimd => v.ImageSegmenter.createFromOptions(files(useSimd), {
      baseOptions: { modelAssetBuffer, delegate: 'CPU' }, runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: true,
    }));
  })();
  segmenter.catch(() => { segmenter = undefined; });
  return segmenter;
}

function scaled(image: HTMLCanvasElement, maxSide: number, filter = 'none') {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('ছবি বিশ্লেষণ করা যায়নি');
  ctx.filter = filter; ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function detectSkinFaces(image: HTMLCanvasElement): Promise<SkinFace[]> {
  const instance = await getDetector();
  const detect = (canvas: HTMLCanvasElement) => instance.detect(canvas).faceLandmarks.map(face => face.map(p => ({ x: p.x, y: p.y })));
  const faces = detect(scaled(image, 1280));
  if (faces.length) return faces;
  // Small, dim or low-contrast scans get a normalized second pass.
  return detect(scaled(image, 1024, 'contrast(1.2) brightness(1.1)'));
}

/** AI segmentation: hair, face/body skin, clothes (cap/hijab) and accessories (glasses). */
export async function segmentPortrait(image: HTMLCanvasElement): Promise<Segmentation> {
  const instance = await getSegmenter(), canvas = scaled(image, 768);
  const result = instance.segment(canvas);
  try {
    const category = result.categoryMask, masks = result.confidenceMasks;
    if (!category) throw new Error('সেগমেন্টেশন পাওয়া যায়নি');
    const classes = new Uint8Array(category.getAsUint8Array());
    const body = masks?.[2]?.getAsFloat32Array(), faceSkin = masks?.[3]?.getAsFloat32Array();
    const skin = new Float32Array(classes.length);
    for (let i = 0; i < skin.length; i++) skin[i] = Math.min(1, (body?.[i] ?? (classes[i] === 2 ? 1 : 0)) + (faceSkin?.[i] ?? (classes[i] === 3 ? 1 : 0)));
    return { classes, skin, w: category.width, h: category.height };
  } finally { result.close(); }
}

export type FaceAnalysis = { faces: SkinFace[]; seg: Segmentation | null; error?: string | undefined };
export async function analyzePortrait(image: HTMLCanvasElement): Promise<FaceAnalysis> {
  const [faces, seg] = await Promise.allSettled([detectSkinFaces(image), segmentPortrait(image)]);
  if (faces.status === 'rejected') console.error('Face detection failed', faces.reason);
  if (seg.status === 'rejected') console.error('Segmentation failed', seg.reason);
  const error = faces.status === 'rejected' ? 'মুখ শনাক্তকরণ লোড হয়নি—রঙভিত্তিক মাস্ক সক্রিয়'
    : seg.status === 'rejected' ? 'চুল/পোশাক শনাক্তকরণ লোড হয়নি—শুধু মুখের বিন্দু সক্রিয়' : undefined;
  return { faces: faces.status === 'fulfilled' ? faces.value : [], seg: seg.status === 'fulfilled' ? seg.value : null, error };
}
