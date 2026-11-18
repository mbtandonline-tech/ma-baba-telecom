import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Aperture, Camera, ChevronDown, Columns2, Copy, Crop, Download, ExternalLink, FlipHorizontal, FolderOpen,
  Expand, HelpCircle, ImagePlus, Loader2, Maximize, Minus, Move, Palette, Plus, Printer, Redo2, RotateCcw,
  RotateCw, Save, SlidersHorizontal, Sparkles, Undo2, Wand2, ZoomIn, ZoomOut, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { aiEditPhoto } from "@/lib/ai-photo.functions";
import { PrintPreview } from "@/components/print-preview/print-preview";
import { ProEditor } from "@/components/pro-editor/pro-editor";
import { SkinEditor } from "@/components/pro-editor/skin-editor";
import { AI_PROMPTS, BG_COLORS, PAPERS, PHOTO_SIZES, THEMES, blueBgPrompt } from "@/lib/photo-presets";
import {
  DEFAULT_ADJUST, DEFAULT_FRAME, layoutSheet, loadImage, mmToPx, renderPhoto, renderSheet, toUploadDataUrl,
  type Adjust, type Frame,
} from "@/lib/render";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MBT EDIT — AI পাসপোর্ট ও ভিসা ছবি মেকার" },
      { name: "description", content: "AI প্রম্পট দিয়ে পাসপোর্ট, ভিসা, স্ট্যাম্প সাইজ ছবি বানান, এডিট করুন ও A4 শিটে প্রিন্ট করুন।" },
      { property: "og:title", content: "MBT EDIT — AI পাসপোর্ট ও ভিসা ছবি মেকার" },
      { property: "og:description", content: "এক ক্লিকে পাসপোর্ট সাইজ ছবি, ব্যাকগ্রাউন্ড পরিবর্তন ও প্রিন্ট শিট।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

type Snap = { src: string | null; photoId: string | null; adj: Adjust; frame: Frame; bg: string };
const INIT: Snap = { src: null, photoId: null, adj: DEFAULT_ADJUST, frame: DEFAULT_FRAME, bg: "#FFFFFF" };
const RETOUCH: Record<string, Partial<Adjust>> = {
  light: { smooth: 20, brightness: 3, contrast: 4, saturation: 4, sharpness: 10 },
  natural: { smooth: 40, brightness: 5, contrast: 8, saturation: 8, sharpness: 18 },
  strong: { smooth: 65, brightness: 8, contrast: 12, saturation: 10, sharpness: 28 },
};

function useImg(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return setImg(null);
    let on = true;
    loadImage(src).then((i) => on && setImg(i));
    return () => { on = false; };
  }, [src]);
  return img;
}

const readFile = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(f);
  });

function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

