import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brush, Crop as CropIcon, Eraser, Eye, History, Loader2, Move3d, Paintbrush, SlidersHorizontal, Sparkles, Sun, Undo2, Redo2, Move, ZoomIn, ZoomOut, Maximize, RotateCcw, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CROP_PRESETS, applyLut, autoLevels, brushStamp, cropRect, curveLut, dodgeBurn, eraseStamp, healStamp,
  histogram, inToPx, levelsLut, perspectiveWarp, type Pt,
} from "@/lib/pro-edit";
import { loadImage } from "@/lib/render";

import { CROP_HANDLES, initialCrop, moveCrop, resizeCrop, type CropBox, type CropHandle } from "@/lib/crop-geometry";

type Tool = "move" | "crop" | "perspective" | "eraser" | "heal" | "brush" | "dodgeburn";
type Dialog2 = "none" | "curve" | "levels";

const MAX_SIDE = 1600;

export function ProEditor({ src, onApply, onClose }: {
  src: string;
  onApply: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<ImageData | null>(null);
  const [orig, setOrig] = useState<ImageData | null>(null);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [future,setFuture]=useState<ImageData[]>([]);
  const [cropSource,setCropSource]=useState<ImageData|null>(null);
  const [savedCrop,setSavedCrop]=useState<CropBox|null>(null);
  const cropDrag=useRef<{box:CropBox;handle:CropHandle|"move";x:number;y:number}|null>(null);
  const [tool, setTool] = useState<Tool>("move");
  const [dialog, setDialog] = useState<Dialog2>("none");
  const [size, setSize] = useState(32);
  const [strength, setStrength] = useState(70);
  const [softness, setSoftness] = useState(50);
  const [dbMode, setDbMode] = useState<"dodge" | "burn">("dodge");
  const [brushColor, setBrushColor] = useState("#3b82f6");
  const [showBefore, setShowBefore] = useState(false);
  const [view, setView] = useState({ scale: 1, ox: 0, oy: 0 });
  const [cropPreset, setCropPreset] = useState("passport");
  const [dpi, setDpi] = useState(300);
  const [cropBox, setCropBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [quad, setQuad] = useState<[Pt, Pt, Pt, Pt] | null>(null);
  const drag = useRef<{ kind: string; sx: number; sy: number; lx: number; ly: number; idx?: number } | null>(null);
  const healSrc = useRef<Pt | null>(null);

  // load image
  useEffect(() => {
    let on = true;
    loadImage(src).then((el) => {
      if (!on) return;
      const r = Math.min(1, MAX_SIDE / Math.max(el.naturalWidth, el.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(el.naturalWidth * r);
      c.height = Math.round(el.naturalHeight * r);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(el, 0, 0, c.width, c.height);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      setImg(data);
      setOrig(data);
      setHistory([]);
      setCropBox(null);
      setQuad(null);
    });
    return () => { on = false; };
  }, [src]);

  const activePreset=CROP_PRESETS.find(c=>c.id===cropPreset)??CROP_PRESETS[0];
  const aspect=activePreset.hIn>0?activePreset.wIn/activePreset.hIn:0;
  const fit=useCallback(()=>{const box=wrapRef.current;if(!img||!box)return;const scale=Math.max(.05,Math.min((box.clientWidth-48)/img.width,(box.clientHeight-48)/img.height,2));setView({scale,ox:(box.clientWidth-img.width*scale)/2,oy:(box.clientHeight-img.height*scale)/2});},[img?.width,img?.height]);
  useEffect(()=>{const box=wrapRef.current;if(!box)return;const observer=new ResizeObserver(fit);observer.observe(box);return()=>observer.disconnect();},[fit]);
  useEffect(()=>{const box=wrapRef.current;if(!box)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const r=box.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;setView(v=>{const scale=Math.max(.05,Math.min(8,v.scale*Math.exp(-e.deltaY*.0015))),k=scale/v.scale;return {scale,ox:x-(x-v.ox)*k,oy:y-(y-v.oy)*k};});};box.addEventListener('wheel',wheel,{passive:false});return()=>box.removeEventListener('wheel',wheel);},[]);
  const startCrop=()=>{if(!img)return;setTool('crop');setQuad(null);if(cropSource&&savedCrop){setImg(cropSource);setCropBox(savedCrop);}else setCropBox(initialCrop(img.width,img.height,aspect));};
  // fit view
  useEffect(() => {
    if (!img || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const scale = Math.min((r.width - 40) / img.width, (r.height - 40) / img.height, 1.5);
    setView({ scale, ox: (r.width - img.width * scale) / 2, oy: (r.height - img.height * scale) / 2 });
  }, [img?.width,img?.height]);

  const draw = useCallback(() => {
    const c = canvasRef.current, o = overlayRef.current;
    if (!c || !o || !img) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(img.width * view.scale), h = Math.round(img.height * view.scale);
    c.width = w * dpr; c.height = h * dpr;
    c.style.width = `${w}px`; c.style.height = `${h}px`;
    o.width = w * dpr; o.height = h * dpr;
    o.style.width = `${w}px`; o.style.height = `${h}px`;
    const ctx = c.getContext("2d");if(!ctx)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const tmp = document.createElement("canvas");
    tmp.width = img.width; tmp.height = img.height;
    tmp.getContext("2d")!.putImageData(showBefore && orig ? orig : img, 0, 0);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(tmp, 0, 0, w, h);
    const oc = o.getContext("2d")!;
    oc.setTransform(dpr, 0, 0, dpr, 0, 0);
    oc.clearRect(0, 0, w, h);
    const toV = (p: Pt) => ({ x: p.x * view.scale, y: p.y * view.scale });
    if (tool === "crop" && cropBox) {
      const a = toV(cropBox), b = toV({ x: cropBox.x + cropBox.w, y: cropBox.y + cropBox.h });
      const tokens=getComputedStyle(o);
      oc.fillStyle = tokens.getPropertyValue("--crop-shade").trim();
      oc.fillRect(0, 0, w, h);
      oc.clearRect(a.x, a.y, b.x - a.x, b.y - a.y);
      oc.drawImage(tmp, cropBox.x, cropBox.y, cropBox.w, cropBox.h, a.x, a.y, b.x - a.x, b.y - a.y);
      oc.strokeStyle = tokens.getPropertyValue("--crop-line").trim();
      oc.lineWidth = 1.5;
      oc.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      // thirds
      oc.strokeStyle = tokens.getPropertyValue("--crop-grid").trim();
      for (let i = 1; i < 3; i++) {
        oc.beginPath();
        oc.moveTo(a.x + ((b.x - a.x) * i) / 3, a.y); oc.lineTo(a.x + ((b.x - a.x) * i) / 3, b.y);
        oc.moveTo(a.x, a.y + ((b.y - a.y) * i) / 3); oc.lineTo(b.x, a.y + ((b.y - a.y) * i) / 3);
        oc.stroke();
      }
    }
    if (tool === "perspective" && quad) {
      oc.strokeStyle = "#22d3ee";
      oc.lineWidth = 2;
      oc.beginPath();
      quad.forEach((p, i) => { const v = toV(p); i ? oc.lineTo(v.x, v.y) : oc.moveTo(v.x, v.y); });
      oc.closePath();
      oc.stroke();
      quad.forEach((p, i) => {
        const v = toV(p);
        oc.fillStyle = "#22d3ee";
        oc.beginPath();
        oc.arc(v.x, v.y, 8, 0, Math.PI * 2);
        oc.fill();
        oc.fillStyle = "#082f3a";
        oc.font = "bold 10px sans-serif";
        oc.textAlign = "center";
        oc.textBaseline = "middle";
        oc.fillText(String(i + 1), v.x, v.y);
      });
    }
  }, [img, orig, view, tool, cropBox, quad, showBefore]);

  useEffect(draw, [draw]);

  const toImg = (e: React.PointerEvent): Pt => {
    const r = overlayRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / view.scale, y: (e.clientY - r.top) / view.scale };
  };

  const pushHistory = () => {
    if (!img) return;
    setFuture([]);
    setHistory((hst) => [...hst.slice(-19), new ImageData(new Uint8ClampedArray(img.data), img.width, img.height)]);
  };

  const undo = () => {const previous=history.at(-1);if(!previous||!img)return;setFuture(f=>[...f,img]);setImg(previous);setHistory(h=>h.slice(0,-1));setCropBox(null);setTool('move');};
  const redo = () => {const next=future.at(-1);if(!next||!img)return;setHistory(h=>[...h,img]);setImg(next);setFuture(f=>f.slice(0,-1));setCropBox(null);setTool('move');};
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(!(e.ctrlKey||e.metaKey)||!['z','y'].includes(e.key.toLowerCase()))return;e.preventDefault();e.stopImmediatePropagation();if(e.shiftKey||e.key.toLowerCase()==='y')redo();else undo();};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);});

  const stamp = (p: Pt) => {
    if (!img || !orig) return;
    const next = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
    if (tool === "eraser") eraseStamp(next, orig, p.x, p.y, size / 2, strength, softness);
    else if (tool === "brush") {
      const m = brushColor.match(/\w\w/g)!.map((x) => parseInt(x, 16)) as [number, number, number];
      brushStamp(next, p.x, p.y, size / 2, strength, softness, m);
    } else if (tool === "dodgeburn") dodgeBurn(next, p.x, p.y, size / 2, strength, softness, dbMode);
    else if (tool === "heal" && healSrc.current) healStamp(next, p.x, p.y, healSrc.current.x, healSrc.current.y, size / 2, strength, softness);
    else return;
    setImg(next);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toImg(e);
    if (tool === "move") {drag.current={kind:'pan',sx:e.clientX,sy:e.clientY,lx:view.ox,ly:view.oy};return;}
    if (tool === "crop") {
      if(cropBox&&p.x>=cropBox.x&&p.x<=cropBox.x+cropBox.w&&p.y>=cropBox.y&&p.y<=cropBox.y+cropBox.h){cropDrag.current={box:{...cropBox},handle:'move',x:e.clientX,y:e.clientY};return;}
      drag.current = { kind: "crop", sx: p.x, sy: p.y, lx: p.x, ly: p.y };
      setCropBox({ x: p.x, y: p.y, w: 0, h: 0 });
    } else if (tool === "perspective") {
      if (!quad) {
        const m = Math.min(img.width, img.height) * 0.06;
        setQuad([{ x: m, y: m }, { x: img.width - m, y: m }, { x: img.width - m, y: img.height - m }, { x: m, y: img.height - m }]);
        return;
      }
      const idx = quad.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < 20 / view.scale);
      if (idx >= 0) drag.current = { kind: "quad", sx: p.x, sy: p.y, lx: p.x, ly: p.y, idx };
    } else if (tool === "heal" && e.altKey) {
      healSrc.current = p;
    } else if (["eraser", "brush", "dodgeburn", "heal"].includes(tool)) {
      pushHistory();
      drag.current = { kind: "paint", sx: p.x, sy: p.y, lx: p.x, ly: p.y };
      stamp(p);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if(cropDrag.current&&img){const d=cropDrag.current,dx=(e.clientX-d.x)/view.scale,dy=(e.clientY-d.y)/view.scale;setCropBox(d.handle==='move'?moveCrop(d.box,dx,dy,img.width,img.height):resizeCrop(d.box,d.handle,dx,dy,img.width,img.height,aspect));return;}
    const d = drag.current;
    if (!d || !img) return;
    if(d.kind==='pan'){setView(v=>({...v,ox:d.lx+e.clientX-d.sx,oy:d.ly+e.clientY-d.sy}));return;}
    const p = toImg(e);
    if (d.kind === "crop") {
      const preset = CROP_PRESETS.find((c) => c.id === cropPreset)!;
      let w = p.x - d.sx, h = p.y - d.sy;
      if (preset.wIn > 0) {
        const ar = preset.wIn / preset.hIn;
        if (Math.abs(w) / Math.max(1, Math.abs(h)) > ar) w = Math.sign(w || 1) * Math.abs(h) * ar;
        else h = Math.sign(h || 1) * Math.abs(w) / ar;
      }
      setCropBox({
        x: Math.min(d.sx, d.sx + w), y: Math.min(d.sy, d.sy + h),
        w: Math.abs(w), h: Math.abs(h),
      });
    } else if (d.kind === "quad" && quad && d.idx !== undefined) {
      const q = [...quad] as [Pt, Pt, Pt, Pt];
      q[d.idx] = { x: Math.max(0, Math.min(img.width, p.x)), y: Math.max(0, Math.min(img.height, p.y)) };
      setQuad(q);
    } else if (d.kind === "paint") {
      // interpolate stamps along the stroke
      const dist = Math.hypot(p.x - d.lx, p.y - d.ly);
      const step = Math.max(2, size / 6);
      const n = Math.max(1, Math.floor(dist / step));
      for (let i = 1; i <= n; i++) stamp({ x: d.lx + ((p.x - d.lx) * i) / n, y: d.ly + ((p.y - d.ly) * i) / n });
      d.lx = p.x; d.ly = p.y;
    }
  };

  const onPointerUp = () => { drag.current = null;cropDrag.current=null; };

  const applyCrop = () => {
    if (!img || !cropBox || cropBox.w < 4 || cropBox.h < 4) return;
    const preset = CROP_PRESETS.find((c) => c.id === cropPreset)!;
    let outW = Math.round(cropBox.w), outH = Math.round(cropBox.h);
    if (preset.wIn > 0) { outW = inToPx(preset.wIn, dpi); outH = inToPx(preset.hIn, dpi); }
    pushHistory();
    setCropSource(img);setSavedCrop({...cropBox});
    const cropped = cropRect(img, Math.round(cropBox.x), Math.round(cropBox.y), Math.round(cropBox.w), Math.round(cropBox.h));
    // scale to target resolution
    const c = document.createElement("canvas");
    c.width = outW; c.height = outH;
    const t = document.createElement("canvas");
    t.width = cropped.width; t.height = cropped.height;
    t.getContext("2d")!.putImageData(cropped, 0, 0);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(t, 0, 0, outW, outH);
    setImg(ctx.getImageData(0, 0, outW, outH));
    setCropBox(null);
    setTool("move");
  };

  const applyPerspective = () => {
    if (!img || !quad) return;
    const preset = CROP_PRESETS.find((c) => c.id === cropPreset)!;
    const wTop = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
    const hSide = Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y);
    let outW = Math.round(wTop), outH = Math.round(hSide);
    if (preset.wIn > 0) { outW = inToPx(preset.wIn, dpi); outH = inToPx(preset.hIn, dpi); }
    pushHistory();
    setImg(perspectiveWarp(img, quad, outW, outH));
    setQuad(null);
    setTool("move");
  };

  const exportUrl = () => {
    if (!img) return "";
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    c.getContext("2d")!.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  };

  const hist = useMemo(() => (img ? histogram(img) : null), [img]);

  return (
    <div role="dialog" aria-modal="true" aria-label="প্রো এডিটর" className="fixed inset-0 z-[60] flex flex-col bg-background">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-card px-3 py-2">
        <h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="size-4 text-primary" /> প্রো এডিটর</h2>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="secondary" title="Undo" aria-label="প্রো আনডু" onClick={undo} disabled={!history.length}><Undo2 /></Button><Button size="icon" variant="secondary" title="Redo" aria-label="প্রো রিডু" onClick={redo} disabled={!future.length}><Redo2 /></Button>
          <Button
            size="sm" variant="secondary" disabled={!orig}
            onPointerDown={() => setShowBefore(true)} onPointerUp={() => setShowBefore(false)} onPointerLeave={() => setShowBefore(false)}
          ><Eye /> Before</Button>
          <Button size="sm" variant="ghost" onClick={onClose}><X /> বাতিল</Button>
          <Button size="sm" onClick={() => onApply(exportUrl())} disabled={!img}>মেইন ছবিতে প্রয়োগ করুন</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-wrap md:flex-nowrap">
        {/* tool rail */}
        <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r bg-card py-2">
          {([
            ["move", <Move key="m"/>, "Move photo"],
            ["crop", <CropIcon key="c" />, "ক্রপ (W×H×Reso)"],
            ["perspective", <Move3d key="p" />, "পারস্পেক্টিভ ক্রপ"],
            ["eraser", <Eraser key="e" />, "Eraser"],
            ["heal", <Sparkles key="h" />, "Heal (Alt+ক্লিক = সোর্স)"],
            ["brush", <Brush key="b" />, "Brush"],
            ["dodgeburn", <Sun key="d" />, "Dodge / Burn"],
          ] as const).map(([id, icon, label]) => (
            <Button
              key={id} size="icon" variant={tool === id ? "default" : "ghost"} title={label} aria-label={label}
              onClick={() => { if(id==="crop"){startCrop();return;}setTool(id);setCropBox(null); if(id==="perspective"&&img){const m=Math.min(img.width,img.height)*.06;setQuad([{x:m,y:m},{x:img.width-m,y:m},{x:img.width-m,y:img.height-m},{x:m,y:img.height-m}]);}else setQuad(null); }}
            >{icon}</Button>
          ))}
          <div className="my-1 h-px w-8 bg-border" />
          <Button size="icon" variant={dialog === "curve" ? "default" : "ghost"} title="Tone Curve" aria-label="Tone Curve" onClick={() => setDialog("curve")}><History /></Button>
          <Button size="icon" variant={dialog === "levels" ? "default" : "ghost"} title="Levels" aria-label="Levels" onClick={() => setDialog("levels")}><Paintbrush /></Button>
        </div>

        {/* canvas */}
        <div ref={wrapRef} className="checker relative min-w-0 flex-1 overflow-hidden">
          {!img && <div className="flex h-full items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>}
          {img && (
            <div className="absolute" style={{ left: view.ox, top: view.oy }}>
              <canvas ref={canvasRef} className="block shadow-2xl" />
              <canvas
                ref={overlayRef}
                aria-label="Photo crop canvas"
                className="absolute inset-0 cursor-crosshair touch-none"
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
              />
              {tool==='crop'&&cropBox&&CROP_HANDLES.map(handle=>{
                const x=handle.includes('w')?cropBox.x:handle.includes('e')?cropBox.x+cropBox.w:cropBox.x+cropBox.w/2;
                const y=handle.includes('n')?cropBox.y:handle.includes('s')?cropBox.y+cropBox.h:cropBox.y+cropBox.h/2;
                return <Button key={handle} variant="outline" size="icon" className={`crop-handle crop-${handle} absolute z-10 size-4 rounded-none`} aria-label={`Crop ${handle} handle`} title={`Resize ${handle}`} style={{left:x*view.scale,top:y*view.scale,transform:'translate(-50%,-50%)'}} onPointerDown={e=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);cropDrag.current={box:{...cropBox},handle,x:e.clientX,y:e.clientY};}} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}/>;
              })}
            </div>
          )}
        </div>

        {/* tool options */}
        <aside className="flex max-h-[34vh] w-full shrink-0 flex-col gap-3 overflow-y-auto border-t bg-card p-3 md:max-h-none md:w-64 md:border-l md:border-t-0">
          <div className="flex items-center gap-1"><Button size="icon" variant="ghost" title="Fit photo" aria-label="Fit photo" onClick={fit}><Maximize/></Button><Button size="icon" variant="ghost" title="Zoom out" aria-label="Pro zoom out" onClick={()=>setView(v=>({...v,scale:Math.max(.05,v.scale/1.2)}))}><ZoomOut/></Button><span className="min-w-12 text-center text-xs">{Math.round(view.scale*100)}%</span><Button size="icon" variant="ghost" title="Zoom in" aria-label="Pro zoom in" onClick={()=>setView(v=>({...v,scale:Math.min(8,v.scale*1.2)}))}><ZoomIn/></Button></div>
          {cropSource&&<Button size="sm" variant="secondary" onClick={startCrop}><CropIcon/>Edit last crop</Button>}
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tool Options</p>
          {(tool === "crop" || tool === "perspective") && (
            <>
              <div className="flex items-center gap-2">
                <span className="w-16 text-xs text-muted-foreground">W × H</span>
                <Select value={cropPreset} onValueChange={v=>{setCropPreset(v);const preset=CROP_PRESETS.find(p=>p.id===v);if(img&&preset&&tool==='crop')setCropBox(initialCrop(img.width,img.height,preset.hIn?preset.wIn/preset.hIn:0));}}>
                  <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{CROP_PRESETS.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-xs text-muted-foreground">Reso</span>
                <Select value={String(dpi)} onValueChange={(v) => setDpi(+v)}>
                  <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{[150, 300, 600].map((d) => <SelectItem key={d} value={String(d)}>{d} px/in</SelectItem>)}</SelectContent>
                </Select>
                {cropPreset !== "free" && (
                  <span className="text-xs text-muted-foreground">
                    {inToPx(CROP_PRESETS.find((c) => c.id === cropPreset)!.wIn, dpi)}×{inToPx(CROP_PRESETS.find((c) => c.id === cropPreset)!.hIn, dpi)} px
                  </span>
                )}
              </div>
              {tool === "crop" ? (
                <>
                  {cropBox&&<output className="text-xs tabular-nums text-muted-foreground">{Math.round(cropBox.w)} × {Math.round(cropBox.h)} px</output>}
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" onClick={()=>{if(img)setCropBox(initialCrop(img.width,img.height,aspect));}}>Reset</Button>
                    <Button size="sm" onClick={applyCrop} disabled={!cropBox || cropBox.w < 4}>Apply</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-muted-foreground">চারটি কোণের বিন্দু টেনে ছবির চার কোণে বসান — হেলানো/পারস্পেক্টিভ ছবি সোজা হবে।</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setQuad(null)}>Clear</Button>
                    <Button size="sm" onClick={applyPerspective} disabled={!quad}>Apply</Button>
                  </div>
                </>
              )}
            </>
          )}
          {["eraser", "heal", "brush", "dodgeburn"].includes(tool) && (
            <>
              <OptSlider label="Size" value={size} min={4} max={200} unit="px" onChange={setSize} />
              <OptSlider label="Strength" value={strength} min={1} max={100} unit="%" onChange={setStrength} />
              <OptSlider label="Softness" value={softness} min={0} max={100} unit="%" onChange={setSoftness} />
              {tool === "brush" && (
                <div className="flex items-center gap-2">
                  <span className="w-16 text-xs text-muted-foreground">Colour</span>
                  <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent" aria-label="ব্রাশের রং" />
                </div>
              )}
              {tool === "dodgeburn" && (
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant={dbMode === "dodge" ? "default" : "secondary"} onClick={() => setDbMode("dodge")}>Dodge</Button>
                  <Button size="sm" variant={dbMode === "burn" ? "default" : "secondary"} onClick={() => setDbMode("burn")}>Burn</Button>
                </div>
              )}
              {tool === "heal" && <p className="text-[11px] text-muted-foreground">Alt ধরে ক্লিক করে সোর্স নিন, তারপর দাগের উপর টানুন।</p>}
            </>
          )}
          
        </aside>
      </div>

      {dialog === "curve" && img && hist && (
        <CurveDialog
          hist={hist}
          onApply={(pts) => {
            pushHistory();
            const next = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
            applyLut(next, curveLut(pts));
            setImg(next);
            setDialog("none");
          }}
          onClose={() => setDialog("none")}
        />
      )}
      {dialog === "levels" && img && hist && (
        <LevelsDialog
          hist={hist}
          onAuto={() => {
            const { inBlack, inWhite } = autoLevels(img);
            pushHistory();
            const next = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
            applyLut(next, levelsLut(inBlack, 1, inWhite, 0, 255));
            setImg(next);
            setDialog("none");
          }}
          onApply={(lv) => {
            pushHistory();
            const next = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
            applyLut(next, levelsLut(lv.inBlack, lv.gamma, lv.inWhite, lv.outBlack, lv.outWhite));
            setImg(next);
            setDialog("none");
          }}
          onClose={() => setDialog("none")}
        />
      )}
    </div>
  );
}

