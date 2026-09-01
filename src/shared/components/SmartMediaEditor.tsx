import { useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { Expand, Minus, Plus, RotateCcw } from "lucide-react";
import {
  calculateMediaFitZoom,
  DEFAULT_MEDIA_ASPECT_RATIO,
  MAX_MEDIA_ZOOM,
  normalizeMediaPresentation,
  type MediaDimensions,
  type MediaPresentation,
} from "../mediaPresentation";
import { SmartMediaFrame } from "./SmartMediaFrame";

type SmartMediaEditorProps = {
  aspectRatio?: number;
  disabled?: boolean;
  imageUrl: string;
  label: string;
  onPresentationChange: (presentation: MediaPresentation) => void;
  presentation: MediaPresentation;
};

type PointerPosition = { x: number; y: number };

const KEYBOARD_STEP = 0.02;

function pointerDistance(left: PointerPosition, right: PointerPosition) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function SmartMediaEditor({
  aspectRatio = DEFAULT_MEDIA_ASPECT_RATIO,
  disabled = false,
  imageUrl,
  label,
  onPresentationChange,
  presentation,
}: SmartMediaEditorProps) {
  const pointersRef = useRef(new Map<number, PointerPosition>());
  const dragRef = useRef<{ presentation: MediaPresentation; point: PointerPosition } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const autoFitImageRef = useRef<string | null>(null);
  const normalized = normalizeMediaPresentation(presentation);
  const [imageDimensions, setImageDimensions] = useState<MediaDimensions | null>(null);
  const [savedState, setSavedState] = useState({ imageUrl, presentation: normalized });
  const [message, setMessage] = useState("Vorschau bereit");
  const minimumZoom = imageDimensions
    ? calculateMediaFitZoom(imageDimensions.width, imageDimensions.height, aspectRatio)
    : 1;
  const maximumZoom = Math.max(minimumZoom, Math.min(MAX_MEDIA_ZOOM, minimumZoom * 4));
  const zoomPercent = Math.round((normalized.zoom / minimumZoom) * 100);
  const qualityWarning = imageDimensions && (imageDimensions.width < 1280 || imageDimensions.height < 720)
    ? "Für ein besonders scharfes Ergebnis empfehlen wir mindestens 1280 × 720 Pixel."
    : null;

  function updatePresentation(next: Partial<MediaPresentation>) {
    const normalizedNext = normalizeMediaPresentation({ ...normalized, ...next });
    normalizedNext.zoom = Math.min(maximumZoom, Math.max(minimumZoom, normalizedNext.zoom));
    onPresentationChange(normalizedNext);
    setMessage("Vorschau aktualisiert");
  }

  function beginSinglePointer(point: PointerPosition) {
    dragRef.current = { point, presentation: normalized };
    pinchRef.current = null;
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pointers = [...pointersRef.current.values()];
    if (pointers.length === 1) beginSinglePointer(pointers[0]);
    if (pointers.length === 2) {
      pinchRef.current = { distance: pointerDistance(pointers[0], pointers[1]), zoom: normalized.zoom };
      dragRef.current = null;
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pointers = [...pointersRef.current.values()];
    if (pointers.length >= 2 && pinchRef.current) {
      const distance = pointerDistance(pointers[0], pointers[1]);
      if (pinchRef.current.distance > 0) {
        updatePresentation({ zoom: pinchRef.current.zoom * (distance / pinchRef.current.distance) });
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag || pointers.length !== 1) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    updatePresentation({
      positionX: drag.presentation.positionX - (event.clientX - drag.point.x) / Math.max(bounds.width * zoomPercent / 100, 1),
      positionY: drag.presentation.positionY - (event.clientY - drag.point.y) / Math.max(bounds.height * zoomPercent / 100, 1),
    });
  }

  function stopPointer(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointersRef.current.delete(event.pointerId);
    const pointers = [...pointersRef.current.values()];
    if (pointers.length === 1) beginSinglePointer(pointers[0]);
    else {
      dragRef.current = null;
      pinchRef.current = null;
    }
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.002);
    updatePresentation({ zoom: normalized.zoom * factor });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const movement = event.shiftKey ? KEYBOARD_STEP * 5 : KEYBOARD_STEP;
    if (event.key === "ArrowLeft") updatePresentation({ positionX: normalized.positionX - movement });
    else if (event.key === "ArrowRight") updatePresentation({ positionX: normalized.positionX + movement });
    else if (event.key === "ArrowUp") updatePresentation({ positionY: normalized.positionY - movement });
    else if (event.key === "ArrowDown") updatePresentation({ positionY: normalized.positionY + movement });
    else if (event.key === "+" || event.key === "=") updatePresentation({ zoom: normalized.zoom + minimumZoom * 0.1 });
    else if (event.key === "-") updatePresentation({ zoom: normalized.zoom - minimumZoom * 0.1 });
    else return;
    event.preventDefault();
  }

  function handleImageLoad(dimensions: MediaDimensions) {
    setImageDimensions(dimensions);
    const fitZoom = calculateMediaFitZoom(dimensions.width, dimensions.height, aspectRatio);
    if (savedState.imageUrl !== imageUrl) {
      const fitted = { zoom: fitZoom, positionX: 0.5, positionY: 0.5 };
      setSavedState({ imageUrl, presentation: fitted });
      if (autoFitImageRef.current !== imageUrl) {
        autoFitImageRef.current = imageUrl;
        onPresentationChange(fitted);
        setMessage("Bild automatisch eingepasst");
      }
    }
  }

  return (
    <section className="smart-media-editor" aria-label={`Bild anpassen: ${label}`}>
      <div className="smart-media-editor-heading">
        <strong>Bild anpassen</strong>
        <span>{zoomPercent} %</span>
      </div>
      <p className="smart-media-editor-helper">Ziehe das Bild zum Positionieren. Mit zwei Fingern kannst du zoomen.</p>
      <div
        aria-label="Bildausschnitt. Ziehen positioniert das Bild. Zwei Finger oder Plus und Minus ändern den Zoom."
        className="smart-media-editor-stage"
        onKeyDown={handleKeyDown}
        onPointerCancel={stopPointer}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPointer}
        onWheel={handleWheel}
        role="group"
        tabIndex={disabled ? -1 : 0}
      >
        <SmartMediaFrame
          alt={`Vorschau ${label}`}
          aspectRatio={aspectRatio}
          imageUrl={imageUrl}
          onImageLoad={handleImageLoad}
          presentation={normalized}
        />
      </div>
      {qualityWarning ? <p className="smart-media-editor-quality" role="status">{qualityWarning}</p> : null}
      <div className="smart-media-editor-controls" aria-label="Bildzoom">
        <button aria-label="Bild verkleinern" disabled={disabled || normalized.zoom <= minimumZoom + 0.001} onClick={() => updatePresentation({ zoom: normalized.zoom - minimumZoom * 0.1 })} type="button"><Minus size={18} /></button>
        <span aria-live="polite">{zoomPercent} %</span>
        <button aria-label="Bild vergrößern" disabled={disabled || normalized.zoom >= maximumZoom - 0.001} onClick={() => updatePresentation({ zoom: normalized.zoom + minimumZoom * 0.1 })} type="button"><Plus size={18} /></button>
      </div>
      <div className="smart-media-editor-actions">
        <button className="button secondary" disabled={disabled || !imageDimensions} onClick={() => { onPresentationChange({ zoom: minimumZoom, positionX: 0.5, positionY: 0.5 }); setMessage("Bild automatisch eingepasst"); }} type="button"><Expand size={18} />Automatisch einpassen</button>
        <button className="button secondary" disabled={disabled} onClick={() => { onPresentationChange(savedState.imageUrl === imageUrl ? savedState.presentation : normalized); setMessage("Gespeicherter Ausschnitt wiederhergestellt"); }} type="button"><RotateCcw size={18} />Zurücksetzen</button>
      </div>
      <p aria-live="polite" className="visually-hidden">{message}</p>
    </section>
  );
}
