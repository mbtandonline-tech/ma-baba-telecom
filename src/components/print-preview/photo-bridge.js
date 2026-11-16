// Runs only inside the isolated uploaded print workspace.
// The studio sends only the edited photo; every layout/paper default stays
// exactly as the tool itself defines them.
(() => {
  const revisions = new Map();
  const reply = (data) => parent.postMessage(data, '*');
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
