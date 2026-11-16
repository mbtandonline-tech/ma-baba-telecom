import { buildRegions, maskFromRegions, prepareSkinPixels, retouchSkin, suggestFromMask, DEFAULT_SKIN, type FaceRegions, type Segmentation, type SkinFace, type SkinSettings } from './skin-retouch';

type Source = { manual?: Int8Array | undefined; data: Uint8ClampedArray; w: number; h: number; faces: SkinFace[]; regions: FaceRegions; pixels: ReturnType<typeof prepareSkinPixels>; mask?: { key: string; value: Float32Array } };
export type WorkerRequest =
  | { type: 'source'; id: number; sourceKey: string; data: Uint8ClampedArray; w: number; h: number; faces: SkinFace[]; seg?: Segmentation | null }
  | { type: 'render'; id: number; sourceKey: string; settings: SkinSettings; manual?: Int8Array; manualVersion: number }
  | { type: 'suggest'; id: number; sourceKey: string }
  | { type: 'release'; id: number; sourceKey: string };

// A few sources stay cached (preview, full-size apply, batch item) so slider moves reuse bands and regions.
const sources = new Map<string, Source>();
const reply = (msg: object, transfer: Transferable[] = []) => self.postMessage(msg, { transfer });

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === 'source') {
      const regions = buildRegions(msg.data, msg.w, msg.h, msg.faces, msg.seg);
      sources.set(msg.sourceKey, { data: msg.data, w: msg.w, h: msg.h, faces: msg.faces, regions, pixels: prepareSkinPixels(msg.data, msg.w, msg.h, msg.faces) });
      while (sources.size > 3) { const first = sources.keys().next().value; if (first === undefined) break; sources.delete(first); }
      reply({ id: msg.id, summary: regions.summary, bits: regions.bits.slice() });
      return;
    }
    if (msg.type === 'release') { sources.delete(msg.sourceKey); reply({ id: msg.id }); return; }
    const src = sources.get(msg.sourceKey);
    if (!src) throw new Error('ছবি প্রস্তুত নয়—আবার চেষ্টা করুন');
    if (msg.type === 'suggest') {
      reply({ id: msg.id, settings: suggestFromMask(src.data, src.w, src.h, maskFromRegions(src.data, src.w, src.h, src.regions, DEFAULT_SKIN)) });
      return;
    }
    const s = msg.settings;
    if (msg.manual) src.manual = msg.manual;
    const key = [s.tolerance, s.feather, s.opacity, s.protect, s.guard, msg.manualVersion].join('|');
    if (src.mask?.key !== key) src.mask = { key, value: maskFromRegions(src.data, src.w, src.h, src.regions, s, src.manual) };
    const output = retouchSkin(src.data, src.w, src.h, src.mask.value, src.faces, s, src.pixels);
    const mask = src.mask.value.slice();
    reply({ id: msg.id, output, mask }, [output.buffer, mask.buffer]);
  } catch (error) { reply({ id: msg.id, error: error instanceof Error ? error.message : 'Retouch failed' }); }
};
