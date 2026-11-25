export type Adjust = {
  brightness: number; // -100..100
  contrast: number;
  saturation: number;
  warmth: number;
  smooth: number; // 0..100
  sharpness: number; // 0..100
};
export type Frame = { zoom: number; x: number; y: number; rotate: number; straighten: number; flip: boolean };
export type Label = { name: string; date: string } | null;

export const DEFAULT_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, smooth: 0, sharpness: 0 };
export const DEFAULT_FRAME: Frame = { zoom: 1, x: 0, y: 0, rotate: 0, straighten: 0, flip: false };

export const DPI = 300;
export const mmToPx = (mm: number, dpi = DPI) => Math.round((mm / 25.4) * dpi);

export type SheetLayout = { cols: number; rows: number; perSheet: number; paperW: number; paperH: number };

/** Grid of photos (mm) on a paper, with outer margin and gap between photos. */
export function layoutSheet(
  paperW: number,
  paperH: number,
  photoW: number,
  photoH: number,
  orientation: "auto" | "portrait" | "landscape" = "auto",
  margin = 5,
  gap = 2,
): SheetLayout {
  const fit = (pw: number, ph: number) => {
    const cols = Math.max(0, Math.floor((pw - 2 * margin + gap) / (photoW + gap)));
    const rows = Math.max(0, Math.floor((ph - 2 * margin + gap) / (photoH + gap)));
    return { cols, rows, perSheet: cols * rows, paperW: pw, paperH: ph };
  };
  const p = fit(Math.min(paperW, paperH), Math.max(paperW, paperH));
  const l = fit(Math.max(paperW, paperH), Math.min(paperW, paperH));
  if (orientation === "portrait") return p;
  if (orientation === "landscape") return l;
  return l.perSheet > p.perSheet ? l : p;
}

function sharpen(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  if (amount <= 0) return;
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const sd = src.data, o = out.data;
  const s = (j: number) => sd[j] ?? 0;
  const k = amount / 100; // 0..1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        o[i] = s(i); o[i + 1] = s(i + 1); o[i + 2] = s(i + 2); o[i + 3] = s(i + 3);
        continue;
      }
      for (let c = 0; c < 3; c++) {
        const v = s(i + c);
        const lap = 4 * v - s(i - 4 + c) - s(i + 4 + c) - s(i - w * 4 + c) - s(i + w * 4 + c);
        o[i + c] = v + lap * k;
      }
      o[i + 3] = s(i + 3);
    }
  }
  ctx.putImageData(out, 0, 0);
}

/** Draw a single framed photo at the given pixel size. */
export function renderPhoto(
  img: HTMLImageElement,
  w: number,
  h: number,
  adj: Adjust,
  frame: Frame,
  bg: string,
  opts: { label?: Label; border?: number; borderColor?: string; plain?: boolean } = {},
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const rot = frame.rotate + frame.straighten;
  const swap = Math.abs(frame.rotate % 180) === 90;
  const iw = swap ? img.naturalHeight : img.naturalWidth;
  const ih = swap ? img.naturalWidth : img.naturalHeight;
  const scale = Math.max(w / iw, h / ih) * frame.zoom;

  const draw = (filter: string, alpha = 1) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.filter = filter;
    ctx.translate(w / 2 + frame.x * w, h / 2 + frame.y * h);
    ctx.rotate((rot * Math.PI) / 180);
    if (frame.flip) ctx.scale(-1, 1);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
  };

  if (opts.plain) {
    draw("none");
    return c;
  }
  const base = `brightness(${1 + adj.brightness / 100}) contrast(${1 + adj.contrast / 100}) saturate(${1 + adj.saturation / 100})`;
  draw(base);
  if (adj.smooth > 0) draw(`${base} blur(${Math.max(1, w / 300) * (adj.smooth / 40)}px)`, adj.smooth / 160);
  if (adj.warmth !== 0) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = Math.abs(adj.warmth) / 160;
    ctx.fillStyle = adj.warmth > 0 ? "#ff9a3c" : "#3c8dff";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (adj.sharpness > 0) sharpen(ctx, w, h, adj.sharpness);

  if (opts.label && (opts.label.name || opts.label.date)) {
    const lh = Math.round(h * 0.13);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, h - lh, w, lh);
    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = [opts.label.name, opts.label.date].filter(Boolean);
    const fs = Math.round(lh / (lines.length === 2 ? 2.6 : 1.8));
    ctx.font = `600 ${fs}px "Hind Siliguri", sans-serif`;
    lines.forEach((t, i) => {
      const y = h - lh + (lh / (lines.length + 1)) * (i + 1);
      ctx.fillText(t, w / 2, y, w * 0.94);
    });
  }
  if (opts.border && opts.border > 0) {
    ctx.strokeStyle = opts.borderColor ?? "#000";
    ctx.lineWidth = opts.border;
    ctx.strokeRect(opts.border / 2, opts.border / 2, w - opts.border, h - opts.border);
  }
  return c;
}

/** Positions (px) of `count` photos in a grid, optionally centered on the sheet. */
export function sheetPlacements(
  count: number,
  cols: number,
  rows: number,
  photoW: number,
  photoH: number,
  gap: number,
  pageW: number,
  pageH: number,
  margin: number,
  center = false,
): Array<{ x: number; y: number; w: number; h: number }> {
  const fitCols = Math.max(1, Math.floor((pageW - 2 * margin + gap) / (photoW + gap)));
  const useCols = Math.max(1, Math.min(cols, fitCols));
  const n = Math.max(0, Math.min(count, useCols * Math.max(0, rows)));
  const usedRows = n ? Math.ceil(n / useCols) : 0;
  const totalW = useCols * photoW + (useCols - 1) * gap;
  const totalH = usedRows * photoH + Math.max(0, usedRows - 1) * gap;
  const x0 = center ? Math.max(margin, (pageW - totalW) / 2) : margin;
  const y0 = center ? Math.max(margin, (pageH - totalH) / 2) : margin;
  const out: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: x0 + (i % useCols) * (photoW + gap),
      y: y0 + Math.floor(i / useCols) * (photoH + gap),
      w: photoW,
      h: photoH,
    });
  }
  return out;
}

/** Compose a print sheet at 300 DPI. */
export function renderSheet(
  photo: HTMLCanvasElement | null,
  layout: SheetLayout,
  photoW: number,
  photoH: number,
  count: number,
  cols: number,
  dpi = DPI,
  margin = 5,
  gap = 2,
  cutLines = true,
  center = false,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = mmToPx(layout.paperW, dpi);
  c.height = mmToPx(layout.paperH, dpi);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  if (!photo) return c;
  const pw = mmToPx(photoW, dpi), ph = mmToPx(photoH, dpi);
  const m = mmToPx(margin, dpi), g = mmToPx(gap, dpi);
  const spots = sheetPlacements(count, cols, layout.rows, pw, ph, g, c.width, c.height, m, center);
  for (const spot of spots) {
    const { x, y, w, h } = spot;
    ctx.drawImage(photo, x, y, w, h);
    if (cutLines) {
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    }
  }
  return c;
}

/** Downscale an image to a JPEG data URL for fast uploads. */
export function toUploadDataUrl(img: HTMLImageElement, max = 1280): string {
  const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * r);
  c.height = Math.round(img.naturalHeight * r);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.9);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}
