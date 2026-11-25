// Runs only inside the isolated uploaded print workspace.
// The studio sends the edited photo plus its layout preset (paper, photo size,
// copies, columns, centering); every other default stays exactly as the tool defines it.
(() => {
  const revisions = new Map();
  const reply = (data) => parent.postMessage(data, '*');

  // Layout preset from the studio. Applied to every studio-linked photo so the
  // print tool and the studio panel never disagree about size or copies.
  let layoutPreset = null;
  const num = (value, min, max) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
  };
  const applyLayout = (model) => {
    if (!layoutPreset || !model) return;
    const L = layoutPreset;
    const w = num(L.w, 10, 300), h = num(L.h, 10, 300);
    const copies = num(L.copies, 1, 100), cols = num(L.cols, 0, 12);
    if (w === null || h === null || copies === null || cols === null) return;
    model.w = w;
    model.h = h;
    model.copies = Math.round(copies);
    model.cols = Math.round(cols);
    model.lines = 1;
    model.auto = false;
    model.nl = false;
    // Even spacing between copies; cut lines run exactly on the photo edge and
    // split the gap in half, so a straight cut lands between two photos.
    model.gx = num(L.gap, 0, 10) || 0;
    model.gy = model.gx;
    model.pre = presetOf(model);
    if (L.paper && PAGES[L.paper]) {
      S.pw = L.paper;
      S.o = 'p';
    }
    // Center the whole block on the sheet (Epson L8050: 4/8 copies in the middle).
    S.ha = L.center ? 'c' : 'l';
    S.va = L.center ? 'c' : 't';
    S.gb = 0;
    S.gm = 'b';
  };

  addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.type !== 'easy-optic:layout') return;
    const layout = event.data.layout;
    if (!layout || typeof layout !== 'object') return;
    layoutPreset = layout;
    S.imgs.forEach((model) => { if (model.studioId) applyLayout(model); });
    list(); sync(); draw();
    if ($('#ppm').classList.contains('on')) { ppFill(); ppRender(); }
  });

  addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.type !== 'easy-optic:photo') return;
    const photo = event.data.photo;
    const id = event.data.id;
    if (typeof id !== 'string' || !id || id.length > 100) return;
    if (typeof photo !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(photo)) return;
    const current = (revisions.get(id) || 0) + 1;
    revisions.set(id, current);
    const image = new Image();
    image.onload = () => {
      if (current !== revisions.get(id)) return;
      let model = S.imgs.find((m) => m.studioId === id);
      const first = !model;
      if (!model) {
        // Same shape the tool's own import creates; no studio overrides.
        model = { src: photo, orig: photo, copies: 4, ...D, ...DS, studioId: id };
        model.pre = presetOf(model);
        S.imgs.push(model);
        S.sel = S.imgs.indexOf(model);
        S.msel = [S.sel];
      }
      clearTimeout(model.tm);
      model.tk = (model.tk || 0) + 1;
      if (model.src?.startsWith('blob:')) URL.revokeObjectURL(model.src);
      model.src = model.orig = photo;
      applyLayout(model);
      const ratio = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        model.base = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
      if (ADV.some((key) => model[key])) proc(model);
      $('#pictab').style.display = S.sel >= 0 ? '' : 'none';
      list(); sync(); draw();
      if (first) { showTab('picture', true); setZoom(Math.min(100, fitPct())); }
      if ($('#ppm').classList.contains('on')) { ppFill(); ppRender(); }
      // Rebase undo history so undo cannot restore an obsolete studio photo.
      HIST = [snapshot()]; HP = 0; updateUndoBtns();
      reply({ type: 'easy-optic:photo-loaded' });
    };
    image.onerror = () => reply({ type: 'easy-optic:photo-error' });
    image.src = photo;
  });

  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#ppm').classList.contains('on')) {
      reply({ type: 'easy-optic:minimize' });
    }
  });
  // Explicit removal/new project can be undone in the tool; the next studio update
  // recreates the linked slot rather than replacing another uploaded photograph.
  reply({ type: 'easy-optic:ready' });
})();
