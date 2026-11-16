import { describe, expect, it } from 'vitest';
import { blurFloat, createSkinMask, DEFAULT_SKIN, SKIN_SECTIONS, resetSkinSection, suggestSkinSettings, skinChroma, parseSkinPreset, retouchSkin, type SkinFace } from '../lib/skin-retouch';
const pixels = (w:number,h:number) => {
  const d=new Uint8ClampedArray(w*h*4);
  for(let p=0;p<w*h;p++) d.set([185+(p%3)*8,133+(p%3)*8,105+(p%3)*8,255],p*4);
  return d;
};
describe('portrait retouching',()=>{
  it('AI-assisted suggestions adapt to actual skin exposure',()=>{const light=pixels(20,20),dark=new Uint8ClampedArray(light);for(let p=0;p<400;p++)for(let c=0;c<3;c++)dark[p*4+c]=(dark[p*4+c]??0)-55;expect(suggestSkinSettings(dark,20,20,[]).brightness).toBeGreaterThan(suggestSkinSettings(light,20,20,[]).brightness);});
  for(const section of Object.keys(SKIN_SECTIONS) as (keyof typeof SKIN_SECTIONS)[])it(`resets ${section} independently`,()=>{const changed={...DEFAULT_SKIN,hue:35,amount:90,eyeBags:70,tolerance:80};const out=resetSkinSection(changed,section);for(const key of SKIN_SECTIONS[section])expect(out[key]).toBe(DEFAULT_SKIN[key]);for(const key of Object.keys(changed) as (keyof typeof changed)[])if(!(SKIN_SECTIONS[section] as readonly string[]).includes(key))expect(out[key]).toBe(changed[key]);});
  it('saturation -100 removes chroma',()=>{const [r,g,b]=skinChroma(185,133,105,0,-100);expect(r).toBeCloseTo(g);expect(g).toBeCloseTo(b);});
  it('Hue changes only selected skin pixels',()=>{const d=pixels(20,20),mask=new Float32Array(400);mask[210]=1;const out=retouchSkin(d,20,20,mask,[],{...DEFAULT_SKIN,hue:40});expect(out.slice(840,843)).not.toEqual(d.slice(840,843));expect(out.slice(0,840)).toEqual(d.slice(0,840));});
  it('preserves detected eyebrows from manual skin inclusion',()=>{const face:SkinFace=Array.from({length:478},()=>({x:0,y:0}));[70,63,105,66,107,55,65,52,53,46].forEach((id,i)=>{face[id]={x:.5+Math.cos(i*Math.PI/5)*.12,y:.5+Math.sin(i*Math.PI/5)*.1};});expect(createSkinMask(pixels(20,20),20,20,[face],DEFAULT_SKIN,new Int8Array(400).fill(1))[210]).toBe(0);});
  it('changes only skin-mask pixels and preserves alpha',()=>{
    const data=pixels(20,20),mask=new Float32Array(400); mask[210]=1;
    const out=retouchSkin(data,20,20,mask,[],{...DEFAULT_SKIN,brightness:40});
    expect(out[840]).toBeGreaterThan(data[840] ?? 0);
    expect(out.slice(0,840)).toEqual(data.slice(0,840));
    expect(out[843]).toBe(255);
  });
  it('manual subtraction removes skin from the mask',()=>{
    const data=pixels(20,20),manual=new Int8Array(400);manual[210]=-1;
    const mask=createSkinMask(data,20,20,[],DEFAULT_SKIN,manual);
    expect(mask[210]).toBe(0); expect(mask[100]).toBeGreaterThan(0);
  });
  it('protects detected lips even when manually included as skin',()=>{
    const face:SkinFace=Array.from({length:478},()=>({x:0,y:0}));
    [61,40,37,0,267,270,291,321,314,17,84,91].forEach((id,i)=>{face[id]={x:.5+Math.cos(i*Math.PI/6)*.12,y:.5+Math.sin(i*Math.PI/6)*.1};});
    expect(createSkinMask(pixels(20,20),20,20,[face],DEFAULT_SKIN,new Int8Array(400).fill(1))[210]).toBe(0);
  });
  it('protects detected eye and lip landmarks even with a manually added mask',()=>{
    const face:SkinFace=Array.from({length:478},()=>({x:0,y:0}));
    [33,160,158,133,153,144].forEach((id,i)=>{face[id]={x:.5+Math.cos(i*Math.PI/3)*.12,y:.5+Math.sin(i*Math.PI/3)*.1};});
    const manual=new Int8Array(400).fill(1);
    const mask=createSkinMask(pixels(20,20),20,20,[face],DEFAULT_SKIN,manual);
    expect(mask[210]).toBe(0);
  });
  it('retains fine texture more strongly when texture preservation is increased',()=>{
    const data=pixels(40,40),mask=new Float32Array(1600).fill(1);
    const common={...DEFAULT_SKIN,amount:100,fine:100,medium:0,coarse:0,redness:0,yellow:0,evenness:0,eyeBags:0};
    const keep=retouchSkin(data,40,40,mask,[],{...common,texture:100});
    const smooth=retouchSkin(data,40,40,mask,[],{...common,texture:0});
    expect(keep).toEqual(data);expect(smooth).not.toEqual(data);
  });
  it('zero settings leave the source unchanged',()=>{
    const data=pixels(20,20);
    const settings={...DEFAULT_SKIN,amount:0,eyeBags:0,evenness:0,redness:0,yellow:0};
    expect(retouchSkin(data,20,20,new Float32Array(400).fill(1),[],settings)).toEqual(data);
  });
  it('float processing does not quantize intermediate filter values',()=>{
    const out=blurFloat(new Float32Array([0,1,0]),3,1,1,1);
    expect(out[1]).toBeCloseTo(1/3);
  });
  it('custom preset validates actual numeric controls',()=>{
    expect(parseSkinPreset({...DEFAULT_SKIN,eyeBags:65}).eyeBags).toBe(65);
    expect(()=>parseSkinPreset({...DEFAULT_SKIN,eyeBags:101})).toThrow();
  });
});