function OptSlider({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-xs text-muted-foreground">{label}</span>
      <Slider value={[value]} min={min} max={max} onValueChange={([v]) => onChange(v!)} className="flex-1" />
      <span className="w-14 rounded border border-border px-1.5 py-0.5 text-center text-xs">{value} {unit}</span>
    </div>
  );
}

function HistCanvas({ hist, className }: { hist: Uint32Array; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(...hist);
    ctx.fillStyle = "rgba(148,163,184,0.6)";
    for (let i = 0; i < 256; i++) {
      const v = Math.log10(1 + hist[i]!) / Math.log10(1 + max);
      ctx.fillRect((i / 256) * w, h - v * h, w / 256 + 0.5, v * h);
    }
  }, [hist]);
  return <canvas ref={ref} width={256} height={100} className={className} />;
}

const CURVE_PRESETS: Record<string, Pt[]> = {
  Linear: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  "S-Contrast": [{ x: 0, y: 0 }, { x: 64, y: 44 }, { x: 192, y: 214 }, { x: 255, y: 255 }],
  Brighten: [{ x: 0, y: 24 }, { x: 128, y: 150 }, { x: 255, y: 255 }],
  Darken: [{ x: 0, y: 0 }, { x: 128, y: 105 }, { x: 255, y: 231 }],
};

