import { ALL_REGIONS, FEATURE_BITS, buildRegions, type FaceRegions, type SkinFace } from './face-regions';
export { FACE_OVAL, FEATURES, REGION, ALL_REGIONS, buildRegions } from './face-regions';
export type { SkinFace, SkinPoint, FaceRegions, RegionSummary, Segmentation, RegionKey } from './face-regions';
export type SkinSettings = {
  amount: number; fine: number; medium: number; coarse: number; texture: number;
  tolerance: number; feather: number; opacity: number; protect: boolean;
  eyeBags: number; evenness: number; redness: number; yellow: number;
  brightness: number; contrast: number; warmth: number; shadows: number; highlights: number;
  hue: number; saturation: number; detail: number; blemishes: number; darkSpots: number;
  /** Bitmask of protected AI regions (eyes, brows, lips, hair, beard, glasses, headwear, clothes). */
  guard: number;
};
export const DEFAULT_SKIN: SkinSettings = {
  amount: 55, fine: 20, medium: 60, coarse: 35, texture: 80,
  tolerance: 35, feather: 45, opacity: 100, protect: true,
  eyeBags: 25, evenness: 25, redness: 30, yellow: 15,
  brightness: 0, contrast: 0, warmth: 0, shadows: 0, highlights: 0,
  hue: 0, saturation: 0, detail: 0, blemishes: 0, darkSpots: 0, guard: ALL_REGIONS,
};
export const SKIN_PRESETS: Record<string, SkinSettings> = {
  Natural: DEFAULT_SKIN,
  'Light touch': { ...DEFAULT_SKIN, amount: 25, texture: 95, eyeBags: 15, evenness: 10 },
  Portrait: { ...DEFAULT_SKIN, amount: 75, medium: 75, texture: 75, eyeBags: 45, evenness: 40 },
  'Studio Pro': { ...DEFAULT_SKIN, amount: 70, medium: 72, coarse: 45, texture: 85, eyeBags: 45, evenness: 40, redness: 40, blemishes: 45, darkSpots: 35, detail: 15, brightness: 4, highlights: 6 },
  'Tone only': { ...DEFAULT_SKIN, amount: 0, eyeBags: 0, evenness: 50, redness: 60, yellow: 45 },
};
export const SKIN_SECTIONS = {
  'Auto-Skin Mask': ['tolerance','feather','opacity','protect','guard'],
  'Skin Details': ['amount','fine','medium','coarse','texture','detail'],
  'Skin Imperfections': ['eyeBags','evenness','redness','yellow','blemishes','darkSpots'],
  'Skin Tone': ['brightness','contrast','warmth','shadows','highlights','hue','saturation'],
} satisfies Record<string, (keyof SkinSettings)[]>;
export function resetSkinSection(s:SkinSettings, section:keyof typeof SKIN_SECTIONS):SkinSettings {
  const out={...s};
  for(const key of SKIN_SECTIONS[section]) Object.assign(out,{[key]:DEFAULT_SKIN[key]});
  return out;
}
/** AI landmarks define the analysis region; recommendations adapt to that portrait. */
export function suggestSkinSettings(data:Uint8ClampedArray,w:number,h:number,faces:SkinFace[]):SkinSettings {
  return suggestFromMask(data,w,h,createSkinMask(data,w,h,faces,DEFAULT_SKIN));
}
export function suggestFromMask(data:Uint8ClampedArray,w:number,h:number,mask:Float32Array):SkinSettings {
  let count=0,lum=0,red=0,variance=0;
  for(let p=0;p<w*h;p+=3){if((mask[p]??0)<.6)continue;const r=data[p*4]??0,g=data[p*4+1]??0,b=data[p*4+2]??0,l=.2126*r+.7152*g+.0722*b;count++;lum+=l;variance+=l*l;red+=Math.max(0,r-g-24);}
  if(!count)return {...DEFAULT_SKIN};
  const mean=lum/count,spread=Math.sqrt(Math.max(0,variance/count-mean*mean));
  return {...DEFAULT_SKIN,amount:Math.round(Math.max(25,Math.min(75,35+spread*.6))),
    brightness:Math.round(Math.max(-12,Math.min(18,(150-mean)/5))),
    redness:Math.round(Math.max(10,Math.min(60,red/count*2))),
    blemishes:Math.round(Math.max(15,Math.min(45,spread))),darkSpots:25,detail:12,texture:85};
}
/** Hue rotation in YIQ preserves luminance; saturation scales chroma only. */
export function skinChroma(r:number,g:number,b:number,hue:number,saturation:number):[number,number,number] {
  const y=.299*r+.587*g+.114*b, i=.596*r-.274*g-.322*b, q=.211*r-.523*g+.312*b;
  const angle=hue*Math.PI/180, scale=1+saturation/100;
  const ni=(i*Math.cos(angle)-q*Math.sin(angle))*scale, nq=(i*Math.sin(angle)+q*Math.cos(angle))*scale;
  return [y+.956*ni+.621*nq,y-.272*ni-.647*nq,y-1.106*ni+1.703*nq];
}
/** Separable float box filter, avoiding an intermediate 8-bit quantization. */
export function blurFloat(src: Float32Array, w: number, h: number, channels: number, radius: number): Float32Array {
  const r = Math.max(1, Math.round(radius)), n = r * 2 + 1;
  const temp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let c = 0; c < channels; c++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[(y * w + Math.max(0, Math.min(w - 1, k))) * channels + c] ?? 0;
    for (let x = 0; x < w; x++) {
      temp[(y * w + x) * channels + c] = sum / n;
      sum += (src[(y * w + Math.min(w - 1, x + r + 1)) * channels + c] ?? 0) - (src[(y * w + Math.max(0, x - r)) * channels + c] ?? 0);
    }
  }
  for (let x = 0; x < w; x++) for (let c = 0; c < channels; c++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += temp[(Math.max(0, Math.min(h - 1, k)) * w + x) * channels + c] ?? 0;
    for (let y = 0; y < h; y++) {
      out[(y * w + x) * channels + c] = sum / n;
      sum += (temp[(Math.min(h - 1, y + r + 1) * w + x) * channels + c] ?? 0) - (temp[(Math.max(0, y - r) * w + x) * channels + c] ?? 0);
    }
  }
  return out;
}
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
/** Skin-color confidence with AI region exclusion. Body skin uses face-sampled chroma. */
export function createSkinMask(data: Uint8ClampedArray, w: number, h: number, faces: SkinFace[], s: SkinSettings, manual?: Int8Array): Float32Array {
  return maskFromRegions(data, w, h, buildRegions(data, w, h, faces), s, manual);
}
export function guardBits(s: SkinSettings): number {
  return (s.guard ?? ALL_REGIONS) & (s.protect ? ALL_REGIONS : ~FEATURE_BITS & ALL_REGIONS);
}
export function maskFromRegions(data: Uint8ClampedArray, w: number, h: number, regions: FaceRegions, s: SkinSettings, manual?: Int8Array): Float32Array {
  const { bits, face, skin } = regions, guard = guardBits(s);
  let cbMean = 108, crMean = 151, count = 0, cbSum = 0, crSum = 0;
  for (let p = 0; p < w*h; p += 3) {
    if (!face[p] || ((bits[p] ?? 0) & ALL_REGIONS) || (skin && (skin[p] ?? 0) < .5)) continue;
    const i = p * 4, r = data[i] ?? 0, g = data[i+1] ?? 0, b = data[i+2] ?? 0;
    cbSum += 128 - .168736*r - .331264*g + .5*b; crSum += 128 + .5*r - .418688*g - .081312*b; count++;
  }
  if (count) { cbMean = cbSum / count; crMean = crSum / count; }
  const mask = new Float32Array(w*h);
  for (let p = 0; p < w*h; p++) {
    if ((bits[p] ?? 0) & guard) continue;
    const i = p*4, r = data[i] ?? 0, g = data[i+1] ?? 0, b = data[i+2] ?? 0;
    const cb = 128 - .168736*r - .331264*g + .5*b, cr = 128 + .5*r - .418688*g - .081312*b;
    const confidence = clamp((18 + s.tolerance*.55 - Math.hypot((cb-cbMean)*1.15, cr-crMean)) / 12);
    if (skin) { mask[p] = (skin[p] ?? 0) * (.3 + .7*confidence); continue; }
    const lum = .2126*r + .7152*g + .0722*b;
    // Neutral backgrounds, deep hair shadows and saturated objects are not skin.
    const colorGate = clamp((cr-130)/8) * clamp((lum-18)/24) * clamp((250-lum)/20);
    mask[p] = confidence * (face[p] ? 1 : colorGate);
  }
  const result = s.feather > 0 ? blurFloat(mask,w,h,1,Math.max(1,Math.min(w,h)*s.feather/12000)) : mask;
  for (let p = 0; p < result.length; p++) {
    const mark = manual?.[p] ?? 0;
    result[p] = ((bits[p] ?? 0) & guard ? 0 : mark < 0 ? 0 : mark > 0 ? 1 : result[p] ?? 0) * s.opacity/100;
  }
  return result;
}
function underEyes(x: number, y: number, faces: SkinFace[]): number {
  let weight = 0;
  for (const f of faces) for (const [aId,bId] of [[33,133],[362,263]]) {
    const a = f[aId ?? 0], b = f[bId ?? 0];
    if (!a || !b) continue;
    const width = Math.hypot(a.x-b.x,a.y-b.y);
    if (width < .001) continue;
    const cx = (a.x+b.x)/2, cy = (a.y+b.y)/2 + width*.42;
    const q = ((x-cx)/(width*.65))**2 + ((y-cy)/(width*.30))**2;
    weight = Math.max(weight, Math.exp(-q*2));
  }
  return weight;
}
/** Multi-scale frequency separation: reduce medium blemish bands and retain fine detail. */
export function prepareSkinPixels(data:Uint8ClampedArray,w:number,h:number,faces?:SkinFace[]) {
  const rgb = new Float32Array(w*h*3);
  for (let p = 0; p < w*h; p++) for (let c = 0; c < 3; c++) rgb[p*3+c] = data[p*4+c] ?? 0;
  const unit = Math.max(1, Math.min(w,h)/400);
  const fine = blurFloat(rgb,w,h,3,unit), mid = blurFloat(fine,w,h,3,unit*3), low = blurFloat(mid,w,h,3,unit*8);
  let eye:Float32Array|undefined;
  if(faces){eye=new Float32Array(w*h);if(faces.length)for(let p=0;p<w*h;p++)eye[p]=underEyes((p%w)/w,Math.floor(p/w)/h,faces);}
  return {rgb,fine,mid,low,eye};
}
export function retouchSkin(data: Uint8ClampedArray, w: number, h: number, mask: Float32Array, faces: SkinFace[], s: SkinSettings, prepared=prepareSkinPixels(data,w,h)): Uint8ClampedArray {
  const {rgb,fine,mid,low,eye:eyeMap}=prepared;
  const out = new Uint8ClampedArray(data);
  for (let p = 0; p < w*h; p++) {
    const weight = mask[p] ?? 0;
    if (weight <= 0) continue;
    const lum = .2126*(rgb[p*3] ?? 0)+.7152*(rgb[p*3+1] ?? 0)+.0722*(rgb[p*3+2] ?? 0);
    const eye = s.eyeBags ? (eyeMap ? eyeMap[p] ?? 0 : underEyes((p%w)/w,Math.floor(p/w)/h,faces))*s.eyeBags/100 : 0;
    const chroma=s.hue||s.saturation ? skinChroma(rgb[p*3]??0,rgb[p*3+1]??0,rgb[p*3+2]??0,s.hue,s.saturation) : null;
    for (let c = 0; c < 3; c++) {
      const k=p*3+c, original=rgb[k] ?? 0, f=fine[k] ?? 0, m=mid[k] ?? 0, l=low[k] ?? 0;
      const edge = 1/(1+Math.abs(original-l)/24);
      const strength = s.amount/100*edge;
      let v = original - strength*((original-f)*s.fine/100*(1-s.texture/100)+(f-m)*s.medium/100+(m-l)*s.coarse/100);
      v += (l-m)*s.evenness/100*.4;
      v += (original-f)*s.detail/100*.5*edge;
      v += (m-original)*s.blemishes/100*clamp(Math.abs(original-m)/18)*edge*.65;
      v += Math.max(0,l-original-4)*s.darkSpots/100*.65;
      if(chroma) v+=(chroma[c]??original)-original;
      const red = Math.max(0,(rgb[p*3] ?? 0)-(rgb[p*3+1] ?? 0)-24)*s.redness/100;
      const yellow = Math.max(0,((rgb[p*3] ?? 0)+(rgb[p*3+1] ?? 0))/2-(rgb[p*3+2] ?? 0)-28)*s.yellow/100;
      v += c===0 ? -red*.38 : c===1 ? red*.16 : red*.08+yellow*.3;
      v += s.brightness*.45 + s.warmth*(c===0?.22:c===2?-.22:0);
      v += s.shadows*clamp((145-lum)/145)*.5 + s.highlights*clamp((lum-110)/145)*.5;
      v = (v-128)*(1+s.contrast/150)+128;
      v += eye*Math.max(0,(l-original))*.7 + eye*10;
      out[p*4+c] = clamp(original+(v-original)*weight,0,255);
    }
  }
  return out;
}
export function parseSkinPreset(value: unknown): SkinSettings {
  if (!value || typeof value !== 'object') throw new Error('Invalid preset');
  const obj = value as Record<string, unknown>, out = { ...DEFAULT_SKIN };
  for (const key of Object.keys(DEFAULT_SKIN) as (keyof SkinSettings)[]) {
    if (key === 'protect') { if (typeof obj[key] !== 'boolean') throw new Error('Invalid feature protection'); out.protect = obj[key]; }
    else if (key === 'guard') { const g = obj['guard'] ?? ALL_REGIONS; if (typeof g !== 'number' || !Number.isInteger(g) || g < 0 || g > ALL_REGIONS) throw new Error('Invalid protection'); out.guard = g; }
    else { const n = obj[key] ?? (['hue','saturation','detail','blemishes','darkSpots'].includes(key)?DEFAULT_SKIN[key]:undefined); if (typeof n !== 'number' || !Number.isFinite(n) || n < (['brightness','contrast','warmth','shadows','highlights','hue','saturation'].includes(key)?-100:0) || n>100) throw new Error('Invalid setting'); out[key]=n; }
  }
  return out;
}