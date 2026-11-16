export type CropBox = {x:number;y:number;w:number;h:number};
export const CROP_HANDLES=['nw','n','ne','e','se','s','sw','w'] as const;
export type CropHandle=typeof CROP_HANDLES[number];
export function initialCrop(w:number,h:number,aspect:number):CropBox {
  let cw=w*.86,ch=h*.86;
  if(aspect>0){if(cw/ch>aspect)cw=ch*aspect;else ch=cw/aspect;}
  return {x:(w-cw)/2,y:(h-ch)/2,w:cw,h:ch};
}
export function moveCrop(b:CropBox,dx:number,dy:number,w:number,h:number):CropBox {
  return {...b,x:Math.max(0,Math.min(w-b.w,b.x+dx)),y:Math.max(0,Math.min(h-b.h,b.y+dy))};
}
export function resizeCrop(b:CropBox,handle:CropHandle,dx:number,dy:number,w:number,h:number,aspect:number):CropBox {
  const west=handle.includes('w'),east=handle.includes('e'),north=handle.includes('n'),south=handle.includes('s');
  let cw=Math.max(8, b.w+(west?-dx:east?dx:0)),ch=Math.max(8,b.h+(north?-dy:south?dy:0));
  if(aspect>0){if((east||west)&&(!north&&!south||Math.abs(dx)>Math.abs(dy)*aspect))ch=cw/aspect;else cw=ch*aspect;}
  const anchorX=west?b.x+b.w:east?b.x:b.x+b.w/2,anchorY=north?b.y+b.h:south?b.y:b.y+b.h/2;
  const maxW=west?anchorX:east?w-anchorX:Math.min(anchorX,w-anchorX)*2;
  const maxH=north?anchorY:south?h-anchorY:Math.min(anchorY,h-anchorY)*2;
  const scale=Math.min(1,maxW/cw,maxH/ch);cw*=scale;ch*=scale;
  return {x:west?anchorX-cw:east?anchorX:anchorX-cw/2,y:north?anchorY-ch:south?anchorY:anchorY-ch/2,w:cw,h:ch};
}