function CurveDialog({ hist, onApply, onClose }: { hist: Uint32Array; onApply: (pts: Pt[]) => void; onClose: () => void }) {
  const [pts, setPts] = useState<Pt[]>([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
  const [sel, setSel] = useState<number | null>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const SIZE = 280;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "rgba(15,23,42,0.9)";
    ctx.fillRect(0, 0, SIZE, SIZE);
    // histogram backdrop
    const max = Math.max(...hist);
    ctx.fillStyle = "rgba(148,163,184,0.18)";
    for (let i = 0; i < 256; i++) {
      const v = Math.log10(1 + hist[i]!) / Math.log10(1 + max);
      ctx.fillRect((i / 256) * SIZE, SIZE - v * SIZE, SIZE / 256 + 0.5, v * SIZE);
    }
    ctx.strokeStyle = "rgba(148,163,184,0.25)";
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((SIZE * i) / 4, 0); ctx.lineTo((SIZE * i) / 4, SIZE);
      ctx.moveTo(0, (SIZE * i) / 4); ctx.lineTo(SIZE, (SIZE * i) / 4);
      ctx.stroke();
    }
    // identity dashed
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(148,163,184,0.5)";
    ctx.beginPath(); ctx.moveTo(0, SIZE); ctx.lineTo(SIZE, 0); ctx.stroke();
    ctx.setLineDash([]);
    // curve
    const lut = curveLut(pts);
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = 0; x < 256; x++) {
      const px = (x / 255) * SIZE, py = SIZE - (lut[x]! / 255) * SIZE;
      x ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    pts.forEach((p, i) => {
      ctx.fillStyle = i === sel ? "#93c5fd" : "#3b82f6";
      ctx.beginPath();
      ctx.arc((p.x / 255) * SIZE, SIZE - (p.y / 255) * SIZE, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#eff6ff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [pts, hist, sel]);

  const toPt = (e: React.PointerEvent): Pt => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(255, ((e.clientX - r.left) / r.width) * 255)),
      y: Math.max(0, Math.min(255, (1 - (e.clientY - r.top) / r.height) * 255)),
    };
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-[360px] rounded-xl border bg-card p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Tone Curve</h3>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="বন্ধ"><X /></Button>
        </div>
        <canvas
          ref={ref} width={SIZE} height={SIZE}
          className="mx-auto block cursor-crosshair rounded-lg border border-border"
          style={{ width: SIZE, height: SIZE }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            const p = toPt(e);
            const idx = pts.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < 14);
            if (idx >= 0) return setSel(idx);
            const next = [...pts, p].sort((a, b) => a.x - b.x);
            setPts(next);
            setSel(next.findIndex((q) => q === p));
          }}
          onPointerMove={(e) => {
            if (sel === null || e.buttons !== 1) return;
            const p = toPt(e);
            const next = [...pts];
            next[sel] = p;
            next.sort((a, b) => a.x - b.x);
            setPts(next);
            setSel(next.indexOf(p));
          }}
          onPointerUp={() => setSel(null)}
          onDoubleClick={() => setPts([{ x: 0, y: 0 }, { x: 255, y: 255 }])}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">ক্লিক করে পয়েন্ট যোগ করুন, টেনে বাঁকান। ডাবল-ক্লিক = রিসেট।</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(CURVE_PRESETS).map(([k, v]) => (
            <Button key={k} size="sm" variant="secondary" onClick={() => setPts(v)}>{k}</Button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel curve</Button>
          <Button onClick={() => onApply(pts)}>Apply curve</Button>
        </div>
      </div>
    </div>
  );
}

