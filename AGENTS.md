<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Photo rendering/print layout lives in src/lib/render.ts (pure canvas, client-side) and AI edits go through the aiEditPhoto server function; keeps edits instant and the API key server-only.
- Keep the supplied print workspace in an opaque-origin sandboxed iframe, mounted while minimized; send rendered studio photos through a source-checked message bridge to preserve independent print customization without granting uploaded scripts access to the app.
- Assign each imported studio photo an identity preserved by edits and undo; explicitly add it to print, then update only its matching entry so earlier photos and their layout settings remain independent.
- Keep skin retouching separate from geometric editing: detect normalized face landmarks plus multiclass hair/skin/clothes segmentation in a dynamically loaded browser module, derive protected regions (features, hair, beard, glasses, cap/hijab, clothes) in the pure tested face-regions module, and process masked multi-scale float pixels in a Web Worker that caches each source's regions and mask; this keeps the UI responsive and the print customization intact.
- Store face model and WASM binaries as asset pointers, using small local WASM loader scripts; this avoids oversized repository files and keeps model loading same-origin.
- Cache source-specific multi-scale pixel bands in the retouch worker; changing sliders reuses these bands without mixing photos.
- Keep crop geometry in a pure tested module and retain the pre-crop source for explicit crop re-editing; handles remain bounded and print photo identity stays unchanged.
