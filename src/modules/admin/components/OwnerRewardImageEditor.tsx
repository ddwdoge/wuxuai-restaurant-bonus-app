import { useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from "react";
import { Expand, ImagePlus, Minus, Plus, RotateCcw } from "lucide-react";
import {
  RewardImageFrame,
} from "../../../shared/components/RewardImageFrame";
import { calculateRewardImageFitZoom, DEFAULT_REWARD_IMAGE_CROP, MAX_REWARD_IMAGE_ZOOM, normalizeRewardImageCrop, type RewardImageCrop } from "../../../shared/rewardImageCrop";
import { validateOwnerRewardImage } from "../services/ownerRewardImageService";

type OwnerRewardImageEditorProps = {
  crop: RewardImageCrop;
  disabled?: boolean;
  imageUrl: string;
  label: string;
  onCropChange: (crop: RewardImageCrop) => void;
  onFileSelected: (file: File) => void;
};

const KEYBOARD_STEP = 0.02;

export function OwnerRewardImageEditor({ crop, disabled = false, imageUrl, label, onCropChange, onFileSelected }: OwnerRewardImageEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const zoomId = useId();
  const dragStartRef = useRef<{ crop: RewardImageCrop; x: number; y: number } | null>(null);
  const autoFitImageRef = useRef<string | null>(null);
  const [message, setMessage] = useState("Vorschau bereit");
  const [error, setError] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ height: number; width: number } | null>(null);
  const normalized = normalizeRewardImageCrop(crop);
  const [initialCropState, setInitialCropState] = useState({ crop: normalized, imageUrl });
  const minimumZoom = imageDimensions ? calculateRewardImageFitZoom(imageDimensions.width, imageDimensions.height) : 1;
  const maximumZoom = Math.max(normalized.zoom, Math.min(MAX_REWARD_IMAGE_ZOOM, minimumZoom * 4));
  const zoomPercent = Math.round((normalized.zoom / minimumZoom) * 100);

  function updateCrop(next: Partial<RewardImageCrop>) {
    onCropChange(normalizeRewardImageCrop({ ...normalized, ...next }));
    setMessage("Vorschau aktualisiert");
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { crop: normalized, x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start || disabled) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    updateCrop({
      positionX: start.crop.positionX - (event.clientX - start.x) / Math.max(bounds.width * start.crop.zoom, 1),
      positionY: start.crop.positionY - (event.clientY - start.y) / Math.max(bounds.height * start.crop.zoom, 1),
    });
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragStartRef.current = null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const movement = event.shiftKey ? KEYBOARD_STEP * 5 : KEYBOARD_STEP;
    if (event.key === "ArrowLeft") updateCrop({ positionX: normalized.positionX - movement });
    else if (event.key === "ArrowRight") updateCrop({ positionX: normalized.positionX + movement });
    else if (event.key === "ArrowUp") updateCrop({ positionY: normalized.positionY - movement });
    else if (event.key === "ArrowDown") updateCrop({ positionY: normalized.positionY + movement });
    else return;
    event.preventDefault();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validationError = validateOwnerRewardImage(file);
    setError(validationError);
    if (!validationError) onFileSelected(file);
  }

  function handleImageLoad(dimensions: { height: number; width: number }) {
    setImageDimensions(dimensions);
    const initialCrop = initialCropState.imageUrl === imageUrl ? initialCropState.crop : normalized;
    if (initialCropState.imageUrl !== imageUrl) setInitialCropState({ crop: initialCrop, imageUrl });
    const shouldFitInitially = initialCrop
      && initialCrop.zoom === DEFAULT_REWARD_IMAGE_CROP.zoom
      && initialCrop.positionX === DEFAULT_REWARD_IMAGE_CROP.positionX
      && initialCrop.positionY === DEFAULT_REWARD_IMAGE_CROP.positionY
      && autoFitImageRef.current !== imageUrl;
    if (!shouldFitInitially) return;
    const fittedCrop = {
      zoom: calculateRewardImageFitZoom(dimensions.width, dimensions.height),
      positionX: 0.5,
      positionY: 0.5,
    };
    autoFitImageRef.current = imageUrl;
    setInitialCropState({ crop: fittedCrop, imageUrl });
    onCropChange(fittedCrop);
    setMessage("Foto vollständig eingepasst");
    return;
  }

  return (
    <section className="owner-reward-image-editor" aria-label={`Bildausschnitt für ${label}`}>
      <div
        aria-label="Bildausschnitt. Mit Pfeiltasten oder Ziehen positionieren."
        className="owner-reward-image-editor-stage"
        onKeyDown={handleKeyDown}
        onPointerCancel={stopDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrag}
        role="group"
        tabIndex={disabled ? -1 : 0}
      >
        <RewardImageFrame alt={`Vorschau ${label}`} crop={normalized} imageUrl={imageUrl} onImageLoad={handleImageLoad} />
      </div>
      <label className="owner-reward-image-zoom" htmlFor={zoomId}>
        <span>Bildzoom</span>
        <div>
          <button aria-label="Bild verkleinern" disabled={disabled || normalized.zoom <= minimumZoom + 0.001} onClick={() => updateCrop({ zoom: Math.max(minimumZoom, normalized.zoom - 0.1) })} type="button"><Minus size={18} /></button>
          <input
            aria-valuetext={`${zoomPercent} Prozent`}
            disabled={disabled}
            id={zoomId}
            max={maximumZoom}
            min={minimumZoom}
            onChange={(event) => updateCrop({ zoom: Number(event.target.value) })}
            step="0.01"
            type="range"
            value={normalized.zoom}
          />
          <button aria-label="Bild vergrößern" disabled={disabled || normalized.zoom >= maximumZoom - 0.001} onClick={() => updateCrop({ zoom: Math.min(maximumZoom, normalized.zoom + 0.1) })} type="button"><Plus size={18} /></button>
        </div>
        <strong>{zoomPercent} %</strong>
      </label>
      <div className="owner-reward-image-editor-actions">
        <input accept="image/jpeg,image/png,image/webp" hidden onChange={handleFileChange} ref={inputRef} type="file" />
        <button className="button secondary" disabled={disabled} onClick={() => inputRef.current?.click()} type="button"><ImagePlus size={18} />Anderes Foto wählen</button>
        <button className="button secondary" disabled={disabled || !imageDimensions} onClick={() => { onCropChange({ zoom: minimumZoom, positionX: 0.5, positionY: 0.5 }); setMessage("Foto vollständig eingepasst"); }} type="button"><Expand size={18} />Einpassen</button>
        <button className="button secondary" disabled={disabled} onClick={() => { onCropChange(initialCropState.imageUrl === imageUrl ? initialCropState.crop : normalized); setMessage("Ausschnitt zurückgesetzt"); }} type="button"><RotateCcw size={18} />Ausschnitt zurücksetzen</button>
      </div>
      <p aria-live="polite" className={error ? "owner-reward-image-editor-error" : "visually-hidden"}>{error ?? message}</p>
    </section>
  );
}