function LevelsDialog({ hist, onApply, onAuto, onClose }: {
  hist: Uint32Array;
  onApply: (lv: { inBlack: number; gamma: number; inWhite: number; outBlack: number; outWhite: number }) => void;
  onAuto: () => void;
  onClose: () => void;
}) {
  const [inBlack, setInBlack] = useState(0);
  const [gamma, setGamma] = useState(1);
  const [inWhite, setInWhite] = useState(255);
  const [outBlack, setOutBlack] = useState(0);
  const [outWhite, setOutWhite] = useState(255);
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-[380px] rounded-xl border bg-card p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Levels</h3>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="বন্ধ"><X /></Button>
        </div>
        <HistCanvas hist={hist} className="w-full rounded-lg border border-border bg-slate-900/80" />
        <div className="mt-3 space-y-2">
          <OptSlider label="Input black" value={inBlack} min={0} max={254} unit="" onChange={setInBlack} />
          <div className="flex items-center gap-2">
            <span className="w-16 text-xs text-muted-foreground">Gamma</span>
            <Slider value={[gamma]} min={0.2} max={4} step={0.05} onValueChange={([v]) => setGamma(v!)} className="flex-1" />
            <span className="w-14 rounded border border-border px-1.5 py-0.5 text-center text-xs">{gamma.toFixed(2)}</span>
          </div>
          <OptSlider label="Input white" value={inWhite} min={1} max={255} unit="" onChange={setInWhite} />
          <OptSlider label="Output black" value={outBlack} min={0} max={254} unit="" onChange={setOutBlack} />
          <OptSlider label="Output white" value={outWhite} min={1} max={255} unit="" onChange={setOutWhite} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button variant="secondary" onClick={() => { setInBlack(0); setGamma(1); setInWhite(255); setOutBlack(0); setOutWhite(255); }}>Reset</Button>
          <Button variant="secondary" onClick={onAuto}>Auto</Button>
          <Button onClick={() => onApply({ inBlack, gamma, inWhite, outBlack, outWhite })}>Apply</Button>
        </div>
      </div>
    </div>
  );
}
