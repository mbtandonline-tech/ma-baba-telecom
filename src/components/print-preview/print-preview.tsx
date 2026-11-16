import { useEffect, useRef, useState } from "react";
import { Expand, Loader2, Minus, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import toolHtml from "./print-tool.html?raw";
import bridge from "./photo-bridge.js?raw";

const documentHtml = toolHtml.replace("</script></body>", `</script><script>${bridge}</script></body>`);

export function PrintPreview({ state, photo, onStateChange }: {
  state: "closed" | "open" | "minimized";
  photo: { id: string; photo: string } | null;
  onStateChange: (state: "closed" | "open" | "minimized") => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const minimize = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = state !== "closed";
  useEffect(() => {
    if (!active) { setReady(false); setLoaded(false); setFailed(false); }
  }, [active]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (!frame.current?.contentWindow || event.source !== frame.current.contentWindow) return;
      if (event.data?.type === "easy-optic:ready") setReady(true);
      if (event.data?.type === "easy-optic:photo-loaded") { setLoaded(true); setFailed(false); }
      if (event.data?.type === "easy-optic:photo-error") setFailed(true);
      if (event.data?.type === "easy-optic:minimize") onStateChange("minimized");
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onStateChange]);
  useEffect(() => {
    if (!ready || !photo) return;
    frame.current?.contentWindow?.postMessage({ type: "easy-optic:photo", photo: photo.photo, id: photo.id }, "*");
  }, [ready, photo]);
  useEffect(() => {
    if (state !== "open") return;
    const previous = document.activeElement;
    minimize.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onStateChange("minimized");
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [state, onStateChange]);

  if (!active) return null;
  return <>
    <div hidden={state !== "open"} role="dialog" aria-modal="true" aria-label="Print Preview" className="fixed inset-0 z-50 flex flex-col bg-background data-[minimized=true]:hidden" data-minimized={state !== "open"}>
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-card px-3">
        <h2 className="flex items-center gap-2 font-semibold"><Printer className="size-4 text-primary" /> Print Preview</h2>
        <div className="flex items-center gap-2">
          {!loaded && !failed && <Loader2 aria-label="ছবি লোড হচ্ছে" className="size-4 animate-spin text-muted-foreground" />}
          {failed && <span role="alert" className="text-sm text-destructive">ছবি লোড হয়নি</span>}
          <Button ref={minimize} size="sm" variant="secondary" title="মিনিমাইজ করে ছবি এডিট করুন" onClick={() => onStateChange("minimized")}><Minus /> মিনিমাইজ</Button>
          <Button size="icon" variant="ghost" aria-label="Print Preview বন্ধ করুন" title="বন্ধ করুন" onClick={() => onStateChange("closed")}><X /></Button>
        </div>
      </header>
      <iframe ref={frame} title="পাসপোর্ট ফটো প্রিন্ট লেআউট" srcDoc={documentHtml} sandbox="allow-scripts allow-modals allow-downloads" className="min-h-0 w-full flex-1 border-0 bg-paper" />
    </div>
    {state === "minimized" && <Button className="fixed bottom-4 right-4 z-40 shadow-lg" onClick={() => onStateChange("open")}><Expand /> Print Preview</Button>}
  </>;
}