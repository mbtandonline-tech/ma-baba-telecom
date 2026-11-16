import {describe,it,expect} from 'vitest';
import {initialCrop,moveCrop,resizeCrop} from '../lib/crop-geometry';
describe('editable crop',()=>{
  it('initial passport crop preserves 1.5 by 1.9 proportion',()=>{const b=initialCrop(800,1000,1.5/1.9);expect(b.w/b.h).toBeCloseTo(1.5/1.9);});
  it('moving retains size and stays inside the photograph',()=>{expect(moveCrop({x:10,y:10,w:100,h:120},500,-50,300,300)).toEqual({x:200,y:0,w:100,h:120});});
  it('resizes a corner around its opposite anchor',()=>{expect(resizeCrop({x:20,y:30,w:100,h:100},'se',40,20,400,400,1)).toEqual({x:20,y:30,w:140,h:140});});
  it('edge resize respects bounds and ratio',()=>{const b=resizeCrop({x:20,y:30,w:100,h:100},'w',-300,0,400,400,1);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.w/b.h).toBeCloseTo(1);expect(b.x+b.w).toBe(120);});
});