function Studio() {
  const [s, setS] = useState<Snap>(INIT);
  const committed = useRef<Snap>(INIT);
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const [original, setOriginal] = useState<string | null>(null);
  const [second, setSecond] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [theme, setTheme] = useState("ocean");
  const [help, setHelp] = useState(false);
  const [printPreview, setPrintPreview] = useState<"closed" | "open" | "minimized">("closed");
  const [proOpen, setProOpen] = useState(false);
  const [skinOpen, setSkinOpen] = useState(false);

  const [sizeId, setSizeId] = useState("passport-15x19");
  const [custom, setCustom] = useState({ w: 40, h: 50 });
  const [paperId, setPaperId] = useState("a4");
  const [copies, setCopies] = useState(8);
  const [cols, setCols] = useState(4);
  const [fill, setFill] = useState(false);
  const [orient, setOrient] = useState<"auto" | "portrait" | "landscape">("auto");
  const [border, setBorder] = useState(0);
  const [cutLines, setCutLines] = useState(true);
  const [label, setLabel] = useState({ name: "", date: "" });

  const [promptId, setPromptId] = useState("blue");
  const [promptText, setPromptText] = useState(AI_PROMPTS[0]!.prompt);
  const [busy, setBusy] = useState(false);
  const ai = useServerFn(aiEditPhoto);

  const img = useImg(s.src);
  const origImg = useImg(original);

  useEffect(() => {
    const t = localStorage.getItem("eo-theme");
    if (t) setTheme(t);
  }, []);
  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
    localStorage.setItem("eo-theme", theme);
  }, [theme]);

  const apply = useCallback((patch: Partial<Snap>) => {
    setS((cur) => {
      const next = { ...cur, ...patch };
      setPast((p) => [...p.slice(-40), committed.current]);
      setFuture([]);
      committed.current = next;
      return next;
    });
  }, []);
  const live = (patch: Partial<Snap>) => setS((c) => ({ ...c, ...patch }));
  const undo = () => {
    if (!past.length) return;
    const prev = past[past.length - 1]!;
    setPast(past.slice(0, -1));
    setFuture([committed.current, ...future]);
    committed.current = prev;
    setS(prev);
  };
  const redo = () => {
    if (!future.length) return;
    const [n, ...rest] = future;
    if (!n) return;
    setPast([...past, committed.current]);
    setFuture(rest);
    committed.current = n;
    setS(n);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (skinOpen || proOpen || !(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if (e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const size = sizeId === "custom" ? custom : PHOTO_SIZES.find((p) => p.id === sizeId)!;
  const paper = PAPERS.find((p) => p.id === paperId)!;
  const layout = useMemo(() => layoutSheet(paper.w, paper.h, size.w, size.h, orient), [paper, size.w, size.h, orient]);
  const useCols = fill ? layout.cols : Math.min(cols, layout.cols);
  const count = fill ? layout.perSheet : Math.min(copies, useCols * layout.rows);

  const openFile = async (f?: File | null, slot: "main" | "second" = "main") => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("শুধু ছবি ফাইল দিন"); return; }
    const url = await readFile(f);
    if (slot === "second") return setSecond(url);
    setOriginal(url);
    apply({ src: url, photoId: crypto.randomUUID(), adj: DEFAULT_ADJUST, frame: DEFAULT_FRAME });
    toast.success("ছবি লোড হয়েছে");
  };

  const runAi = async (prompt: string, needsTwo = false) => {
    if (!img) { toast.error("আগে একটি ছবি খুলুন"); return; }
    if (needsTwo && !second) { toast.error("জোড়া ছবির জন্য দ্বিতীয় ছবি যোগ করুন"); return; }
    setBusy(true);
    try {
      const src = origImg ?? img;
      // Workers AI requires input images < 512x512
      const images = [toUploadDataUrl(src, 500)];
      if (needsTwo && second) images.push(toUploadDataUrl(await loadImage(second), 500));
      // output aspect matches the source photo, longest side 1024
      const k = 1024 / Math.max(src.naturalWidth, src.naturalHeight);
      const width = Math.max(256, Math.min(1920, Math.round(src.naturalWidth * k)));
      const height = Math.max(256, Math.min(1920, Math.round(src.naturalHeight * k)));
      const r = await ai({ data: { images, prompt, width, height } });
      if (r.error || !r.image) throw new Error(r.error);
      apply({ src: r.image, frame: DEFAULT_FRAME });
      toast.success("AI ছবি তৈরি হয়েছে!");
    } catch (e) {
      toast.error((e as Error).message || "AI ব্যর্থ হয়েছে");
    } finally {
      setBusy(false);
    }
  };

  const photoCanvas = useCallback(
    (dpi = 300) =>
      img
        ? renderPhoto(img, mmToPx(size.w, dpi), mmToPx(size.h, dpi), s.adj, s.frame, s.bg, {
            label, border: mmToPx(border * 0.1, dpi), borderColor: "#000",
          })
        : null,
    [img, size.w, size.h, s.adj, s.frame, s.bg, label, border],
  );

  // print preview (low dpi for speed)
  const [sheetUrl, setSheetUrl] = useState<string>("");
  useEffect(() => {
    const t = setTimeout(() => {
      const c = renderSheet(photoCanvas(90), layout, size.w, size.h, count, useCols, 90, 5, 2, cutLines);
      setSheetUrl(c.toDataURL("image/jpeg", 0.85));
    }, 120);
    return () => clearTimeout(t);
  }, [photoCanvas, layout, size.w, size.h, count, useCols, cutLines]);

  const fullSheet = () => renderSheet(photoCanvas(300), layout, size.w, size.h, count, useCols, 300, 5, 2, cutLines);

  const [printPhoto, setPrintPhoto] = useState<{ id: string; photo: string } | null>(null);
  const addedPhotos = useRef(new Set<string>());
  const addToPrintPreview = () => {
    if (!s.photoId || !img || img.src !== s.src) return;
    const photo = photoCanvas(300)?.toDataURL("image/png");
    if (!photo) return;
    addedPhotos.current.add(s.photoId);
    setPrintPhoto({ id: s.photoId, photo });
    setPrintPreview("open");
  };
  useEffect(() => {
    const id = s.photoId;
    if (printPreview === "closed" || !id || !addedPhotos.current.has(id) || img?.src !== s.src) return;
    const timer = setTimeout(() => {
      const photo = photoCanvas(300)?.toDataURL("image/png");
      if (photo) setPrintPhoto({ id, photo });
    }, 180);
    return () => clearTimeout(timer);
  }, [photoCanvas, printPreview, s.photoId, s.src, img]);

  const printSheet = () => {
    if (!img) { toast.error("আগে ছবি খুলুন"); return; }
    const url = fullSheet().toDataURL("image/png");
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;width:0;height:0;border:0";
    document.body.appendChild(f);
    const d = f.contentDocument!;
    d.write(`<html><head><style>@page{size:${layout.paperW}mm ${layout.paperH}mm;margin:0}body{margin:0}img{width:${layout.paperW}mm;height:${layout.paperH}mm;display:block}</style></head><body><img src="${url}"></body></html>`);
    d.close();
    f.contentWindow!.onload = () => { f.contentWindow!.print(); setTimeout(() => f.remove(), 1500); };
  };

  const resetAll = () => {
    apply({ ...INIT, src: original, photoId: s.photoId });
    setLabel({ name: "", date: "" });
  };

  return (
    <div className="flex h-screen min-h-[640px] flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <div className="glow flex items-center gap-2 rounded-lg border border-primary/60 px-3 py-1.5 font-display text-lg font-semibold text-primary">
            <Aperture className="size-5" /> MBT EDIT
          </div>
          <span className="hidden text-xs text-muted-foreground md:inline">AI পাসপোর্ট ছবি স্টুডিও</span>
        </div>
        <div className="flex items-center gap-1">
          <TopBtn icon={<Undo2 />} label="Undo" onClick={undo} disabled={!past.length} />
          <TopBtn icon={<Redo2 />} label="Redo" onClick={redo} disabled={!future.length} />
          <TopBtn icon={<Columns2 />} label="Compare" onClick={() => setCompare((v) => !v)} active={compare} disabled={!original} />
          <TopBtn icon={<RotateCcw />} label="Reset" onClick={resetAll} disabled={!original} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm"><Palette /> <span className="hidden sm:inline">থিম</span></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {THEMES.map((t) => (
                <DropdownMenuItem key={t.id} onClick={() => setTheme(t.id)}>
                  <span className="size-3.5 rounded-full" style={{ background: t.color }} /> {t.label}
                  {theme === t.id && <span className="ml-auto text-primary">✓</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <TopBtn icon={<HelpCircle />} label="Help" onClick={() => setHelp(true)} />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 gap-3 overflow-y-auto p-3 lg:auto-rows-auto lg:grid-cols-[340px_1fr_380px] lg:overflow-hidden">
        {/* LEFT */}
        <aside className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">
          <Panel title="Photo" color="var(--panel-photo)">
            <div className="grid grid-cols-2 gap-2">
              <FileBtn icon={<FolderOpen />} label="Open Photo" onFile={(f) => openFile(f)} />
              <FileBtn icon={<Camera />} label="From Phone" capture onFile={(f) => openFile(f)} />
            </div>
            <Button
              variant="outline"
              className="w-full border-primary/50 text-primary"
              disabled={busy || !img}
              onClick={() => runAi(blueBgPrompt(s.bg.replace("#", "")).replace("1.5x1.9 inch", `${size.w}x${size.h} mm`))}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Wand2 />} AI দিয়ে ব্যাকগ্রাউন্ড বদলান
            </Button>
            <Button
              variant="outline"
              className="w-full border-primary/50 text-primary"
              disabled={!img || busy}
              onClick={() => setProOpen(true)}
            >
              <SlidersHorizontal /> প্রো এডিটর (Curve · Levels · Heal · Crop)
            </Button>
            <Button className="w-full" disabled={!img || busy} onClick={() => setSkinOpen(true)}>
              <Sparkles /> ফটো টুলবক্স · Skin Retouch
            </Button>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Background Colour</p>
              <div className="flex flex-wrap gap-1.5">
                {BG_COLORS.map((c) => (
                  <button
                    key={c}
                    aria-label={`ব্যাকগ্রাউন্ড ${c}`}
                    onClick={() => apply({ bg: c })}
                    className={`size-6 rounded-full border-2 transition-transform hover:scale-110 ${s.bg === c ? "border-foreground ring-2 ring-primary" : "border-border"}`}
                    style={{ background: c }}
                  />
                ))}
                <label className="relative size-6 cursor-pointer overflow-hidden rounded-full border-2 border-border" style={{ background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" }}>
                  <input type="color" className="absolute inset-0 opacity-0" value={s.bg} onChange={(e) => apply({ bg: e.target.value.toUpperCase() })} />
                </label>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">রং বাছাই করে উপরের AI বাটনে চাপ দিন — ব্যাকগ্রাউন্ড ওই রঙে হবে।</p>
            </div>
          </Panel>

          <Panel title="AI প্রম্পট স্টুডিও" color="var(--panel-ai)" icon={<Sparkles className="size-4" />}>
            <div className="grid grid-cols-2 gap-2">
              {AI_PROMPTS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setPromptId(p.id); setPromptText(p.prompt); }}
                  className={`rounded-lg border p-2 text-left transition-colors ${promptId === p.id ? "border-primary bg-primary/15" : "hover:bg-accent"}`}
                >
                  <div className="text-sm font-semibold leading-tight">{p.title}</div>
                  <div className="text-[11px] text-muted-foreground">{p.hint}</div>
                </button>
              ))}
            </div>
            <Textarea value={promptText} onChange={(e) => setPromptText(e.target.value)} rows={4} className="text-xs" />
            {AI_PROMPTS.find((p) => p.id === promptId)?.needsTwo && (
              <div className="flex items-center gap-2 rounded-lg border border-dashed p-2">
                {second ? (
                  <>
                    <img src={second} alt="দ্বিতীয় ছবি" className="size-12 rounded object-cover" />
                    <span className="flex-1 text-xs">দ্বিতীয় ছবি (স্ত্রী) যোগ হয়েছে</span>
                    <Button size="icon" variant="ghost" onClick={() => setSecond(null)} aria-label="সরান"><X /></Button>
                  </>
                ) : (
                  <FileBtn icon={<ImagePlus />} label="দ্বিতীয় ছবি দিন" variant="outline" onFile={(f) => openFile(f, "second")} />
                )}
              </div>
            )}
            <Button className="w-full" disabled={busy || !img} onClick={() => runAi(promptText, AI_PROMPTS.find((p) => p.id === promptId)?.needsTwo)}>
              {busy ? <><Loader2 className="animate-spin" /> তৈরি হচ্ছে…</> : <><Sparkles /> AI দিয়ে ছবি তৈরি করুন</>}
            </Button>
            <div className="grid grid-cols-3 gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(promptText); toast.success("প্রম্পট কপি হয়েছে"); }}><Copy /> কপি</Button>
              <Button size="sm" variant="secondary" asChild><a href="https://gemini.google.com/app" target="_blank" rel="noreferrer"><ExternalLink /> Gemini</a></Button>
              <Button size="sm" variant="secondary" asChild><a href="https://chatgpt.com/" target="_blank" rel="noreferrer"><ExternalLink /> ChatGPT</a></Button>
            </div>
            <p className="text-[11px] text-muted-foreground">ফ্রি উপায়: প্রম্পট কপি করে Gemini/ChatGPT-এ ছবিসহ দিন, তৈরি ছবি ডাউনলোড করে “Open Photo” দিয়ে খুলুন।</p>
          </Panel>

          <Panel title="Enhance" color="var(--panel-enhance)">
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-2">
              <p className="mb-2 text-center text-sm font-semibold">Auto Retouch</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(["light", "natural", "strong"] as const).map((k) => (
                  <Button key={k} size="sm" variant="secondary" disabled={!img} onClick={() => apply({ adj: { ...s.adj, ...RETOUCH[k] } })} className="capitalize">{k}</Button>
                ))}
              </div>
            </div>
            {([
              ["smooth", "Skin Smooth", 0, 100],
              ["brightness", "Brightness", -100, 100],
              ["contrast", "Contrast", -100, 100],
              ["saturation", "Saturation", -100, 100],
              ["warmth", "Warmth", -100, 100],
              ["sharpness", "Sharpness", 0, 100],
            ] as const).map(([k, l, min, max]) => (
              <SliderRow
                key={k} label={l} min={min} max={max} value={s.adj[k]}
                onChange={(v) => live({ adj: { ...s.adj, [k]: v } })}
                onCommit={(v) => apply({ adj: { ...s.adj, [k]: v } })}
                onReset={() => apply({ adj: { ...s.adj, [k]: 0 } })}
              />
            ))}
          </Panel>

          <Panel title="Crop & Frame" color="var(--panel-crop)">
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">Photo Size</span>
              <Select value={sizeId} onValueChange={setSizeId}>
                <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>{PHOTO_SIZES.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {sizeId === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" min={10} max={200} value={custom.w} onChange={(e) => setCustom({ ...custom, w: Math.max(10, +e.target.value || 10) })} aria-label="প্রস্থ (mm)" />
                <Input type="number" min={10} max={200} value={custom.h} onChange={(e) => setCustom({ ...custom, h: Math.max(10, +e.target.value || 10) })} aria-label="উচ্চতা (mm)" />
              </div>
            )}
            <div className="grid grid-cols-3 gap-1.5">
              <Button size="sm" variant="secondary" disabled={!img} onClick={() => apply({ frame: DEFAULT_FRAME })}><Maximize /> Auto Fit</Button>
              <Button size="sm" variant="secondary" disabled={!img} onClick={() => apply({ frame: { ...s.frame, rotate: (s.frame.rotate + 90) % 360 } })}><RotateCw /> Turn</Button>
              <Button size="sm" variant="secondary" disabled={!img} onClick={() => apply({ frame: { ...s.frame, flip: !s.frame.flip } })}><FlipHorizontal /> Flip</Button>
            </div>
            <SliderRow label="Straighten" min={-15} max={15} step={0.5} value={s.frame.straighten}
              onChange={(v) => live({ frame: { ...s.frame, straighten: v } })}
              onCommit={(v) => apply({ frame: { ...s.frame, straighten: v } })}
              onReset={() => apply({ frame: { ...s.frame, straighten: 0 } })} />
            <SliderRow label="Head Size" min={50} max={300} value={Math.round(s.frame.zoom * 100)}
              onChange={(v) => live({ frame: { ...s.frame, zoom: v / 100 } })}
              onCommit={(v) => apply({ frame: { ...s.frame, zoom: v / 100 } })}
              onReset={() => apply({ frame: { ...s.frame, zoom: 1 } })} />
            <details className="group rounded-lg border p-2">
              <summary className="flex cursor-pointer items-center gap-1 text-sm"><ChevronDown className="size-4 transition-transform group-open:rotate-180" /> Name &amp; Date (Optional)</summary>
              <div className="mt-2 grid gap-2">
                <Input placeholder="নাম" value={label.name} onChange={(e) => setLabel({ ...label, name: e.target.value })} />
                <Input type="date" value={label.date} onChange={(e) => setLabel({ ...label, date: e.target.value })} />
              </div>
            </details>
          </Panel>
        </aside>

        {/* CENTER */}
        <main className="flex min-h-[520px] flex-col gap-3 lg:min-h-0">
          <Workspace
            img={img} origImg={origImg} compare={compare} snap={s} size={size} label={label} border={border}
            onLive={(f) => live({ frame: f })} onCommit={(f) => apply({ frame: f })} busy={busy}
            onFile={(f) => openFile(f)}
          />
        </main>

        {/* RIGHT */}
        <aside className="flex min-h-0 flex-col lg:overflow-y-auto">
          <Panel title="Print Preview" color="var(--panel-print)" className="flex-1">
            <Button disabled={!img || busy} className="w-full" onClick={addToPrintPreview}><ImagePlus /> Print Preview এ যোগ করুন</Button>
            <Select value={paperId} onValueChange={setPaperId}>
              <SelectTrigger className="h-9 font-semibold"><SelectValue /></SelectTrigger>
              <SelectContent>{PAPERS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              <Stepper label="COPIES" value={count} onChange={(v) => { setFill(false); setCopies(Math.max(1, v)); }} />
              <Stepper label="COLUMNS" value={useCols} onChange={(v) => { setFill(false); setCols(Math.max(1, Math.min(layout.cols, v))); }} />
            </div>
            <div className="checker flex min-h-[300px] flex-1 items-center justify-center rounded-lg p-3">
              {sheetUrl && (
                <img
                  src={sheetUrl}
                  alt="প্রিন্ট প্রিভিউ"
                  className="max-h-[460px] max-w-full shadow-2xl"
                  style={{ aspectRatio: `${layout.paperW}/${layout.paperH}` }}
                />
              )}
            </div>
            <Tabs defaultValue="layout">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="layout">Layout</TabsTrigger>
                <TabsTrigger value="border">Border</TabsTrigger>
                <TabsTrigger value="label">Label</TabsTrigger>
              </TabsList>
              <TabsContent value="layout" className="space-y-2 pt-1">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Orientation</span>
                  {(["auto", "portrait", "landscape"] as const).map((o) => (
                    <label key={o} className="flex cursor-pointer items-center gap-1 capitalize">
                      <input type="radio" name="o" checked={orient === o} onChange={() => setOrient(o)} className="accent-[var(--primary)]" /> {o}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Checkbox checked={fill} onCheckedChange={(v) => setFill(!!v)} /> Fill the whole sheet (best fit)
                </label>
              </TabsContent>
              <TabsContent value="border" className="space-y-2 pt-1">
                <SliderRow label="Border" min={0} max={10} value={border} onChange={setBorder} onCommit={setBorder} onReset={() => setBorder(0)} />
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={cutLines} onCheckedChange={(v) => setCutLines(!!v)} /> কাটার দাগ দেখান</label>
              </TabsContent>
              <TabsContent value="label" className="grid gap-2 pt-1">
                <Input placeholder="নাম" value={label.name} onChange={(e) => setLabel({ ...label, name: e.target.value })} />
                <Input type="date" value={label.date} onChange={(e) => setLabel({ ...label, date: e.target.value })} />
              </TabsContent>
            </Tabs>
            <div className="grid grid-cols-3 gap-2">
              <Button size="lg" onClick={addToPrintPreview} disabled={!img}><Printer /> Print</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="lg" variant="secondary" disabled={!img}><Save /> Save <ChevronDown /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => download(fullSheet().toDataURL("image/png"), "print-sheet.png")}>পুরো শিট (PNG)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => download(photoCanvas()!.toDataURL("image/png"), "passport-photo.png")}>একটি ছবি (PNG)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => download(photoCanvas()!.toDataURL("image/jpeg", 0.95), "passport-photo.jpg")}>একটি ছবি (JPG)</DropdownMenuItem>
                  {s.src && <DropdownMenuItem onClick={() => download(s.src!, "ai-photo.jpg")}>AI মূল ছবি</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="lg" variant="secondary" disabled={!img} onClick={() => download(fullSheet().toDataURL("image/jpeg", 0.95), "print-sheet.jpg")}><Download /> Export</Button>
            </div>
            <p className="text-right text-xs text-muted-foreground">
              Paper: {paper.label.split(" (")[0]} · {layout.perSheet} per sheet<br />{count} copies on 1 sheet · {size.w}×{size.h} mm
            </p>
          </Panel>
        </aside>
      </div>

      <PrintPreview state={printPreview} photo={printPhoto} onStateChange={setPrintPreview} />
      {skinOpen && s.src && (
        <SkinEditor src={s.src} onClose={() => setSkinOpen(false)} onApply={(url) => {
          apply({ src: url }); setSkinOpen(false); toast.success("স্কিন রিটাচ মেইন ছবিতে বসেছে");
        }} />
      )}
      {proOpen && s.src && (
        <ProEditor
          src={s.src}
          onClose={() => setProOpen(false)}
          onApply={(url) => { apply({ src: url }); setProOpen(false); toast.success("প্রো এডিট মেইন ছবিতে বসেছে"); }}
        />
      )}
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader><DialogTitle>কীভাবে ব্যবহার করবেন</DialogTitle></DialogHeader>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>“Open Photo” বা “From Phone” দিয়ে ছবি খুলুন।</li>
            <li>AI প্রম্পট স্টুডিও থেকে একটি প্রম্পট বেছে “AI দিয়ে ছবি তৈরি করুন” চাপুন।</li>
            <li>Enhance দিয়ে উজ্জ্বলতা, স্কিন স্মুথ ঠিক করুন; ছবি টেনে ও স্ক্রল করে মুখ বসান।</li>
            <li>Photo Size থেকে পাসপোর্ট / ভিসা / স্ট্যাম্প সাইজ বাছুন।</li>
            <li>কাগজ, কপি সংখ্যা বেছে Print বা Save করুন।</li>
          </ol>
          <p className="text-xs text-muted-foreground">শর্টকাট: Ctrl+Z (Undo), Ctrl+Y (Redo)</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Workspace({
  img, origImg, compare, snap, size, label, border, onLive, onCommit, busy, onFile,
}: {
  img: HTMLImageElement | null; origImg: HTMLImageElement | null; compare: boolean; snap: Snap;
  size: { w: number; h: number }; label: { name: string; date: string }; border: number;
  onLive: (f: Frame) => void; onCommit: (f: Frame) => void; busy: boolean; onFile: (f: File) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const cvO = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState(1);
  const [dims, setDims] = useState({ w: 300, h: 380 });
  const drag = useRef<{ x: number; y: number; f: Frame } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const n = compare ? 2 : 1;
      const maxW = (r.width - 48 - (n - 1) * 24) / n, maxH = r.height - 48;
      const sc = Math.min(maxW / size.w, maxH / size.h);
      setDims({ w: Math.max(80, size.w * sc), h: Math.max(100, size.h * sc) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w, size.h, compare]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(dims.w * dpr), H = Math.round(dims.h * dpr);
      const paint = (c: HTMLCanvasElement | null, src: HTMLCanvasElement | null) => {
        if (!c) return;
        c.width = W; c.height = H;
        const x = c.getContext("2d")!;
        x.clearRect(0, 0, W, H);
        if (src) x.drawImage(src, 0, 0);
      };
      paint(cv.current, img ? renderPhoto(img, W, H, snap.adj, snap.frame, snap.bg, { label, border: border * 0.1 * (W / size.w) }) : null);
      if (compare) paint(cvO.current, origImg ? renderPhoto(origImg, W, H, snap.adj, DEFAULT_FRAME, snap.bg, { plain: true }) : null);
    });
    return () => cancelAnimationFrame(raf);
  }, [img, origImg, snap, dims, compare, label, border, size.w]);

  const zoomBy = (d: number) => onCommit({ ...snap.frame, zoom: Math.min(4, Math.max(0.3, snap.frame.zoom * d)) });

  return (
    <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <ToolBtn icon={<Move />} label="Move" active />
        <ToolBtn icon={<Expand />} label="Fit" onClick={() => onCommit(DEFAULT_FRAME)} />
        <ToolBtn icon={<ZoomIn />} label="Zoom In" onClick={() => zoomBy(1.1)} />
        <ToolBtn icon={<ZoomOut />} label="Zoom Out" onClick={() => zoomBy(1 / 1.1)} />
        <ToolBtn icon={<Crop />} label="1:1" onClick={() => onCommit({ ...snap.frame, zoom: 1 })} />
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Button size="icon" variant="ghost" className="size-7" onClick={() => setView((v) => Math.max(0.4, v - 0.1))} aria-label="ছোট দেখুন"><Minus /></Button>
          {Math.round(view * 100)}%
          <Button size="icon" variant="ghost" className="size-7" onClick={() => setView((v) => Math.min(1.6, v + 0.1))} aria-label="বড় দেখুন"><Plus /></Button>
        </div>
      </div>
      <div
        ref={box}
        className={`checker relative flex min-h-0 flex-1 items-center justify-center gap-6 overflow-hidden ${dragOver ? "ring-2 ring-primary ring-inset" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      >
        {!img ? (
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 px-10 py-12 text-center transition-colors hover:bg-primary/5">
            <ImagePlus className="size-12 text-primary" />
            <span className="font-display text-lg font-semibold">ছবি এখানে টেনে আনুন</span>
            <span className="text-sm text-muted-foreground">অথবা ক্লিক করে ছবি বাছাই করুন</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        ) : (
          <>
            {compare && (
              <figure className="flex flex-col items-center gap-2" style={{ transform: `scale(${view})` }}>
                <canvas ref={cvO} style={{ width: dims.w, height: dims.h }} className="shadow-2xl" />
                <figcaption className="text-xs text-muted-foreground">আগে</figcaption>
              </figure>
            )}
            <figure className="flex flex-col items-center gap-2" style={{ transform: `scale(${view})` }}>
              <canvas
                ref={cv}
                style={{ width: dims.w, height: dims.h, touchAction: "none" }}
                className="cursor-grab shadow-2xl outline outline-1 outline-primary/60 active:cursor-grabbing"
                onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, f: snap.frame }; }}
                onPointerMove={(e) => {
                  const d = drag.current; if (!d) return;
                  onLive({ ...d.f, x: d.f.x + (e.clientX - d.x) / (dims.w * view), y: d.f.y + (e.clientY - d.y) / (dims.h * view) });
                }}
                onPointerUp={() => { if (drag.current) { drag.current = null; onCommit(snap.frame); } }}
                onWheel={(e) => onLive({ ...snap.frame, zoom: Math.min(4, Math.max(0.3, snap.frame.zoom * (e.deltaY < 0 ? 1.05 : 0.95))) })}
              />
              {compare && <figcaption className="text-xs text-muted-foreground">পরে</figcaption>}
            </figure>
            {/* face guide */}
            {!compare && (
              <div className="pointer-events-none absolute" style={{ width: dims.w * view, height: dims.h * view }}>
                <div className="absolute left-1/2 top-[14%] h-[58%] w-[52%] -translate-x-1/2 rounded-[50%] border border-dashed border-primary/50" />
              </div>
            )}
          </>
        )}
        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
            <Loader2 className="size-10 animate-spin text-primary" />
            <p className="font-medium">AI ছবি তৈরি করছে… (১৫–৪০ সেকেন্ড)</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-t px-3 py-1.5 text-xs text-muted-foreground">
        <span>ছবি টেনে সরান · স্ক্রল করে জুম · ডটেড ঘেরে মুখ রাখুন</span>
        <span>{size.w}×{size.h} mm · 300 DPI</span>
      </div>
    </div>
  );
}

function Panel({ title, color, children, icon, className = "" }: { title: string; color: string; children: ReactNode; icon?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <section className={`panel flex flex-col p-3 ${className}`} style={{ ["--panel-color" as string]: color }}>
      <button onClick={() => setOpen(!open)} className="mb-2 flex items-center gap-1.5 font-display text-base font-semibold">
        <ChevronDown className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} /> {icon} {title}
      </button>
      {open && <div className="flex flex-1 flex-col gap-2.5">{children}</div>}
    </section>
  );
}

function SliderRow({ label, value, min, max, step = 1, onChange, onCommit, onReset }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; onCommit: (v: number) => void; onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[84px] shrink-0 text-xs">{label}</span>
      <Slider className="flex-1" min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v ?? 0)} onValueCommit={([v]) => onCommit(v ?? 0)} />
      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{value}</span>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onReset}>Reset</Button>
    </div>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full border px-2 py-0.5">
      <span className="mr-1 text-[10px] font-semibold text-muted-foreground">{label}</span>
      <Button size="icon" variant="ghost" className="size-6 rounded-full" onClick={() => onChange(value - 1)} aria-label={`${label} কমান`}><Minus /></Button>
      <span className="w-6 text-center text-sm font-semibold text-primary">{value}</span>
      <Button size="icon" variant="ghost" className="size-6 rounded-full" onClick={() => onChange(value + 1)} aria-label={`${label} বাড়ান`}><Plus /></Button>
    </div>
  );
}

function TopBtn({ icon, label, onClick, disabled, active }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <Button variant={active ? "secondary" : "ghost"} size="sm" onClick={onClick} disabled={disabled} aria-label={label}>
      {icon}<span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

function ToolBtn({ icon, label, onClick, active }: { icon: ReactNode; label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center rounded-md px-3 py-1 text-[11px] transition-colors [&_svg]:size-4 ${active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
      {icon}{label}
    </button>
  );
}

function FileBtn({ icon, label, onFile, capture, variant = "default" }: { icon: ReactNode; label: string; onFile: (f: File) => void; capture?: boolean; variant?: "default" | "outline" }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant={variant} onClick={() => ref.current?.click()}>{icon} {label}</Button>
      <input
        ref={ref} type="file" accept="image/*" className="hidden" {...(capture ? { capture: "user" as const } : {})}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
      />
    </>
  );
}

