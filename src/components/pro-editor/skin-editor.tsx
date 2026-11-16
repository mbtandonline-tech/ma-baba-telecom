import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Check, Columns2, Download, Eraser, Eye, FolderPlus, Layers, Loader2, Maximize, Paintbrush, RotateCcw, Save, ScanFace, Shield, SlidersHorizontal, Sparkles, Undo2, Redo2, Wand2, X, ZoomIn, ZoomOut, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { loadImage } from '@/lib/render';
import { DEFAULT_SKIN, SKIN_PRESETS, FEATURES, REGION, resetSkinSection, parseSkinPreset, type RegionKey, type RegionSummary, type Segmentation, type SkinFace, type SkinSettings } from '@/lib/skin-retouch';
import type { FaceAnalysis } from '@/lib/skin-face';
import type { WorkerRequest } from '@/lib/skin-retouch.worker';

type Portrait = { key: string; canvas: HTMLCanvasElement; data: ImageData; faces: SkinFace[]; seg: Segmentation | null; detectionError?: string | undefined };
type BatchItem = { id: string; name: string; src: string; status: 'waiting' | 'processing' | 'done' | 'error'; result?: string; error?: string | undefined };
type WorkerResult = { id: number; output?: Uint8ClampedArray; mask?: Float32Array; summary?: RegionSummary; bits?: Uint8Array; settings?: SkinSettings; error?: string };
type Request = WorkerRequest extends infer R ? R extends { id: number } ? Omit<R, 'id'> : never : never;

const REGION_ITEMS: { key: RegionKey; label: string }[] = [
  { key: 'eyes', label: 'চোখ' }, { key: 'brows', label: 'ভুরু' }, { key: 'lips', label: 'ঠোঁট' }, { key: 'hair', label: 'চুল' },
  { key: 'beard', label: 'দাড়ি/গোঁফ' }, { key: 'glasses', label: 'চশমা' }, { key: 'headwear', label: 'টুপি/হিজাব' }, { key: 'clothes', label: 'পোশাক' },
];
const detected = (s: RegionSummary | null, key: RegionKey) => !!s && (key === 'headwear' ? !!s.headwear : !!s[key]);
const regionLabel = (s: RegionSummary | null, key: RegionKey, label: string) => key === 'headwear' && s?.headwear ? (s.headwear === 'hijab' ? 'হিজাব' : 'টুপি') : label;

