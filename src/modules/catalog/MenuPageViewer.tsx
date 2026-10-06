import { useCallback, useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { fetchMenuMedia, type MenuPage } from "./menuCatalogService";
import { menuMessage } from "./menuCatalogMessages";

type Props = {
  page: MenuPage;
  language: string;
  context: { kind: "owner"; restaurantId: string } | { kind: "customer"; slug: string; token: string; version: number };
};

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function PdfPages({ url, zoom, filename, onError }: { url: string; zoom: number; filename: string; onError: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const host = container.current;
    const loading = getDocument(url);
    const render = async () => {
      const pdf = await loading.promise;
      if (cancelled) return;
      const target = host;
      if (!target) return;
      target.replaceChildren();
      for (let index = 1; index <= pdf.numPages; index += 1) {
        const page = await pdf.getPage(index);
        if (cancelled) return;
        const original = page.getViewport({ scale: 1 });
        const scale = Math.min(2, Math.max(0.1, target.clientWidth / original.width)) * zoom;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute("aria-label", `${filename}, ${index} / ${pdf.numPages}`);
        target.append(canvas);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("PDF canvas unavailable");
        await page.render({ canvasContext: context, viewport }).promise;
        canvas.dataset.rendered = "true";
      }
    };
    void render().catch(() => { if (!cancelled) onError(); });
    return () => { cancelled = true; void loading.destroy(); host?.replaceChildren(); };
  }, [url, zoom, filename, onError]);
  return <div className="menu-pdf-pages" ref={container} role="img" aria-label={filename} />;
}

export function MenuPageViewer({ page, language, context }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const handlePdfError = useCallback(() => setError(true), []);
  const contextKey = JSON.stringify(context);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setError(false);
    setZoom(1);
    const params = context.kind === "owner"
      ? { kind: "owner" as const, restaurantId: context.restaurantId, pageId: page.id }
      : { kind: "customer" as const, slug: context.slug, token: context.token, pageId: page.id, version: context.version };
    void fetchMenuMedia(params).then((blob) => {
      if (cancelled || blob.type !== page.mime_type) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  // The serialized context makes tenant/token/version changes invalidate a loaded blob.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id, page.mime_type, contextKey]);

  const m = (key: Parameters<typeof menuMessage>[1]) => menuMessage(language, key);
  return <div className="menu-media-viewer">
    <div className="menu-media-controls">
      <span>{page.filename}</span>
      <button aria-label={m("zoomOut")} disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - 0.25))} type="button">−</button>
      <button aria-label={m("zoomIn")} disabled={zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + 0.25))} type="button">+</button>
    </div>
    {!url && !error ? <p role="status">{m("loading")}</p> : null}
    {error ? <p role="alert">{m("error")}</p> : null}
    {url ? <div className="menu-media-scroll">
      {page.mime_type === "image/jpeg"
        ? <img alt={page.filename} src={url} style={{ width: `${zoom * 100}%` }} />
        : <PdfPages url={url} zoom={zoom} filename={page.filename} onError={handlePdfError} />}
    </div> : null}
  </div>;
}
