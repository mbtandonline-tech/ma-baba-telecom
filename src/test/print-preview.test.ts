import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import bridge from "../components/print-preview/photo-bridge.js?raw";

function harness() {
  const listeners: Record<string, (event: unknown) => void> = {};
  const images: Array<{ onload: () => void; src: string; naturalWidth: number; naturalHeight: number }> = [];
  const parent = { postMessage() {} };
  const S = { imgs: [] as Array<Record<string, unknown>>, sel: -1, msel: [] };
  const PAGES: Record<string, unknown> = { "A4": [210, 297] };
  const element = { style: {}, classList: { contains: () => false } };
  runInNewContext(bridge, {
    parent, S, D: {}, DS: {}, PAGES, ADV: [], HIST: [], HP: 0,
    addEventListener: (key: string, fn: (event: unknown) => void) => { listeners[key] = fn; },
    Image: class { onload = () => {}; src = ""; naturalWidth = 450; naturalHeight = 600; constructor() { images.push(this); } },
    document: { createElement: () => ({ getContext: () => ({ fillStyle: "", fillRect() {}, drawImage() {}, getImageData: () => ({}) }) }) },
    $: () => element, presetOf: () => 0, list() {}, sync() {}, draw() {},
    showTab() {}, setZoom() {}, fitPct: () => 90, snapshot: () => ({}), updateUndoBtns() {}, clearTimeout() {},
  });
  const send = (photo: string, source: unknown = parent, id = "first-photo") =>
    listeners['message']?.({ source, data: { type: "easy-optic:photo", photo, id } });
  return { S, PAGES, images, send };
}

describe("Print Preview photo synchronization", () => {
  it("keeps the tool's own defaults — only the edited photo arrives", () => {
    const h = harness();
    h.send("data:image/png;base64,first"); h.images[0]?.onload();
    const model = h.S.imgs[0];
    if (!model) throw new Error("Linked photo missing");
    expect(model["src"]).toBe("data:image/png;base64,first");
    expect(model["copies"]).toBe(4);
    expect(Object.keys(h.PAGES)).toEqual(["A4"]);
    model["w"] = 42; model["copies"] = 12;
    h.send("data:image/png;base64,edited"); h.images[1]?.onload();
    expect(h.S.imgs).toHaveLength(1);
    expect(model["src"]).toBe("data:image/png;base64,edited");
    expect(model["w"]).toBe(42);
    expect(model["copies"]).toBe(12);
  });
  it("ignores older photo decoding results after a newer edit", () => {
    const h = harness();
    h.send("data:image/png;base64,old"); h.send("data:image/png;base64,new");
    h.images[1]?.onload(); h.images[0]?.onload();
    expect(h.S.imgs[0]?.["src"]).toBe("data:image/png;base64,new");
  });
  it("rejects photo messages from windows other than the parent", () => {
    const h = harness();
    h.send("data:image/png;base64,wrong", {});
    expect(h.images).toHaveLength(0);
  });
  it("adds a second edited photo after the first with its own defaults", () => {
    const h = harness();
    h.send("data:image/png;base64,first"); h.images[0]?.onload();
    const first = h.S.imgs[0];
    if (!first) throw new Error("First photo missing");
    first["copies"] = 2; first["w"] = 35;
    h.send("data:image/png;base64,second", undefined, "second-photo"); h.images[1]?.onload();
    expect(h.S.imgs).toHaveLength(2);
    expect(first["src"]).toBe("data:image/png;base64,first");
    expect(first["copies"]).toBe(2);
    expect(h.S.imgs[1]?.["copies"]).toBe(4);
    expect(h.S.imgs[1]?.["studioId"]).toBe("second-photo");
    h.send("data:image/png;base64,secondEdited", undefined, "second-photo"); h.images[2]?.onload();
    expect(h.S.imgs).toHaveLength(2);
    expect(first["w"]).toBe(35);
    expect(h.S.imgs[1]?.["src"]).toBe("data:image/png;base64,secondEdited");
  });
  it("decodes different imported photos independently", () => {
    const h = harness();
    h.send("data:image/png;base64,first");
    h.send("data:image/png;base64,second", undefined, "second-photo");
    h.images[0]?.onload(); h.images[1]?.onload();
    expect(h.S.imgs).toHaveLength(2);
  });
});