async function preparePortrait(src: string, maxSide = 1000, analysis?: FaceAnalysis): Promise<Portrait> {
  const image = await loadImage(src), ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) throw new Error('ছবি খোলা যায়নি');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  let a = analysis;
  if (!a) {
    try { const { analyzePortrait } = await import('@/lib/skin-face'); a = await analyzePortrait(canvas); }
    catch (e) { console.error('Portrait analysis failed', e); a = { faces: [], seg: null, error: 'AI শনাক্তকরণ লোড হয়নি—রঙভিত্তিক মাস্ক সক্রিয়' }; }
  }
  return { key: crypto.randomUUID(), canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height), faces: a.faces, seg: a.seg, detectionError: a.error };
}
function fileUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('ফাইল খোলা যায়নি')); r.readAsDataURL(file); }); }
function saveUrl(url: string, name: string) { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); }
function outputUrl(output: Uint8ClampedArray, w: number, h: number) { const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('ছবি তৈরি হয়নি'); ctx.putImageData(new ImageData(new Uint8ClampedArray(output), w, h), 0, 0); return canvas.toDataURL('image/png'); }
function scaleManual(source: Int8Array, w: number, h: number, outW: number, outH: number) {
  const out = new Int8Array(outW * outH);
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) out[y * outW + x] = source[Math.min(h - 1, Math.floor(y * h / outH)) * w + Math.min(w - 1, Math.floor(x * w / outW))] ?? 0;
  return out;
}
function cssRgb(el: Element, name: string): [number, number, number] {
  const c = document.createElement('canvas'); c.width = 1; c.height = 1; const x = c.getContext('2d'); if (!x) return [255, 0, 0];
  x.fillStyle = getComputedStyle(el).getPropertyValue(name).trim() || 'red'; x.fillRect(0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data; return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
}

export function SkinEditor({ src, onApply, onClose }: { src: string; onApply: (url: string) => void; onClose: () => void }) {
  const [portrait, setPortrait] = useState<Portrait | null>(null);
  const [readyKey, setReadyKey] = useState('');
  const [summary, setSummary] = useState<RegionSummary | null>(null);
  const [settings, setSettings] = useState<SkinSettings>({ ...DEFAULT_SKIN });
  const [preset, setPreset] = useState('Natural');
  const [customPresets, setCustomPresets] = useState<Record<string, SkinSettings>>({});
  const [history, setHistory] = useState<{ settings: SkinSettings; manual: Int8Array }[]>([]);
  const [future, setFuture] = useState<{ settings: SkinSettings; manual: Int8Array }[]>([]);
  const [mapView, setMapView] = useState(false);
  const [mode, setMode] = useState<'split' | 'after' | 'before'>('split');
  const [maskView, setMaskView] = useState(false);
  const [brush, setBrush] = useState<'off' | 'add' | 'subtract'>('off');
  const [brushSize, setBrushSize] = useState(32);
  const [zoom, setZoom] = useState(1);
  const [processing, setProcessing] = useState(true);
  const [analyzing, setAnalyzing] = useState(true);
  const [renderMs, setRenderMs] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [dimensions, setDimensions] = useState({ w: 1, h: 1 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panAnchor, setPanAnchor] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const worker = useRef<Worker | null>(null), requestId = useRef(0);
  const jobs = useRef(new Map<number, { resolve: (r: WorkerResult) => void; reject: (e: Error) => void }>());
  const manual = useRef(new Int8Array(0)), manualVersion = useRef(0), sentManual = useRef(-1);
  const painting = useRef(false), stopBatch = useRef(false), mounted = useRef(true);
  const beforeRef = useRef<HTMLCanvasElement>(null), afterRef = useRef<HTMLCanvasElement>(null), maskRef = useRef<HTMLCanvasElement>(null), mapRef = useRef<HTMLCanvasElement>(null), viewRef = useRef<HTMLDivElement>(null);
  const batchInput = useRef<HTMLInputElement>(null), presetInput = useRef<HTMLInputElement>(null);
  const result = useRef<WorkerResult | null>(null), regionBits = useRef<Uint8Array | null>(null);
  const portraitRef = useRef<Portrait | null>(null), readyRef = useRef('');
  const pending = useRef<SkinSettings | null>(null), busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const w = new Worker(new URL('../../lib/skin-retouch.worker.ts', import.meta.url), { type: 'module' }); worker.current = w;
    w.onmessage = (event: MessageEvent<WorkerResult>) => { const job = jobs.current.get(event.data.id); if (!job) return; jobs.current.delete(event.data.id); event.data.error ? job.reject(new Error(event.data.error)) : job.resolve(event.data); };
    w.onerror = () => { for (const job of jobs.current.values()) job.reject(new Error('রিটাচিং বন্ধ হয়েছে')); jobs.current.clear(); };
    return () => { mounted.current = false; stopBatch.current = true; w.terminate(); worker.current = null; for (const job of jobs.current.values()) job.reject(new Error('বাতিল হয়েছে')); jobs.current.clear(); };
  }, []);
  const call = useCallback((msg: Request) => new Promise<WorkerResult>((resolve, reject) => {
    if (!worker.current) { reject(new Error('রিটাচিং প্রস্তুত হয়নি')); return; }
    const id = ++requestId.current; jobs.current.set(id, { resolve, reject });
    worker.current.postMessage({ ...msg, id });
  }), []);
  const loadSource = useCallback((p: Portrait) => call({ type: 'source', sourceKey: p.key, data: p.data.data, w: p.data.width, h: p.data.height, faces: p.faces, seg: p.seg }), [call]);

  const activate = useCallback(async (p: Portrait) => {
    portraitRef.current = p; setPortrait(p); setAnalyzing(true);
    const r = await loadSource(p);
    if (!mounted.current || portraitRef.current !== p) return;
    regionBits.current = r.bits ?? null; setSummary(r.summary ?? null); sentManual.current = -1;
    readyRef.current = p.key; setReadyKey(p.key); setAnalyzing(false);
  }, [loadSource]);

  useEffect(() => {
    let active = true; setProcessing(true); setAnalyzing(true); setError('');
    preparePortrait(src).then(p => { if (!active) return; manual.current = new Int8Array(p.data.width * p.data.height); manualVersion.current++; setZoom(1); setPan({ x: 0, y: 0 }); return activate(p); })
      .catch(e => { if (active) { setError(e instanceof Error ? e.message : 'ছবি খোলা যায়নি'); setProcessing(false); setAnalyzing(false); } });
    return () => { active = false; };
  }, [src, activate]);

  useEffect(() => {
    const box = viewRef.current; if (!box || !portrait) return;
    const observer = new ResizeObserver(() => {
      const count = mode === 'split' ? 2 : 1; const scale = Math.min((box.clientWidth / count - 20) / portrait.data.width, (box.clientHeight - 32) / portrait.data.height);
      setDimensions({ w: Math.max(1, Math.round(portrait.data.width * scale)), h: Math.max(1, Math.round(portrait.data.height * scale)) });
    }); observer.observe(box); return () => observer.disconnect();
  }, [portrait, mode]);

  // Real-time rendering: the newest slider value always wins; at most one frame is in flight.
  const pump = useCallback(() => {
    const p = portraitRef.current;
    if (busy.current || !pending.current || !p || readyRef.current !== p.key) return;
    const s = pending.current; pending.current = null; busy.current = true;
    const started = performance.now(), sendManual = sentManual.current !== manualVersion.current;
    sentManual.current = manualVersion.current;
    call({ type: 'render', sourceKey: p.key, settings: s, ...(sendManual ? { manual: manual.current } : {}), manualVersion: manualVersion.current })
      .then(r => { if (!mounted.current || portraitRef.current !== p) return; result.current = r; setRenderMs(Math.round(performance.now() - started)); setRevision(v => v + 1); })
      .catch(e => { if (mounted.current) { sentManual.current = -1; setError(e instanceof Error ? e.message : 'রিটাচ ব্যর্থ'); } })
      .finally(() => { busy.current = false; if (pending.current) pump(); else if (mounted.current) setProcessing(false); });
  }, [call]);
  useEffect(() => { if (!portrait || readyKey !== portrait.key) return; pending.current = settings; setProcessing(true); pump(); }, [settings, readyKey, portrait, pump]);
  const rerender = () => { manualVersion.current++; pending.current = settings; setProcessing(true); pump(); };

  useEffect(() => {
    const box = viewRef.current; if (!box) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); setZoom(z => Math.max(.25, Math.min(8, z * Math.exp(-e.deltaY * .0015)))); };
    box.addEventListener('wheel', wheel, { passive: false }); return () => box.removeEventListener('wheel', wheel);
  }, []);

  useEffect(() => { const c = beforeRef.current; if (!portrait || !c) return; c.width = portrait.data.width; c.height = portrait.data.height; c.getContext('2d')?.putImageData(portrait.data, 0, 0); }, [portrait, mode]);
  useEffect(() => {
    const c = afterRef.current; if (!portrait || !c) return; const { width: w, height: h } = portrait.data;
    c.width = w; c.height = h; const out = result.current?.output;
    c.getContext('2d')?.putImageData(out && out.length === w * h * 4 ? new ImageData(new Uint8ClampedArray(out), w, h) : portrait.data, 0, 0);
  }, [portrait, revision, mode]);
  useEffect(() => {
    const overlay = maskRef.current; if (!portrait || !overlay || !maskView) return; const { width: w, height: h } = portrait.data;
    overlay.width = w; overlay.height = h; const ctx = overlay.getContext('2d'); if (!ctx) return;
    const rgba = new Uint8ClampedArray(w * h * 4), mask = result.current?.mask, [r, g, b] = cssRgb(overlay, '--mask-overlay');
    for (let p = 0; p < w * h; p++) { rgba[p * 4] = r; rgba[p * 4 + 1] = g; rgba[p * 4 + 2] = b; rgba[p * 4 + 3] = Math.round((mask?.[p] ?? 0) * 125); }
    ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
  }, [portrait, revision, mode, maskView]);
  useEffect(() => {
    const canvas = mapRef.current, bits = regionBits.current; if (!portrait || !canvas || !mapView) return; const { width: w, height: h } = portrait.data;
    canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); if (!ctx) return;
    const rgba = new Uint8ClampedArray(w * h * 4), colors = REGION_ITEMS.map(i => [REGION[i.key], ...cssRgb(canvas, `--region-${i.key}`)] as const), guard = settings.guard;
    if (bits && bits.length === w * h) for (let p = 0; p < w * h; p++) { const v = bits[p] ?? 0; if (!v) continue;
      for (const [bit, r, g, b] of colors) if (v & bit) { rgba[p * 4] = r; rgba[p * 4 + 1] = g; rgba[p * 4 + 2] = b; rgba[p * 4 + 3] = guard & bit ? 150 : 50; } }
    ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--feature-line').trim(); ctx.lineWidth = Math.max(1, w / 500);
    for (const face of portrait.faces) for (const ids of FEATURES) { ctx.beginPath(); ids.forEach((id, i) => { const pt = face[id]; if (pt) { if (i === 0) ctx.moveTo(pt.x * w, pt.y * h); else ctx.lineTo(pt.x * w, pt.y * h); } }); ctx.closePath(); ctx.stroke(); }
  }, [portrait, readyKey, mode, mapView, settings.guard]);

  const remember = () => { if (!portrait) return; setFuture([]); setHistory(h => [...h.slice(-29), { settings: { ...settings }, manual: new Int8Array(manual.current) }]); };
  const restore = (entry: { settings: SkinSettings; manual: Int8Array }) => { manual.current = new Int8Array(entry.manual); manualVersion.current++; setSettings({ ...entry.settings }); setPreset('Custom'); };
  const undo = () => { const previous = history.at(-1); if (!previous) return; setFuture(f => [...f, { settings: { ...settings }, manual: new Int8Array(manual.current) }]); restore(previous); setHistory(h => h.slice(0, -1)); };
  const redo = () => { const next = future.at(-1); if (!next) return; setHistory(h => [...h, { settings: { ...settings }, manual: new Int8Array(manual.current) }]); restore(next); setFuture(f => f.slice(0, -1)); };
  useEffect(() => { const key = (e: KeyboardEvent) => { if (!(e.ctrlKey || e.metaKey) || !['z', 'y'].includes(e.key.toLowerCase())) return; e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey || e.key.toLowerCase() === 'y') redo(); else undo(); }; window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true); });
  const resetSection = (section: Parameters<typeof resetSkinSection>[1]) => { remember(); if (section === 'Auto-Skin Mask') { manual.current.fill(0); manualVersion.current++; } setSettings(s => resetSkinSection(s, section)); setPreset('Custom'); };
  const retryDetection = async () => {
    if (!portrait) return; setAnalyzing(true); setError('');
    try { const { analyzePortrait } = await import('@/lib/skin-face'); const a = await analyzePortrait(portrait.canvas);
      const next = { ...portrait, key: crypto.randomUUID(), faces: a.faces, seg: a.seg, detectionError: a.error };
      void call({ type: 'release', sourceKey: portrait.key }).catch(() => undefined); await activate(next);
      toast.success(a.faces.length ? `${a.faces.length} মুখ ও বৈশিষ্ট্য শনাক্ত হয়েছে` : 'মুখ পাওয়া যায়নি');
    } catch (e) { setError(e instanceof Error ? e.message : 'মুখ শনাক্ত হয়নি'); setAnalyzing(false); }
  };
  const autoRetouch = async () => {
    if (!portrait || readyKey !== portrait.key) return;
    try { const r = await call({ type: 'suggest', sourceKey: portrait.key }); if (!r.settings) return;
      remember(); setSettings({ ...r.settings, guard: settings.guard, protect: settings.protect }); setPreset('Custom'); toast.success('AI স্টুডিও রিটাচ প্রয়োগ হয়েছে');
    } catch (e) { setError(e instanceof Error ? e.message : 'AI রিটাচ ব্যর্থ'); }
  };
  const change = (key: keyof SkinSettings, value: number | boolean) => { setSettings(s => ({ ...s, [key]: value })); setPreset('Custom'); };
  const toggleRegion = (key: RegionKey) => { remember(); const bit = REGION[key]; setSettings(s => ({ ...s, protect: true, guard: s.protect ? s.guard ^ bit : (s.guard | bit) })); setPreset('Custom'); };
  const regionOn = (key: RegionKey) => !!(settings.guard & REGION[key]) && (settings.protect || !['eyes', 'brows', 'lips'].includes(key));
  const stamp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!portrait || brush === 'off') return;
    const rect = e.currentTarget.getBoundingClientRect(), w = portrait.data.width, h = portrait.data.height;
    const x = (e.clientX - rect.left) * w / rect.width, y = (e.clientY - rect.top) * h / rect.height, r = brushSize / 2;
    for (let yy = Math.max(0, Math.floor(y - r)); yy < Math.min(h, Math.ceil(y + r)); yy++) for (let xx = Math.max(0, Math.floor(x - r)); xx < Math.min(w, Math.ceil(x + r)); xx++) if (Math.hypot(xx - x, yy - y) < r) manual.current[yy * w + xx] = brush === 'add' ? 1 : -1;
    // Preview the stroke immediately; complete protection is reapplied by the processor.
    const ctx = maskRef.current?.getContext('2d'); if (ctx) { ctx.save(); ctx.globalCompositeOperation = brush === 'add' ? 'source-over' : 'destination-out'; ctx.fillStyle = getComputedStyle(e.currentTarget).getPropertyValue('--mask-overlay'); ctx.globalAlpha = .5; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  };
  const runOnce = async (p: Portrait, s: SkinSettings, marks?: Int8Array) => {
    await loadSource(p);
    try { const r = await call({ type: 'render', sourceKey: p.key, settings: s, ...(marks ? { manual: marks } : {}), manualVersion: -1 }); if (!r.output) throw new Error('ফলাফল পাওয়া যায়নি'); return r.output; }
    finally { void call({ type: 'release', sourceKey: p.key }).catch(() => undefined); }
  };
  const applyFull = async () => {
    if (!portrait || exporting) return; setExporting(true); setError('');
    try {
      // Full-resolution output reuses the detected landmarks and AI regions.
      const full = await preparePortrait(src, 6000, { faces: portrait.faces, seg: portrait.seg });
      const output = await runOnce(full, settings, scaleManual(manual.current, portrait.data.width, portrait.data.height, full.data.width, full.data.height));
      if (mounted.current) onApply(outputUrl(output, full.data.width, full.data.height));
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'ছবি প্রয়োগ হয়নি'); } finally { if (mounted.current) setExporting(false); }
  };
  const addBatch = async (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 20 - batch.length);
    const entries = await Promise.all(selected.map(async f => ({ id: crypto.randomUUID(), name: f.name, src: await fileUrl(f), status: 'waiting' as const })));
    setBatch(items => [...items, ...entries]); setBatchOpen(true);
  };
  const runBatch = async () => {
    if (batchRunning) return; setBatchRunning(true); stopBatch.current = false; const snapshot = { ...settings };
    try {
      for (const item of batch.filter(i => i.status === 'waiting' || i.status === 'error')) {
        if (stopBatch.current || !mounted.current) break;
        setBatch(items => items.map(i => i.id === item.id ? { ...i, status: 'processing', error: undefined } : i));
        try {
          const p = await preparePortrait(item.src, 4000); if (stopBatch.current) break;
          const url = outputUrl(await runOnce(p, snapshot), p.data.width, p.data.height);
          if (mounted.current) setBatch(items => items.map(i => i.id === item.id ? { ...i, status: 'done', result: url, error: p.detectionError } : i));
        } catch (e) { if (mounted.current) setBatch(items => items.map(i => i.id === item.id ? { ...i, status: 'error', error: e instanceof Error ? e.message : 'ব্যর্থ' } : i)); }
      }
    } finally { if (mounted.current) { setBatch(items => items.map(i => i.status === 'processing' ? { ...i, status: 'waiting' } : i)); setBatchRunning(false); } }
  };
  const downloadPreset = () => { const name = `Custom ${Object.keys(customPresets).length + 1}`; setCustomPresets(p => ({ ...p, [name]: { ...settings } })); setPreset(name); const url = URL.createObjectURL(new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })); saveUrl(url, 'skin-preset.json'); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const loadPreset = async (f?: File) => { if (!f) return; try { const s = parseSkinPreset(JSON.parse(await f.text())); remember(); const name = f.name.replace(/\.json$/, ''); setCustomPresets(p => ({ ...p, [name]: s })); setSettings(s); setPreset(name); } catch { toast.error('সঠিক রিটাচ প্রিসেট দিন'); } };

  const renderPhoto = (before: boolean) => <div className="relative flex shrink-0 items-center justify-center shadow-2xl" style={{ width: dimensions.w * zoom, height: dimensions.h * zoom, transform: `translate(${pan.x}px, ${pan.y}px)` }}>
    <canvas ref={before ? beforeRef : afterRef} aria-label={before ? 'Before portrait' : 'After portrait'} className="skin-photo block h-full w-full" />
    <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2.5 py-0.5 text-[11px] font-medium backdrop-blur">{before ? 'Before' : 'After'}</span>
    {!before && mapView && <canvas ref={mapRef} aria-label="AI detected regions" className="skin-photo pointer-events-none absolute inset-0 h-full w-full" />}
    {!before && <canvas ref={maskRef} aria-label="Skin mask refinement" className={`skin-photo absolute inset-0 h-full w-full ${maskView ? 'opacity-100' : 'opacity-0'} ${brush === 'off' ? 'pointer-events-none' : 'cursor-crosshair'}`}
      onPointerDown={e => { if (brush === 'off') return; e.stopPropagation(); remember(); painting.current = true; e.currentTarget.setPointerCapture(e.pointerId); stamp(e); }}
      onPointerMove={e => { if (painting.current) stamp(e); }}
      onPointerUp={() => { if (painting.current) { painting.current = false; rerender(); } }} onPointerCancel={() => { painting.current = false; rerender(); }} />}
  </div>;

  const status = analyzing ? 'AI মুখ, চুল ও পোশাক বিশ্লেষণ করছে…'
    : portrait?.detectionError ?? (summary?.faces ? `${summary.faces} মুখ শনাক্ত${summary.segmented ? ' · AI সেগমেন্টেশন সক্রিয়' : ''}` : 'মুখ পাওয়া যায়নি — রঙভিত্তিক মাস্ক');

  return <div role="dialog" aria-modal="true" aria-label="MBT EDIT — AI Portrait Studio" className="skin-workspace fixed inset-0 z-[70] flex flex-col bg-background text-foreground">
    <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-card px-3 py-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground"><ScanFace className="size-4" /></span>AI Portrait Studio <span className="hidden font-normal text-muted-foreground sm:inline">/ Skin Retouch</span></h2>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="icon" title="Undo (Ctrl+Z)" aria-label="রিটাচ আনডু" disabled={!history.length || exporting} onClick={undo}><Undo2 /></Button>
        <Button variant="ghost" size="icon" title="Redo (Ctrl+Y)" aria-label="রিটাচ রিডু" disabled={!future.length || exporting} onClick={redo}><Redo2 /></Button>
        <Button variant="ghost" size="icon" title="Reset all" aria-label="রিটাচ রিসেট" disabled={!portrait || exporting} onClick={() => { remember(); manual.current.fill(0); manualVersion.current++; setSettings({ ...DEFAULT_SKIN }); setPreset('Natural'); }}><RotateCcw /></Button>
        <Button variant="secondary" size="sm" disabled={exporting || batchRunning} onClick={() => setBatchOpen(v => !v)}><FolderPlus />Batch <span>{batch.length || ''}</span></Button>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={exporting || batchRunning}><X />Cancel</Button>
        <Button size="sm" onClick={applyFull} disabled={!portrait || processing || exporting || batchRunning}>{exporting ? <Loader2 className="animate-spin" /> : <Check />}মেইন ছবিতে প্রয়োগ করুন</Button>
      </div>
    </header>
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="hidden w-36 shrink-0 overflow-y-auto border-r bg-card xl:block">
        <h3 className="border-b bg-secondary/50 px-2 py-2 text-xs font-semibold">Navigator</h3>
        <Button variant="ghost" className="m-2 h-auto w-[calc(100%-1rem)] p-0" title="Fit portrait" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><img src={src} alt="Portrait navigator" className="max-h-40 w-full object-contain" /></Button>
        <h3 className="border-y bg-secondary/50 px-2 py-2 text-xs font-semibold">History</h3>
        <Button variant="ghost" size="sm" className="w-full justify-start rounded-none" onClick={() => { remember(); manual.current.fill(0); manualVersion.current++; setSettings({ ...DEFAULT_SKIN, amount: 0, eyeBags: 0, evenness: 0, redness: 0, yellow: 0 }); setPreset('Custom'); }}>Open</Button>
        {history.map((entry, index) => <Button key={index} variant="ghost" size="sm" className="w-full justify-start rounded-none text-xs" onClick={() => { restore(entry); setHistory(h => h.slice(0, index)); }}>Retouch {index + 1}</Button>)}
      </aside>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={viewRef} className="relative flex min-h-[220px] flex-1 items-center justify-center gap-2 overflow-hidden bg-canvas"
          onPointerDown={e => { if (brush !== 'off') return; e.currentTarget.setPointerCapture(e.pointerId); setPanAnchor({ x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y }); }}
          onPointerMove={e => { if (panAnchor) setPan({ x: panAnchor.ox + e.clientX - panAnchor.x, y: panAnchor.oy + e.clientY - panAnchor.y }); }}
          onPointerUp={() => setPanAnchor(null)} onPointerCancel={() => setPanAnchor(null)}>
          {portrait ? <>{mode !== 'after' && renderPhoto(true)}{mode !== 'before' && renderPhoto(false)}</> : <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-7 animate-spin text-primary" />AI বিশ্লেষণ চলছে…</div>}
          {portrait && <span className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-background/90 px-3 py-1 text-xs backdrop-blur" aria-live="polite">
            {processing || analyzing ? <><Loader2 className="size-3 animate-spin" />{analyzing ? 'AI বিশ্লেষণ…' : 'রিটাচ হচ্ছে…'}</> : <><Zap className="size-3 text-primary" />Live · {renderMs} ms</>}
          </span>}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-card px-2 py-1">
          <div className="flex items-center gap-1">
            <Button size="icon" variant={mode === 'before' ? 'default' : 'ghost'} title="Before" aria-label="Before view" onClick={() => setMode('before')}><Eye /></Button>
            <Button size="icon" variant={mode === 'split' ? 'default' : 'ghost'} title="Before / After" aria-label="Before After view" onClick={() => setMode('split')}><Columns2 /></Button>
            <Button size="icon" variant={mode === 'after' ? 'default' : 'ghost'} title="After" aria-label="After view" onClick={() => setMode('after')}><SlidersHorizontal /></Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button size="sm" variant={mapView ? 'default' : 'ghost'} title="AI region map" aria-pressed={mapView} onClick={() => { setMapView(v => !v); setMaskView(false); }}><Layers />AI Map</Button>
            <Button size="sm" variant={maskView ? 'default' : 'ghost'} title="Skin mask" aria-pressed={maskView} onClick={() => { setMaskView(v => !v); setMapView(false); }}><Eye />Mask</Button>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <Button size="icon" variant="ghost" title="Fit" aria-label="Fit portrait" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Maximize /></Button>
            <Button size="icon" variant="ghost" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(.25, z / 1.25))}><ZoomOut /></Button>
            <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <Button size="icon" variant="ghost" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(8, z * 1.25))}><ZoomIn /></Button>
          </div>
        </footer>
      </section>
      <aside className="max-h-[45vh] w-full shrink-0 overflow-y-auto border-t bg-card md:max-h-none md:w-[310px] md:border-l md:border-t-0">
        <section aria-label="AI Face Analysis" className="space-y-3 border-b p-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="size-4 text-primary" />AI Face Analysis</h3>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={analyzing || !portrait} onClick={() => void retryDetection()}>{analyzing ? <Loader2 className="animate-spin" /> : <ScanFace />}AI Detect</Button>
          </div>
          <p className="text-[11px] text-muted-foreground" aria-live="polite">{status}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {REGION_ITEMS.map(item => { const found = detected(summary, item.key), on = regionOn(item.key);
              return <button key={item.key} type="button" aria-pressed={on} disabled={analyzing} onClick={() => toggleRegion(item.key)}
                title={on ? 'সুরক্ষিত — এখানে রিটাচ লাগবে না' : 'সুরক্ষা বন্ধ — রিটাচ লাগবে'}
                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${on ? 'border-primary/60 bg-primary/10' : 'bg-background/40 opacity-70'} ${found ? '' : 'text-muted-foreground'}`}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--region-${item.key})` }} />
                <span className="min-w-0 flex-1 truncate">{regionLabel(summary, item.key, item.label)}</span>
                {found ? <Check className="size-3 text-primary" aria-label="শনাক্ত" /> : <span className="text-[10px]">—</span>}
                {on && <Shield className="size-3 text-muted-foreground" aria-label="সুরক্ষিত" />}
              </button>; })}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" disabled={processing || analyzing} onClick={() => void autoRetouch()}><Wand2 />AI Studio Retouch</Button>
            <Button size="sm" variant="secondary" onClick={() => { setMapView(v => !v); setMaskView(false); }}><Layers />{mapView ? 'Map বন্ধ' : 'AI Map দেখুন'}</Button>
          </div>
        </section>
        <div className="flex items-center gap-1 border-b p-2">
          <Select value={preset} onValueChange={v => { const p = SKIN_PRESETS[v] ?? customPresets[v]; if (p) { remember(); setSettings({ ...p, guard: settings.guard }); setPreset(v); } }}><SelectTrigger className="h-8 min-w-0 flex-1 text-xs"><SelectValue /></SelectTrigger><SelectContent>{[...Object.keys(SKIN_PRESETS), ...Object.keys(customPresets)].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}{preset === 'Custom' && <SelectItem value="Custom">Custom</SelectItem>}</SelectContent></Select>
          <Button variant="ghost" size="icon" title="Save custom preset" aria-label="Save custom preset" onClick={downloadPreset}><Save /></Button>
          <Button variant="ghost" size="icon" title="Import preset" aria-label="Import preset" onClick={() => presetInput.current?.click()}><FolderPlus /></Button>
          <input ref={presetInput} type="file" accept=".json" className="hidden" onChange={e => { void loadPreset(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <details open className="border-b">
          <summary className="cursor-pointer bg-secondary/50 px-3 py-2 text-xs font-semibold"><span className="inline-flex w-[calc(100%-1rem)] items-center justify-between">Auto-Skin Mask<Button variant="ghost" size="icon" className="size-6" title="Reset Auto-Skin Mask" aria-label="Reset Auto-Skin Mask" onClick={e => { e.preventDefault(); resetSection('Auto-Skin Mask'); }}><RotateCcw className="size-3" /></Button></span></summary>
          <div className="space-y-3 p-3">
            <div className="skin-spectrum h-6 rounded border" />
            {(['tolerance', 'feather', 'opacity'] as const).map(k => <SkinSlider key={k} label={{ tolerance: 'Tolerance', feather: 'Feather', opacity: 'Opacity' }[k]} value={settings[k]} onStart={remember} onChange={v => change(k, v)} />)}
            <div className="flex items-center gap-1">
              <span className="mr-auto text-[11px] text-muted-foreground">Refine</span>
              <Button size="icon" variant={brush === 'add' ? 'default' : 'ghost'} title="Add skin mask" aria-label="Add skin mask" onClick={() => { setBrush(brush === 'add' ? 'off' : 'add'); setMaskView(true); setMapView(false); setMode('after'); }}><Paintbrush /></Button>
              <Button size="icon" variant={brush === 'subtract' ? 'default' : 'ghost'} title="Subtract skin mask" aria-label="Subtract skin mask" onClick={() => { setBrush(brush === 'subtract' ? 'off' : 'subtract'); setMaskView(true); setMapView(false); setMode('after'); }}><Eraser /></Button>
              <Button size="icon" variant="ghost" title="Reset mask" aria-label="Reset skin mask" onClick={() => { remember(); manual.current.fill(0); rerender(); }}><RotateCcw /></Button>
            </div>
            {brush !== 'off' && <SkinSlider label="Brush size" value={brushSize} min={4} max={180} onChange={setBrushSize} />}
          </div>
        </details>
        <SkinGroup title="Skin Details" fields={[
          ['amount', 'Smoothing amount'], ['fine', 'Fine'], ['medium', 'Medium'], ['coarse', 'Coarse'], ['texture', 'Preserve texture'], ['detail', 'Detail clarity'],
        ]} settings={settings} change={change} remember={remember} reset={() => resetSection('Skin Details')} />
        <SkinGroup title="Skin Imperfections" fields={[
          ['eyeBags', 'Reduce eye bags'], ['evenness', 'Even skin tone'], ['redness', 'Redness correction'], ['yellow', 'Yellow correction'], ['blemishes', 'Blemish reduction'], ['darkSpots', 'Dark spot reduction'],
        ]} settings={settings} change={change} remember={remember} reset={() => resetSection('Skin Imperfections')} />
        <SkinGroup title="Skin Tone" fields={[
          ['brightness', 'Brightness'], ['contrast', 'Contrast'], ['warmth', 'Warmth'], ['shadows', 'Shadows'], ['highlights', 'Highlights'], ['hue', 'Hue'], ['saturation', 'Saturation'],
        ]} settings={settings} change={change} remember={remember} reset={() => resetSection('Skin Tone')} signed />
        <div className="space-y-1 p-3 text-[10px] text-muted-foreground"><p>Output: sRGB PNG · 8-bit/channel</p><p>Float32 রিটাচ গণনা · সর্বোচ্চ 6000px (Batch 4000px)</p></div>
      </aside>
    </div>
    {error && <div role="alert" className="border-t bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
    {batchOpen && <section className="max-h-[38vh] shrink-0 overflow-y-auto border-t bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"><h3 className="text-sm font-semibold">Batch Retouch <span className="text-xs font-normal text-muted-foreground">{batch.filter(i => i.status === 'done').length}/{batch.length}</span></h3>
        <div className="flex items-center gap-2"><input ref={batchInput} type="file" multiple accept="image/*" className="hidden" onChange={e => { void addBatch(e.target.files); e.target.value = ''; }} /><Button size="sm" variant="secondary" disabled={batchRunning || batch.length >= 20} onClick={() => batchInput.current?.click()}><FolderPlus />ছবি যোগ করুন</Button>
          <Button size="sm" disabled={!batch.some(i => i.status === 'waiting' || i.status === 'error') || batchRunning || exporting} onClick={() => void runBatch()}><SlidersHorizontal />একই সেটিংসে রিটাচ</Button>
          {batchRunning && <Button size="sm" variant="secondary" onClick={() => { stopBatch.current = true; }}>Stop</Button>}
          <Button size="icon" variant="ghost" aria-label="Close batch" disabled={batchRunning} onClick={() => setBatchOpen(false)}><X /></Button></div>
      </div>
      <div className="flex gap-3 overflow-x-auto px-3 pb-3">{batch.map(item => <div key={item.id} className="flex w-36 shrink-0 flex-col gap-1 border bg-background p-2"><img src={item.result ?? item.src} alt={item.name} className="h-20 w-full object-contain" /><span className="truncate text-xs" title={item.name}>{item.name}</span><span className="text-[10px] text-muted-foreground">{{ waiting: 'অপেক্ষায়', processing: 'রিটাচ হচ্ছে…', done: 'সম্পূর্ণ', error: 'ব্যর্থ' }[item.status]}</span>{item.error && <span className="text-[10px] text-destructive">{item.error}</span>}<div className="flex justify-between"><Button size="icon" variant="ghost" disabled={!item.result} title="Download PNG" aria-label={`Download ${item.name}`} onClick={() => { if (item.result) saveUrl(item.result, `retouched-${item.name.replace(/\.[^.]+$/, '')}.png`); }}><Download /></Button><Button size="icon" variant="ghost" disabled={batchRunning} title="Remove" aria-label={`Remove ${item.name}`} onClick={() => setBatch(items => items.filter(i => i.id !== item.id))}><X /></Button></div></div>)}</div>
    </section>}
  </div>;
}
function SkinSlider({ label, value, min = 0, max = 100, onStart, onChange }: { label: string; value: number; min?: number; max?: number; onStart?: () => void; onChange: (v: number) => void }) {
  return <div className="grid grid-cols-[108px_1fr_28px] items-center gap-2"><label className="text-[11px] text-muted-foreground">{label}</label><Slider aria-label={label} value={[value]} min={min} max={max} onPointerDown={onStart} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) onStart?.(); }} onValueChange={v => { const n = v[0]; if (n !== undefined) onChange(n); }} /><output className="text-right text-[10px] tabular-nums">{value}</output></div>;
}
function SkinGroup({ title, fields, settings, change, remember, reset, signed = false }: { title: string; fields: [Exclude<keyof SkinSettings, 'protect' | 'guard'>, string][]; settings: SkinSettings; change: (key: keyof SkinSettings, v: number) => void; remember: () => void; reset: () => void; signed?: boolean }) {
  return <details open className="border-b"><summary className="cursor-pointer bg-secondary/50 px-3 py-2 text-xs font-semibold"><span className="inline-flex w-[calc(100%-1rem)] items-center justify-between">{title}<Button variant="ghost" size="icon" className="size-6" title={`Reset ${title}`} aria-label={`Reset ${title}`} onClick={e => { e.preventDefault(); reset(); }}><RotateCcw className="size-3" /></Button></span></summary><div className="space-y-3 p-3">{fields.map(([key, label]) => <SkinSlider key={key} label={label} value={settings[key]} min={signed ? -100 : 0} onStart={remember} onChange={v => change(key, v)} />)}</div></details>;
}
